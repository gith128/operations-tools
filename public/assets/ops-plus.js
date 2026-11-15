// SA eBikes Operations Tools v3.2: who's using this phone, typed bike IDs, the M-check list and phone checks.
// Loaded after ops-client.js on every tool page.
(() => {
  const KEY = 'saeb-me';
  let me = null;
  try { me = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch {}
  let members = null;
  const listeners = [];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function save(m) {
    me = m ? { id: m.id, name: m.name, initials: m.initials } : null;
    try { me ? localStorage.setItem(KEY, JSON.stringify(me)) : localStorage.removeItem(KEY); } catch {}
    renderButton();
    listeners.forEach(f => { try { f(me); } catch {} });
  }
  async function load() {
    try { members = (await Ops.view('team')).members || []; } catch { members = members || []; }
    // Keep this phone's name up to date if it was edited in Admin.
    if (me) { const m = members.find(x => x.id === me.id); if (m && (m.name !== me.name || m.initials !== me.initials)) save(m); }
    return members;
  }

  function injectCSS() {
    const st = document.createElement('style');
    st.textContent = `
.tm-btn{display:inline-flex;align-items:center;gap:6px;margin:0 0 16px 6px;padding:9px 12px;border-radius:999px;background:var(--bg-elev,#fff);border:1.5px solid var(--border,#e4ded2);color:var(--text,#1f2428);font:800 12px 'Syne',sans-serif;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.tm-btn.unset{border-color:rgba(212,138,47,.6);color:#9a5a12;background:rgba(212,138,47,.08)}
.tm-btn.floating{position:fixed;top:calc(10px + env(safe-area-inset-top,0px));right:12px;z-index:50;margin:0}
.tm-back{position:fixed;inset:0;background:rgba(20,22,24,.45);display:none;align-items:flex-end;justify-content:center;z-index:200}
.tm-back.open{display:flex}
.tm-sheet{background:var(--bg-elev,#fff);width:100%;max-width:480px;border-radius:20px 20px 0 0;padding:20px 18px calc(20px + env(safe-area-inset-bottom,0px));max-height:80vh;overflow-y:auto}
.tm-sheet h3{font:800 19px 'Syne',sans-serif;margin:0 0 4px}
.tm-sub{font:400 12px 'DM Mono',monospace;color:var(--text-dim,#5a6269);margin-bottom:14px}
.tm-item{display:flex;justify-content:space-between;align-items:center;width:100%;padding:13px 14px;margin-bottom:8px;border-radius:12px;border:1.5px solid var(--border,#e4ded2);background:var(--bg-elev,#fff);font:700 15px 'Syne',sans-serif;color:var(--text,#1f2428);cursor:pointer;text-align:left}
.tm-item.on{border-color:var(--accent,var(--accent));background:var(--accent-soft,var(--accent-soft))}
.tm-item span{font:700 12px 'DM Mono',monospace;color:var(--text-dim,#5a6269)}
.tm-note{font-size:12px;color:var(--text-dim,#5a6269);margin:10px 0}
.tm-note a{color:var(--accent-text,var(--accent-text))}
.tm-skip{width:100%;padding:12px;border-radius:12px;border:1.5px solid var(--border,#e4ded2);background:transparent;font:700 14px 'Syne',sans-serif;color:var(--text-dim,#5a6269);cursor:pointer}`;
    document.head.appendChild(st);
  }
  function renderButton() {
    const b = document.getElementById('tmBtn');
    if (!b) return;
    b.textContent = me ? '👤 ' + me.initials : '👤 Who are you?';
    b.classList.toggle('unset', !me);
  }
  function mount() {
    const b = document.createElement('button');
    b.id = 'tmBtn'; b.className = 'tm-btn'; b.type = 'button';
    b.setAttribute('aria-label', 'Who is using this phone');
    b.onclick = () => openPicker(false);
    // Beside the Back and Help buttons at the top of the page; floating on the home screen.
    const links = document.querySelectorAll('a.back-home');
    if (links.length) links[links.length - 1].after(b);
    else { b.classList.add('floating'); document.body.appendChild(b); }
    const back = document.createElement('div');
    back.id = 'tmBack'; back.className = 'tm-back';
    back.onclick = e => { if (e.target === back) closePicker(); };
    back.innerHTML = '<div class="tm-sheet"><h3>Who\'s using this phone?</h3><div class="tm-sub">Your initials go on reports, scans and moves automatically. You can still change them on any form.</div><div id="tmList"></div></div>';
    document.body.appendChild(back);
    renderButton();
  }
  async function openPicker(first) {
    const list = document.getElementById('tmList');
    document.getElementById('tmBack').classList.add('open');
    list.innerHTML = '<div class="tm-sub">Loading…</div>';
    await load();
    const active = members.filter(m => !m.retired);
    list.innerHTML = active.map(m => '<button class="tm-item' + (me && me.id === m.id ? ' on' : '') + '" data-id="' + esc(m.id) + '">' + esc(m.name) + '<span>' + esc(m.initials) + '</span></button>').join('') +
      '<div class="tm-note">' + (active.length ? 'Not on the list? ' : 'Nobody is on the team list yet. ') + 'Add names under <a href="/admin#team">Admin → Team</a>.</div>' +
      (me ? '<button class="tm-skip" data-clear="1">Clear my name from this phone</button>' : '<button class="tm-skip" data-skip="1">' + (first ? 'Not now' : 'Close') + '</button>');
    list.querySelectorAll('.tm-item').forEach(el => el.onclick = () => { save(members.find(m => m.id === el.dataset.id)); closePicker(); });
    const skip = list.querySelector('[data-skip]'); if (skip) skip.onclick = closePicker;
    const clr = list.querySelector('[data-clear]'); if (clr) clr.onclick = () => { save(null); closePicker(); };
  }
  function closePicker() { const b = document.getElementById('tmBack'); if (b) b.classList.remove('open'); }

  async function init() {
    injectCSS(); mount();
    await load();
    // First time on this phone: ask, if there's a team list to pick from. Not again this session if skipped.
    let asked = false; try { asked = sessionStorage.getItem('saeb-me-asked') === '1'; } catch {}
    if (!me && members.some(m => !m.retired) && !asked) { try { sessionStorage.setItem('saeb-me-asked', '1'); } catch {} openPicker(true); }
  }

  window.Team = {
    me: () => me,
    initials: () => (me ? me.initials : ''),
    name: () => (me ? me.name : ''),
    onChange: f => listeners.push(f),
    open: () => openPicker(false),
    refresh: load,
  };

  // Typed bike IDs: leading zeros and punctuation don't need typing. "12", "EB12" and "eb-12"
  // all find EB-012 when it's the only match. The full registered ID is what gets used.
  window.BikeIds = {
    match(typed, ids) {
      const t = String(typed || '').trim().toUpperCase();
      if (!t) return { id: '' };
      const list = [...new Set((ids || []).filter(Boolean))];
      if (list.includes(t)) return { id: t };
      const norm = s => s.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/\d+/g, d => String(parseInt(d, 10)));
      const nt = norm(t);
      let hits = list.filter(id => norm(id) === nt);
      if (!hits.length && /^\d+$/.test(t)) {
        const n = String(parseInt(t, 10));
        hits = list.filter(id => { const ds = id.match(/\d+/g); return ds && ds.length === 1 && String(parseInt(ds[0], 10)) === n; });
      }
      if (hits.length === 1) return { id: hits[0], expanded: true };
      if (hits.length > 1) return { id: t, ambiguous: hits };
      return { id: t };
    },
  };

  // The M-check list, in M-check order. Keep in step with MCHECK_ITEMS in netlify/lib/ops-core.mjs.
  window.MCheck = {
    items: [
      { key: 'front', label: 'Front wheel and tyre' }, { key: 'steering', label: 'Steering and handlebars', critical: true },
      { key: 'brakes', label: 'Brakes, front and rear', critical: true }, { key: 'frame', label: 'Frame and fork', critical: true },
      { key: 'drive', label: 'Pedals, cranks and chain' }, { key: 'saddle', label: 'Saddle and seatpost' },
      { key: 'rear', label: 'Rear wheel, tyre and gears' }, { key: 'battery', label: 'Battery: seated, locked, charged', critical: true },
      { key: 'motor', label: 'Motor assist and display' }, { key: 'lights', label: 'Lights, bell and kickstand' },
    ],
    label(key) { const i = this.items.find(x => x.key === key); return i ? i.label : key; },
  };

  // Phone checks. Rezdy and agents sometimes tag Australian numbers as +1, or leave off the country code.
  // Uses libphonenumber (Google's rules for every country), loaded from /assets/vendor/libphonenumber-min.js
  // on the pages that handle phone numbers. Returns the number to use and what, if anything, was changed.
  window.Phones = {
    fix(raw) {
      const L = window.libphonenumber;
      const orig = String(raw || '').trim();
      if (!orig) return { phone: '' };
      if (!L) return { phone: orig };
      let s = orig.replace(/[^\d+]/g, '');
      if (s.startsWith('00')) s = '+' + s.slice(2);
      const ok = (n, c) => { try { const p = L.parsePhoneNumberFromString(n, c); return p && p.isValid() ? p : null; } catch { return null; } };
      const done = (p, why) => ({ phone: p.number, display: p.formatInternational(), country: p.country || '', note: why || '', from: why ? orig : '' });
      let p;
      if (s.startsWith('+')) {
        if ((p = ok(s))) return done(p, '');
        if (/^\+610/.test(s) && (p = ok('+61' + s.slice(4)))) return done(p, 'extra 0 removed after +61');
        // Tagged with a country it doesn't fit (usually +1), but the rest is an Australian number.
        const m = s.match(/^\+(1|\d{2,3}?)(0\d{8,9})$/) || s.match(/^\+1(\d{9,10})$/);
        const rest = m ? (m[2] || m[1]) : '';
        const home = window.Brand ? Brand.country() : 'AU';
        if (rest && (p = ok(rest.startsWith('0') ? rest : '0' + rest, home))) return done(p, 'given as ' + s.slice(0, s.length - rest.length) + ', but it is ' + (home === 'AU' ? 'an Australian' : 'a local') + ' number');
        return { phone: orig, check: true };
      }
      if (/^61\d{9}$/.test(s) && (p = ok('+' + s))) return done(p, '+ added');
      // A local number, read as one from the business's country (Admin → Configuration → Business).
      const region = window.Brand ? Brand.country() : 'AU';
      if ((p = ok(s, region))) return done(p, region === 'AU' ? '+61 added' : 'country code added');
      if ((p = ok('+' + s))) return done(p, '+ added');
      return { phone: orig, check: true };
    },
    // The fields the server keeps for a contact, from a raw number.
    fields(raw) {
      const r = this.fix(raw);
      return { phone: r.phone, phoneDisplay: r.display || '', phoneFrom: r.from || '', phoneNote: r.note || '', phoneCheck: !!r.check };
    },
  };

  // Locations, from the Asset Register's list. Pages call Locs.set(view.locations) when they load it.
  // kind: hire (bookings start there), delivery (to the customer), collection (drop-off point), storage.
  window.Locs = {
    list: [],
    set(list) { if (Array.isArray(list) && list.length) this.list = list; return this; },
    get(code) { return this.list.find(l => l.code === code) || null; },
    name(code) { const l = this.get(code); return l ? l.name : code || ''; },
    kind(code) { const l = this.get(code); return l ? l.kind : ''; },
    isDelivery(code) { return this.kind(code) === 'delivery'; },
    // Where hires can be: hire sites, then home delivery.
    hire() { return this.list.filter(l => !l.retired && (l.kind === 'hire' || l.kind === 'delivery')).sort((a, b) => (a.kind === 'delivery') - (b.kind === 'delivery')); },
    collection() { return this.list.filter(l => !l.retired && l.kind === 'collection'); },
    icon(code) { return this.isDelivery(code) ? '🚚' : '📍'; },
    // A Rezdy product name to a location: the first hire site or delivery whose matching words appear in it.
    // '' when there's no product; '?' when nothing matches.
    fromProduct(product) {
      const p = String(product || '').toLowerCase();
      if (!p) return '';
      const hit = this.hire().find(l => (l.match || []).some(w => w && p.includes(w)));
      return hit ? hit.code : '?';
    },
    // Every location a product name matches, with the word that matched, in the order used above
    // (the first one wins). More than one means the product is ambiguous. `list` can be a draft
    // set of locations, to try new matching words before saving them.
    matchAll(product, list) {
      const p = String(product || '').toLowerCase();
      const pool = (list || this.list).filter(l => !l.retired && (l.kind === 'hire' || l.kind === 'delivery')).sort((a, b) => (a.kind === 'delivery') - (b.kind === 'delivery'));
      const out = [];
      for (const l of pool) { const w = (l.match || []).find(x => x && p.includes(x)); if (w) out.push({ code: l.code, word: w }); }
      return out;
    },
  };

  // ── Messages to guests ────────────────────────────────────────────────────
  // One sheet for Contacts and the Group Scanner: choose a message (or a link), check the wording,
  // send by Text or WhatsApp, then say whether it went. Each is logged on the booking: opened, then
  // sent or not sent. Msg.open(contact, { suggest }) for one guest; Msg.broadcast(list) for several.
  const MCSS = `
.msg-back{position:fixed;inset:0;background:rgba(20,22,24,.45);display:none;align-items:flex-end;justify-content:center;z-index:210}
.msg-back.open{display:flex}
.msg-sheet{background:var(--bg-elev,#fff);width:100%;max-width:480px;border-radius:20px 20px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom,0px));max-height:86vh;overflow-y:auto;font-family:'Syne',sans-serif;color:var(--text,#1f2428)}
.msg-sheet h3{font-size:18px;font-weight:800;margin:0 0 4px}
.msg-sub{font-family:'DM Mono',monospace;font-size:11px;color:var(--text-dim,#5a6269);margin-bottom:12px}
.msg-opt{display:block;width:100%;text-align:left;padding:12px 14px;margin-bottom:8px;border-radius:12px;border:1.5px solid var(--border,#e4ded2);background:var(--bg-elev,#fff);font:700 14px 'Syne',sans-serif;color:var(--text,#1f2428);cursor:pointer}
.msg-opt.sug{border-color:var(--accent,var(--accent));background:var(--accent-soft,var(--accent-soft))}
.msg-opt small{display:block;font-weight:400;font-size:12px;color:var(--text-dim,#5a6269);margin-top:3px;line-height:1.4}
.msg-tag{font-family:'DM Mono',monospace;font-size:10px;color:var(--accent-text,var(--accent-text));margin-left:6px}
.msg-h{font-family:'DM Mono',monospace;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-dim,#5a6269);margin:14px 0 8px}
.msg-txt{width:100%;min-height:150px;font:400 14px/1.5 'Syne',sans-serif;padding:10px 12px;border-radius:12px;border:1.5px solid var(--border,#e4ded2);background:var(--bg-elev,#fff);color:var(--text,#1f2428)}
.msg-in{width:100%;font:400 14px 'Syne',sans-serif;padding:11px 12px;border-radius:12px;border:1.5px solid var(--border,#e4ded2);margin-bottom:10px;background:var(--bg-elev,#fff);color:var(--text,#1f2428)}
.msg-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
.msg-btn{padding:13px;border-radius:12px;border:none;font:800 14px 'Syne',sans-serif;cursor:pointer;text-align:center;text-decoration:none;display:block}
.msg-btn.sms{background:#e8f3dc;color:#355a14}.msg-btn.wa{background:#25D366;color:#fff}.msg-btn.ok{background:var(--accent,var(--accent));color:#fff}
.msg-btn.no{background:#fbe9e7;color:#a33a35}.msg-btn.plain{background:var(--bg-soft,#f2efe8);color:var(--text,#1f2428)}
.msg-pick{display:flex;align-items:center;gap:10px;padding:10px 4px;border-bottom:1px solid var(--border,#e4ded2);font-size:14px}
.msg-pick input{width:20px;height:20px;accent-color:var(--accent)}
.msg-pick .dim{font-family:'DM Mono',monospace;font-size:11px;color:var(--text-muted,#8b8f93)}`;
  let msgCache = null;
  async function msgData() {
    if (!msgCache) {
      const [m, q] = await Promise.all([Ops.view('messages'), Ops.view('qr').catch(() => ({ links: [] }))]);
      msgCache = { templates: m.templates || [], links: q.links || [] };
    }
    return msgCache;
  }
  function msgEl() {
    let el = document.getElementById('msgBack');
    if (el) return el;
    const st = document.createElement('style'); st.textContent = MCSS; document.head.appendChild(st);
    el = document.createElement('div'); el.id = 'msgBack'; el.className = 'msg-back';
    el.innerHTML = '<div class="msg-sheet" id="msgSheet"></div>';
    el.onclick = e => { if (e.target === el) Msg.close(); };
    document.body.appendChild(el);
    return el;
  }
  const first = n => String(n || '').trim().split(/\s+/)[0] || 'there';
  function fill(text, c, weather) {
    const site = c.site && window.Locs ? (Locs.isDelivery(c.site) ? 'SA eBikes' : Locs.name(c.site)) : 'SA eBikes';
    return String(text).replace(/\{first\}/g, first(c.name)).replace(/\{site\}/g, site).replace(/\{time\}/g, c.ptime || 'your booked time').replace(/\{weather\}/g, weather || '');
  }
  const smsHref = (phone, text) => 'sms:' + phone + (/iPhone|iPad|iPod/.test(navigator.userAgent) ? '&' : '?') + 'body=' + encodeURIComponent(text);
  const waHref = (phone, text) => 'https://wa.me/' + String(phone).replace(/[^0-9]/g, '') + '?text=' + encodeURIComponent(text);
  const uid = () => Math.random().toString(36).slice(2, 12);
  let state = null;
  function sheet(html) { msgEl().classList.add('open'); document.getElementById('msgSheet').innerHTML = html; }

  function chooseStep() {
    const { contact: c, suggest, data } = state;
    const order = [...data.templates].sort((a, b) => (b.id === suggest) - (a.id === suggest));
    sheet('<h3>Message ' + esc(c.name || '') + '</h3><div class="msg-sub">' + esc(c.phoneDisplay || c.phone) + (c.groupName ? ' · ' + esc(c.groupName) : '') + '</div>' +
      order.map(t => '<button class="msg-opt' + (t.id === suggest ? ' sug' : '') + '" data-t="' + esc(t.id) + '">' + esc(t.label) + (t.id === suggest ? '<span class="msg-tag">SUGGESTED</span>' : '') +
        '<small>' + esc(fill(t.text, c, '[the weather]').slice(0, 110)) + '…</small></button>').join('') +
      (data.links.length ? '<div class="msg-h">Send a link</div>' + data.links.map(l => '<button class="msg-opt" data-l="' + esc(l.id) + '">' + esc(l.label) + '</button>').join('') : '') +
      '<button class="msg-btn plain" style="width:100%;margin-top:6px" data-x="1">Close</button>');
    const sh = document.getElementById('msgSheet');
    sh.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { const t = data.templates.find(x => x.id === b.dataset.t); /\{weather\}/.test(t.text) ? weatherStep(t) : composeStep(t, ''); });
    sh.querySelectorAll('[data-l]').forEach(b => b.onclick = () => { const l = data.links.find(x => x.id === b.dataset.l); composeStep({ id: 'link-' + l.id, label: l.label, text: "Hi {first}, here's the " + l.label + ': ' + l.url }, ''); });
    sh.querySelector('[data-x]').onclick = Msg.close;
  }
  function weatherStep(t) {
    sheet('<h3>' + esc(t.label) + '</h3><div class="msg-sub">Describe the weather in a few words. It goes where {weather} is.</div>' +
      '<input class="msg-in" id="msgWeather" maxlength="160" placeholder="e.g. strong winds and rain expected from about 3 pm" value="' + esc(state.weather || '') + '">' +
      '<div class="msg-row"><button class="msg-btn plain" id="msgBackBtn">Back</button><button class="msg-btn ok" id="msgNext">Next</button></div>');
    document.getElementById('msgWeather').focus();
    document.getElementById('msgBackBtn').onclick = () => state.queue ? Msg.close() : chooseStep();
    document.getElementById('msgNext').onclick = () => {
      const w = document.getElementById('msgWeather').value.trim();
      if (!w) { document.getElementById('msgWeather').focus(); return; }
      state.weather = w; composeStep(t, w);
    };
  }
  function composeStep(t, weather) {
    const c = state.contact;
    state.template = t;
    sheet('<h3>' + esc(t.label) + '</h3><div class="msg-sub">To ' + esc(c.name || '') + ' · ' + esc(c.phoneDisplay || c.phone) + (state.queue ? ' · ' + (state.qi + 1) + ' of ' + state.queue.length : '') + '</div>' +
      '<textarea class="msg-txt" id="msgText">' + esc(fill(t.text, c, weather)) + '</textarea>' +
      '<div class="msg-row"><a class="msg-btn sms" id="msgSms" href="#">💬 Text</a><a class="msg-btn wa" id="msgWa" href="#" target="_blank" rel="noopener">WhatsApp</a></div>' +
      '<div class="msg-row"><button class="msg-btn plain" id="msgBackBtn">' + (state.queue ? 'Skip this group' : 'Back') + '</button><button class="msg-btn plain" id="msgClose">Close</button></div>');
    const go = channel => e => {
      const text = document.getElementById('msgText').value;
      e.currentTarget.href = channel === 'sms' ? smsHref(c.phone, text) : waHref(c.phone, text);
      const mid = uid();
      state.pending = { code: c.code, id: mid };
      Ops.act('logMessage', { code: c.code, entry: { id: mid, template: t.id, label: t.label, channel, at: Date.now() }, by: window.Team ? Team.initials() : '' })
        .then(() => state && state.onChange && state.onChange())
        .catch(e => { if (state) state.logFailed = e.message || 'not recorded'; });
      setTimeout(confirmStep, 400); // the question is waiting when they come back from messages
    };
    document.getElementById('msgSms').onclick = go('sms');
    document.getElementById('msgWa').onclick = go('whatsapp');
    document.getElementById('msgBackBtn').onclick = () => state.queue ? nextInQueue() : chooseStep();
    document.getElementById('msgClose').onclick = Msg.close;
  }
  function confirmStep() {
    if (!state || !state.pending) return;
    const c = state.contact;
    sheet('<h3>Was it sent?</h3><div class="msg-sub">' + esc(state.template.label) + ' to ' + esc(c.name || '') + '</div>' +
      '<div class="msg-row"><button class="msg-btn ok" id="msgSent">✓ Sent</button><button class="msg-btn no" id="msgNot">✗ Not sent</button></div>' +
      '<input class="msg-in" id="msgReason" maxlength="120" placeholder="If not sent, why? (optional) e.g. no signal, wrong number" style="margin-top:10px">' +
      '<button class="msg-btn plain" style="width:100%" id="msgSkip">Don\'t know (leave as not confirmed)</button>');
    // If the answer can't be recorded, say so and keep the question open, instead of closing as
    // if it worked. Tapping again is safe: it sets the same answer.
    const answer = status => async () => {
      const p = state.pending;
      const btns = ['msgSent', 'msgNot'].map(x => document.getElementById(x)); btns.forEach(b => { if (b) b.disabled = true; });
      try {
        await Ops.act('updateMessage', { code: p.code, id: p.id, status, reason: status === 'not-sent' ? document.getElementById('msgReason').value.trim() : '', by: window.Team ? Team.initials() : '' });
      } catch (e) {
        btns.forEach(b => { if (b) b.disabled = false; });
        const note = document.getElementById('msgNote') || document.getElementById('msgReason').insertAdjacentElement('beforebegin', Object.assign(document.createElement('div'), { id: 'msgNote' }));
        note.style.cssText = 'color:#9a3530;font-size:13px;margin:8px 0;line-height:1.4';
        note.textContent = (e.code === 'not-found' ? 'The message wasn\'t recorded when it was opened, so there\'s nothing to update. ' : 'Not recorded: ' + e.message + ' ') + 'Tap Sent or Not sent again, or Don\'t know to leave it.';
        return;
      }
      state.pending = null;
      state.onChange && state.onChange();
      state.queue ? nextInQueue() : Msg.close();
    };
    document.getElementById('msgSent').onclick = answer('sent');
    document.getElementById('msgNot').onclick = answer('not-sent');
    document.getElementById('msgSkip').onclick = () => { state.pending = null; state.queue ? nextInQueue() : Msg.close(); };
  }
  function nextInQueue() {
    state.qi++;
    if (state.qi >= state.queue.length) { Msg.close(); return; }
    state.contact = state.queue[state.qi];
    composeStep(state.template, state.weather);
  }

  window.Msg = {
    async open(contact, opts = {}) {
      if (!contact || !contact.phone) return;
      state = { contact, suggest: opts.suggest || '', onChange: opts.onChange, data: null };
      sheet('<div class="msg-sub">Loading…</div>');
      try { state.data = await msgData(); } catch (e) { sheet('<div class="msg-sub">' + esc(e.message) + '</div>'); return; }
      chooseStep();
    },
    // Weather warning to several groups: tick which ones, describe the weather once, then step through them.
    async broadcast(list, opts = {}) {
      state = { onChange: opts.onChange, data: null };
      sheet('<div class="msg-sub">Loading…</div>');
      try { state.data = await msgData(); } catch (e) { sheet('<div class="msg-sub">' + esc(e.message) + '</div>'); return; }
      const t = state.data.templates.find(x => x.id === 'weather') || state.data.templates.find(x => /\{weather\}/.test(x.text));
      if (!t) { sheet('<div class="msg-sub">There\'s no weather message. Add one in Admin → Message templates.</div>'); return; }
      sheet('<h3>' + esc(t.label) + '</h3><div class="msg-sub">Groups with bikes out. Untick any that don\'t need it.</div>' +
        (list.length ? list.map((c, n) => '<label class="msg-pick"><input type="checkbox" data-n="' + n + '"' + (c.phone ? ' checked' : ' disabled') + '><span>' + esc(c.groupName || c.name) +
          '<br><span class="dim">' + (c.phone ? esc(c.name) + ' · ' + esc(c.phoneDisplay || c.phone) : 'no phone number') + (c.site && window.Locs ? ' · ' + esc(Locs.name(c.site)) : '') + '</span></span></label>').join('') : '<div class="msg-sub">No groups have bikes out.</div>') +
        '<div class="msg-row"><button class="msg-btn plain" id="msgClose">Cancel</button><button class="msg-btn ok" id="msgGo">Next</button></div>');
      document.getElementById('msgClose').onclick = Msg.close;
      document.getElementById('msgGo').onclick = () => {
        const picked = [...document.querySelectorAll('#msgSheet input[data-n]:checked')].map(x => list[+x.dataset.n]);
        if (!picked.length) return;
        state.queue = picked; state.qi = 0; state.contact = picked[0];
        weatherStep(t);
      };
    },
    close() { const el = document.getElementById('msgBack'); if (el) el.classList.remove('open'); state = null; },
    refresh() { msgCache = null; },
  };
  // Coming back from Messages or WhatsApp: the "Was it sent?" question is already showing.
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state && state.pending) confirmStep(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

// ── v3.9: corrections (initials and a reason). v3.13: Undo is drawn inside the Group Scanner itself
// (offerUndo in scanner.html), so the floating UndoBar is gone.
// Correct.ask({ title, sub, action, onOK(by, reason) }): a sheet asking for initials and a reason.
(function () {
  const css = `
.cor-back{position:fixed;inset:0;z-index:6500;background:rgba(20,24,28,.45);display:none;align-items:flex-end;justify-content:center}
.cor-back.open{display:flex}
.cor-sheet{background:var(--bg-elev,#fff);width:100%;max-width:480px;border-radius:20px 20px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom,0px));font-family:'Syne',sans-serif;color:var(--text,#1f2428)}
.cor-sheet h3{font-size:18px;font-weight:800;margin:0 0 4px}
.cor-sheet p{font-size:13px;color:var(--text-dim,#5a6269);margin:0 0 12px;line-height:1.45}
.cor-sheet input,.cor-sheet textarea{width:100%;box-sizing:border-box;font:inherit;font-size:15px;padding:11px 12px;border-radius:12px;border:1.5px solid var(--border,#d4cdbd);background:var(--bg,#fbf9f4);color:inherit;margin-bottom:10px}
.cor-sheet input{text-transform:uppercase;width:110px}
.cor-row{display:flex;gap:10px}.cor-row button{flex:1;padding:13px;border-radius:12px;border:1.5px solid var(--border,#d4cdbd);background:var(--bg-elev,#fff);font:800 14px 'Syne',sans-serif;cursor:pointer;color:inherit}
.cor-row button.go{background:#c0392b;border-color:#c0392b;color:#fff}
.cor-line{font-size:11px;font-family:'DM Mono',monospace;color:var(--text-muted,#8a8f93);margin-top:4px}`;
  function addCss() { if (document.getElementById('corCss')) return; const st = document.createElement('style'); st.id = 'corCss'; st.textContent = css; document.head.appendChild(st); }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  window.Correct = {
    // opts: { title, sub, action (button text), onOK(by, reason) }
    ask(opts) {
      addCss();
      let el = document.getElementById('corBack');
      if (!el) { el = document.createElement('div'); el.id = 'corBack'; el.className = 'cor-back'; el.onclick = e => { if (e.target === el) Correct.close(); }; document.body.appendChild(el); }
      const mine = window.Team && Team.initials ? Team.initials() : '';
      el.innerHTML = '<div class="cor-sheet"><h3>' + esc(opts.title) + '</h3><p>' + esc(opts.sub || '') + ' The original stays on the record, with your initials and reason.</p>' +
        '<input id="corBy" maxlength="5" placeholder="Initials" value="' + esc(mine) + '"><textarea id="corWhy" rows="2" maxlength="300" placeholder="Why? (for example: ticked the wrong bike)"></textarea>' +
        '<div class="cor-row"><button type="button" id="corNo">Cancel</button><button type="button" class="go" id="corGo">' + esc(opts.action || 'Correct it') + '</button></div></div>';
      el.classList.add('open');
      document.getElementById('corNo').onclick = Correct.close;
      document.getElementById('corGo').onclick = () => {
        const by = document.getElementById('corBy').value.trim().toUpperCase(), why = document.getElementById('corWhy').value.trim();
        if (!by) { document.getElementById('corBy').focus(); return; }
        if (!why) { document.getElementById('corWhy').focus(); return; }
        Correct.close(); opts.onOK(by, why);
      };
      setTimeout(() => document.getElementById('corWhy').focus(), 50);
    },
    close() { const el = document.getElementById('corBack'); if (el) el.classList.remove('open'); },
    // "Corrected 10:42 by SO: reason" or "Undone 10:42 by SO"
    line(c, what) {
      const t = new Date(c.at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
      return '<div class="cor-line">' + (c.undo ? '↶ Undone' : '✎ Corrected') + ' ' + t + (c.by ? ' by ' + esc(c.by) : '') + (what ? ' · ' + esc(what) : '') + (c.reason ? ': ' + esc(c.reason) : '') + '</div>';
    },
  };
})();

// ── v3.14: Edit booking ──────────────────────────────────────────────────────────────
// BookingEdit.open({ title, tour, cur, rec, onSave(payload) }): a sheet to change a booking's pick-up and
// return, bikes booked and equipment, and to add a staff note. cur = the values now ({ ptime, site, retTime,
// dropoff, qty, equip }); rec = the booking's record from day.bookingEdits (or none). onSave gets
// { changes, note, baseV, by } with only the fields that changed, and returns a promise (or nothing).
// BookingEdit.summaryHTML(rec, cur): what's been changed (with what it was, who and when) and the notes.
// BookingEdit.returnHTML(cur): "Return 4:00 PM to Dandelion Wines", when either is known.
(function () {
  const css = `
.bke-back{position:fixed;inset:0;z-index:6400;font-family:'Syne',sans-serif;background:rgba(20,24,28,.45);display:none;align-items:flex-end;justify-content:center}
.bke-back.open{display:flex}
.bke-sheet{background:var(--bg-elev,#fff);width:100%;max-width:480px;max-height:92vh;overflow-y:auto;border-radius:20px 20px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom,0px));color:var(--text,#1f2428)}
.bke-sheet h3{font-size:18px;font-weight:800;margin:0 0 2px}
.bke-sheet .bke-sub{font-size:12px;color:var(--text-dim,#5a6269);margin:0 0 12px}
.bke-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 10px}
.bke-grid label,.bke-full label{display:block;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--text-dim,#5a6269);margin-bottom:4px}
.bke-full{margin-top:10px}
.bke-sheet input,.bke-sheet select,.bke-sheet textarea{width:100%;box-sizing:border-box;font:inherit;font-size:15px;padding:10px 11px;border-radius:11px;border:1.5px solid var(--border,#d4cdbd);background:var(--bg,#fbf9f4);color:inherit}
.bke-sheet input.chg,.bke-sheet select.chg{border-color:var(--warn,#d9a03f);background:var(--warn-soft,#fdf3e1)}
.bke-row{display:flex;gap:10px;margin-top:14px}.bke-row button{flex:1;padding:13px;border-radius:12px;border:1.5px solid var(--border,#d4cdbd);background:var(--bg-elev,#fff);font-weight:800;font-size:14px;font-family:inherit;cursor:pointer;color:inherit}
.bke-row button.go{background:var(--accent,#415b30);border-color:var(--accent,#415b30);color:#fff}
.bke-hist{margin-top:14px;font-size:12px;color:var(--text-dim,#5a6269);line-height:1.6}
.bke-hist b{color:var(--text,#1f2428)}
.bke-note-tour{font-size:12px;color:var(--text-dim,#5a6269);margin:0 0 10px}
.bk-box{margin:8px 0;padding:8px 11px;border-radius:10px;background:var(--warn-soft,#fdf3e1);border:1.5px solid rgba(217,160,63,.45);font-size:13px;line-height:1.5}
.bk-box .bk-ch b{font-weight:800}.bk-box .was{color:var(--text-dim,#5a6269);font-size:12px}
.bk-box .bk-note{margin-top:2px}.bk-box .bk-note .was{white-space:nowrap}
.bk-ret{margin:6px 0;font-size:13px}
.bk-edit{display:inline-block;margin:2px 0 8px;padding:6px 12px;border-radius:9px;border:1.5px solid var(--border,#d4cdbd);background:var(--bg-elev,#fff);font:inherit;font-size:12px;font-weight:700;color:var(--text-dim,#5a6269);cursor:pointer}`;
  function addCss() { if (document.getElementById('bkeCss')) return; const st = document.createElement('style'); st.id = 'bkeCss'; st.textContent = css; document.head.appendChild(st); }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LABEL = { ptime: 'Pick-up time', site: 'Pick-up location', retTime: 'Return time', dropoff: 'Return location', qty: 'Bikes booked', equip: 'Equipment' };
  const ORDER = ['ptime', 'site', 'retTime', 'dropoff', 'qty', 'equip'];
  // "9:30 AM" ↔ "09:30" for the time inputs.
  function toInput(t) {
    const m = /^(\d{1,2}):(\d{2})\s*([AP]M)?$/i.exec(String(t || '').trim()); if (!m) return '';
    let h = +m[1]; const ap = (m[3] || '').toUpperCase();
    if (ap === 'PM' && h < 12) h += 12; if (ap === 'AM' && h === 12) h = 0;
    return String(h).padStart(2, '0') + ':' + m[2];
  }
  function fromInput(v) {
    const m = /^(\d{2}):(\d{2})$/.exec(v || ''); if (!m) return '';
    const h = +m[1]; return ((h % 12) || 12) + ':' + m[2] + ' ' + (h < 12 ? 'AM' : 'PM');
  }
  const show = (f, v) => f === 'equip' ? ((v || []).join(', ') || 'none') : f === 'site' ? (v ? (window.Locs ? Locs.name(v) : v) : 'none') : (v === '' || v == null ? 'none' : String(v));
  const hm = at => new Date(at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
  const same = (a, b) => JSON.stringify(a == null ? '' : a) === JSON.stringify(b == null ? '' : b);
  let state = null;
  window.BookingEdit = {
    open(o) {
      addCss();
      state = o;
      let el = document.getElementById('bkeBack');
      if (!el) { el = document.createElement('div'); el.id = 'bkeBack'; el.className = 'bke-back'; el.onclick = e => { if (e.target === el) BookingEdit.close(); }; document.body.appendChild(el); }
      const c = o.cur || {}, rec = o.rec || {}, orig = rec.orig || {};
      const mine = window.Team && Team.initials ? Team.initials() : '';
      const hire = window.Locs ? Locs.hire() : [];
      const siteOpts = (c.site && !hire.some(l => l.code === c.site) ? [{ code: c.site, name: c.site }] : []).concat(hire)
        .map(l => '<option value="' + esc(l.code) + '"' + (l.code === c.site ? ' selected' : '') + '>' + esc(l.code + ' · ' + l.name) + '</option>').join('');
      const names = window.Locs ? Locs.list.filter(l => !l.retired).map(l => '<option value="' + esc(l.name) + '">').join('') : '';
      const mark = f => f in orig ? ' class="chg" title="Was ' + esc(show(f, orig[f])) + '"' : '';
      const fields = o.tour ? '<p class="bke-note-tour">A tour booking\'s time is its session. Notes can be added here; to move it to another session, change it in Rezdy and reload the manifest.</p>' :
        '<div class="bke-grid">' +
          '<div><label for="bkePt">Pick-up time</label><input id="bkePt" type="time" value="' + toInput(c.ptime) + '"' + mark('ptime') + '></div>' +
          '<div><label for="bkeSite">Pick-up location</label><select id="bkeSite"' + mark('site') + '>' + (c.site ? '' : '<option value="">Not set</option>') + siteOpts + '</select></div>' +
          '<div><label for="bkeRt">Return time</label><input id="bkeRt" type="time" value="' + toInput(c.retTime) + '"' + mark('retTime') + '></div>' +
          '<div><label for="bkeDo">Return location</label><input id="bkeDo" list="bkeLocNames" maxlength="200" value="' + esc(c.dropoff || '') + '" placeholder="Where it started"' + mark('dropoff') + '><datalist id="bkeLocNames">' + names + '</datalist></div>' +
          '<div><label for="bkeQty">Bikes booked</label><input id="bkeQty" type="number" inputmode="numeric" min="0" max="99" value="' + esc(c.qty || 0) + '"' + mark('qty') + '></div>' +
          '<div><label for="bkeEq">Equipment</label><input id="bkeEq" maxlength="200" value="' + esc((c.equip || []).join(', ')) + '" placeholder="e.g. 1× Child Seat"' + mark('equip') + '></div>' +
        '</div>';
      const hist = (rec.history || []).slice(-8).reverse().map(h => '<div><b>' + esc(LABEL[h.field] || h.field) + '</b> ' + esc(show(h.field, h.from)) + ' → ' + esc(show(h.field, h.to)) + ' · ' + esc(h.by) + ' ' + hm(h.at) + '</div>').join('');
      const notes = (rec.notes || []).map(n => '<div>📝 ' + esc(n.text) + ' · ' + esc(n.by) + ' ' + hm(n.at) + '</div>').join('');
      el.innerHTML = '<div class="bke-sheet" role="dialog" aria-label="Edit booking"><h3>✎ ' + esc(o.title || 'Edit booking') + '</h3>' +
        '<p class="bke-sub">' + (o.code ? esc(o.code) + ' · ' : '') + 'Changes show on every phone, with your initials. Rezdy isn\'t changed, so update it too if the change is real.</p>' +
        fields +
        '<div class="bke-full"><label for="bkeNote">Add a note</label><textarea id="bkeNote" rows="2" maxlength="500" placeholder="For example: running 30 min late, rang 10:05"></textarea></div>' +
        '<div class="bke-full" style="max-width:130px"><label for="bkeBy">Your initials</label><input id="bkeBy" maxlength="5" style="text-transform:uppercase" value="' + esc(mine) + '"></div>' +
        '<div class="bke-row"><button type="button" onclick="BookingEdit.close()">Cancel</button><button type="button" class="go" id="bkeGo" onclick="BookingEdit.save()">Save</button></div>' +
        (notes || hist ? '<div class="bke-hist">' + notes + (hist ? (notes ? '<div style="margin-top:6px"></div>' : '') + hist : '') + '</div>' : '') +
        '</div>';
      el.classList.add('open');
    },
    async save() {
      if (!state) return;
      const by = document.getElementById('bkeBy').value.trim().toUpperCase();
      if (!by) { document.getElementById('bkeBy').focus(); if (window.showToast) showToast('Enter your initials', 'warning'); return; }
      const c = state.cur || {}, changes = {};
      if (!state.tour) {
        const v = {
          ptime: fromInput(document.getElementById('bkePt').value),
          site: document.getElementById('bkeSite').value,
          retTime: fromInput(document.getElementById('bkeRt').value),
          dropoff: document.getElementById('bkeDo').value.trim(),
          qty: Math.max(0, Math.min(99, parseInt(document.getElementById('bkeQty').value, 10) || 0)),
          equip: document.getElementById('bkeEq').value.split(',').map(x => x.trim()).filter(Boolean),
        };
        for (const f of ORDER) {
          const cur = f === 'qty' ? (c.qty || 0) : f === 'equip' ? (c.equip || []) : (c[f] || '');
          // A time typed the same as before, but written differently ("09:30" vs "9:30 AM"), isn't a change.
          if ((f === 'ptime' || f === 'retTime') && toInput(cur) === toInput(v[f])) continue;
          if (f === 'site' && !v.site) continue;
          if (!same(cur, v[f])) changes[f] = v[f];
        }
      }
      const text = document.getElementById('bkeNote').value.trim();
      const note = text ? { id: Math.random().toString(36).slice(2, 12) + Date.now().toString(36), text } : null;
      if (!Object.keys(changes).length && !note) { BookingEdit.close(); return; }
      const go = document.getElementById('bkeGo'); go.disabled = true; go.textContent = 'Saving…';
      try { await state.onSave({ changes, note, baseV: (state.rec && state.rec.v) || 0, by }); BookingEdit.close(); }
      catch (e) { go.disabled = false; go.textContent = 'Save'; }
    },
    close() { const el = document.getElementById('bkeBack'); if (el) el.classList.remove('open'); state = null; },
    summaryHTML(rec, cur) {
      if (!rec) return '';
      const orig = rec.orig || {}, last = {};
      for (const h of rec.history || []) last[h.field] = h;
      // A return time or place, or equipment, added where Rezdy had none already shows on its own line.
      const shownElsewhere = f => (f === 'retTime' || f === 'dropoff' || f === 'equip') && show(f, orig[f]) === 'none';
      const ch = ORDER.filter(f => f in orig && !shownElsewhere(f)).map(f => '<div class="bk-ch">✎ ' + esc(LABEL[f]) + ' <b>' + esc(show(f, cur ? cur[f] : last[f] && last[f].to)) + '</b> <span class="was">was ' + esc(show(f, orig[f])) +
        (last[f] ? ' · ' + esc(last[f].by) + ' ' + hm(last[f].at) : '') + '</span></div>').join('');
      const notes = (rec.notes || []).map(n => '<div class="bk-note">📝 ' + esc(n.text) + ' <span class="was">' + esc(n.by) + ' ' + hm(n.at) + '</span></div>').join('');
      return ch || notes ? '<div class="bk-box">' + ch + notes + '</div>' : '';
    },
    returnHTML(cur) {
      if (!cur || (!cur.retTime && !cur.dropoff)) return '';
      return '<div class="bk-ret">↩ Return' + (cur.retTime ? ' ' + esc(cur.retTime) : '') + (cur.dropoff ? ' to ' + esc(cur.dropoff) : '') + '</div>';
    },
  };
})();
