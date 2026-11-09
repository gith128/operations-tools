// SA eBikes Operations Tools — shared browser helper (v3.2: admin password)
// Used by every page: staff PIN, talking to /api/ops, and polite polling.
(function () {
  const API = '/api/ops';
  const PIN_KEY = 'saebikes_staff_pin_v1';

  class OpsError extends Error {
    constructor(status, message, code, data) { super(message); this.status = status; this.code = code || ''; this.data = data || {}; }
    get isAuth() { return this.status === 401 || this.status === 403; }
    // Rejections we should not retry (bad request, duplicate, out of service…)
    get isFinal() { return this.status >= 400 && this.status < 500 && !this.isAuth && this.status !== 408 && this.status !== 429; }
  }

  function storedPin() { try { return localStorage.getItem(PIN_KEY) || ''; } catch { return ''; } }
  function askPin(message) {
    const pin = (window.prompt(message || 'Staff PIN:') || '').trim();
    if (pin) { try { localStorage.setItem(PIN_KEY, pin); } catch {} }
    return pin;
  }
  function forgetPin() { try { localStorage.removeItem(PIN_KEY); } catch {} }

  // The admin password (v3.2): asked for only when an Admin request needs it, and kept for this
  // browser tab only, so Admin locks again when the tab is closed (or Lock is tapped).
  const ADMIN_KEY = 'saebikes_admin_pw';
  function storedAdmin() { try { return sessionStorage.getItem(ADMIN_KEY) || ''; } catch { return ''; } }
  function askAdmin(message) {
    const pw = (window.prompt(message || 'Admin password:') || '').trim();
    if (pw) { try { sessionStorage.setItem(ADMIN_KEY, pw); } catch {} }
    return pw;
  }
  function forgetAdmin() { try { sessionStorage.removeItem(ADMIN_KEY); } catch {} }

  // interactive=false is used by background polls: they never pop up a PIN prompt.
  // v3.3: every request has a time limit (15 s to save, 20 s to load) instead of waiting as long as
  // the browser does. No answer means "not confirmed": the save may or may not have gone through.
  const NOT_CONFIRMED = 'Not confirmed: there was no answer, so it may or may not have saved. Try again when you have signal; it won\'t make a duplicate.';
  async function request(method, params, body, { interactive = true, timeoutMs } = {}) {
    const url = API + (params ? '?' + new URLSearchParams(params) : '');
    for (let attempt = 0; attempt < 3; attempt++) {
      let pin = storedPin();
      if (!pin) {
        if (!interactive) throw new OpsError(401, 'Staff PIN needed', 'pin-required');
        pin = askPin('Staff PIN:');
        if (!pin) throw new OpsError(401, 'Staff PIN needed', 'pin-required');
      }
      const opts = { method, headers: { 'x-saebikes-staff-pin': pin }, cache: 'no-store' };
      const adminPw = storedAdmin();
      if (adminPw) opts.headers['x-saebikes-admin-password'] = adminPw;
      if (body) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
      let res;
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const limit = timeoutMs || (method === 'GET' ? 20000 : 15000);
      const timer = ctl ? setTimeout(() => ctl.abort(), limit) : null;
      if (ctl) opts.signal = ctl.signal;
      try { res = await fetch(url, opts); }
      catch (e) { throw new OpsError(0, method === 'GET' ? 'No connection' : NOT_CONFIRMED, e && e.name === 'AbortError' ? 'timeout' : 'network'); }
      finally { if (timer) clearTimeout(timer); }
      let data = {};
      try { data = await res.json(); } catch {}
      if (res.ok) return data;
      if (res.status === 403 && data.code === 'pin-wrong') {
        forgetPin();
        if (!interactive) throw new OpsError(403, 'Staff PIN incorrect', 'pin-wrong');
        if (!askPin('That PIN was not accepted. Staff PIN:')) throw new OpsError(403, 'Staff PIN incorrect', 'pin-wrong');
        continue;
      }
      if (res.status === 401 && interactive) { forgetPin(); continue; }
      if (res.status === 403 && (data.code === 'admin-required' || data.code === 'admin-wrong')) {
        // Admin loads several things at once: answer the password prompt once, and let the
        // other requests (sent before it was typed) retry with it instead of asking again.
        const now = storedAdmin();
        if (now && now !== adminPw) continue;
        forgetAdmin();
        if (interactive && askAdmin(data.code === 'admin-wrong' ? 'That admin password was not accepted. Admin password:' : 'Admin password:')) continue;
        throw new OpsError(403, data.code === 'admin-wrong' ? 'Admin password incorrect' : 'Admin password needed', data.code, data);
      }
      let msg = data.error || ('Request failed (' + res.status + ')');
      if (data.fix) msg += ' — ' + data.fix;
      throw new OpsError(res.status, msg, data.code, data);
    }
    throw new OpsError(403, 'Staff PIN incorrect', 'pin-wrong');
  }

  // Polls `task` every `interval` ms while the page is visible.
  // - Stops completely when the phone locks or the tab is in the background.
  // - Slows to `idleInterval` if nobody has touched the screen for `idleAfter` ms.
  // - Backs off after errors so a dead connection isn't hammered.
  function poller(task, { interval, idleInterval = 60000, idleAfter = 10 * 60000 }) {
    let timer = null, running = false, stopped = true, failures = 0, lastTouch = Date.now();
    const idle = () => Date.now() - lastTouch > idleAfter;
    const delay = () => {
      let d = idle() ? Math.max(interval, idleInterval) : interval;
      if (failures) d = Math.min(60000, d * Math.pow(2, Math.min(failures, 3)));
      return d;
    };
    function schedule() { clearTimeout(timer); if (!stopped && !document.hidden) timer = setTimeout(tick, delay()); }
    async function tick() {
      if (stopped || document.hidden || running) return;
      running = true;
      try { await task(); failures = 0; } catch { failures++; }
      finally { running = false; schedule(); }
    }
    function now() { clearTimeout(timer); tick(); }
    ['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, () => {
      const wasIdle = idle(); lastTouch = Date.now(); if (wasIdle && !stopped) now();
    }, { passive: true }));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearTimeout(timer);
      else if (!stopped) { lastTouch = Date.now(); now(); }
    });
    return { start() { stopped = false; now(); }, stop() { stopped = true; clearTimeout(timer); }, now };
  }

  const pad = n => String(n).padStart(2, '0');
  function todayISO(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDaysISO(iso, n) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return todayISO(d); }
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function displayDate(iso) { const [y, m, d] = iso.split('-').map(Number); return d + ' ' + MONTHS[m - 1] + ' ' + y; }

  // Whole months between a purchase date and today (a bike bought 15 Jan is 1 month old on 15 Feb).
  function ageMonths(iso) {
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(Number), t = new Date();
    let months = (t.getFullYear() - y) * 12 + (t.getMonth() + 1 - m);
    if (t.getDate() < d) months--;
    return Math.max(0, months);
  }
  function ageLabel(iso) {
    const mo = ageMonths(iso);
    if (mo == null) return 'Age unknown';
    const yrs = Math.floor(mo / 12), rem = mo % 12;
    return mo + ' month' + (mo === 1 ? '' : 's') + (yrs ? ' (' + yrs + ' yr' + (rem ? ' ' + rem + ' mo' : '') + ')' : '');
  }

  window.Ops = {
    ageMonths, ageLabel,
    OpsError,
    view: (name, opts) => request('GET', { view: name }, null, opts),
    get: (params, opts) => request('GET', params, null, opts),
    // A save with no answer is tried once more, quietly, a few seconds later (every save is safe to
    // repeat). If that gets no answer either, the error says it isn't confirmed. The Group Scanner
    // passes { retry: false }: its own queue keeps retrying.
    act: async (action, payload, opts = {}) => {
      const body = Object.assign({ action }, payload || {});
      try { return await request('POST', null, body, opts); }
      catch (e) {
        if (e.status !== 0 || opts.retry === false) throw e;
        await new Promise(r => setTimeout(r, 3000));
        return request('POST', null, body, opts);
      }
    },
    NOT_CONFIRMED,
    forgetPin, poller, todayISO, addDaysISO, displayDate, MONTHS,
    lockAdmin: forgetAdmin, adminUnlocked: () => !!storedAdmin(),
    uid: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
    downloadText(content, filename, type) {
      const blob = new Blob([content], { type: type || 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.style.display = 'none';
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
    },
    csvCell: v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"',
  };
})();
