// SA eBikes Operations Tools v3.10: the business's name, logo, colours and heading font on every page.
// Loaded in <head>, before the page draws. It uses the last settings this phone saw (kept in
// localStorage), so nothing waits on the network; the home screen fetches the latest each time it
// opens, and other pages check in the background when the copy is over six hours old.
(function () {
  const KEY = 'saeb-brand', FRESH = 6 * 3600e3;
  const DEF = { name: 'SA eBikes', tagline: 'Just like riding a bike... just more fun', main: '#415b30', bright: '#5fd64f', font: 'baloo', country: 'AU', logo: '/assets/brand/logo.png', showName: true, rev: 0 };
  let b = { ...DEF };
  try { b = { ...DEF, ...(JSON.parse(localStorage.getItem(KEY) || 'null') || {}) }; } catch {}
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rgb = h => { const n = parseInt(String(h).slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const rgba = (h, a) => 'rgba(' + rgb(h).join(',') + ',' + a + ')';
  const darker = h => '#' + rgb(h).map(v => Math.round(v * 0.72).toString(16).padStart(2, '0')).join('');
  function colours() {
    const r = document.documentElement.style;
    if (!/^#[0-9a-f]{6}$/i.test(b.main) || !/^#[0-9a-f]{6}$/i.test(b.bright)) return;
    r.setProperty('--accent', b.main); r.setProperty('--accent-dark', darker(b.main)); r.setProperty('--accent-text', b.main);
    r.setProperty('--bright', b.bright); r.setProperty('--accent-soft', rgba(b.bright, .14)); r.setProperty('--accent-line', rgba(b.main, .3)); r.setProperty('--accent-glow', rgba(b.bright, .5));
    r.setProperty('--brand-font', b.font === 'app' ? "'Syne',sans-serif" : "'Baloo Bhai 2','Syne',sans-serif");
  }
  // Page headers (class "logo", or data-brand="home" on the home screen), the tagline and the tab title.
  function paint() {
    const mark = b.logo ? '<img class="brand-mark" src="' + esc(b.logo) + '" alt="' + esc(b.showName ? '' : b.name) + '">' : '';
    const html = mark + (b.showName || !mark ? '<span class="brand-name">' + esc(b.name) + '</span>' : '');
    document.querySelectorAll('header .logo, .brand-head .logo, [data-brand="home"]').forEach(el => { el.innerHTML = html; });
    document.querySelectorAll('[data-brand="tagline"]').forEach(el => { el.textContent = b.tagline || ''; el.style.display = b.tagline ? '' : 'none'; });
    document.title = document.title.replace(/^.*? · Operations Tools/, b.name + ' · Operations Tools');
  }
  colours();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint); else paint();
  window.Brand = {
    get: () => ({ ...b }),
    name: () => b.name,
    // For file names: "SA-eBikes".
    file: () => String(b.name).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'Operations-Tools',
    country: () => b.country || 'AU',
    set(v) {
      if (!v || typeof v !== 'object') return;
      b = { ...DEF, ...v, at: Date.now() };
      try { localStorage.setItem(KEY, JSON.stringify(b)); } catch {}
      colours(); paint();
    },
  };
  // Other pages: refresh in the background when the copy is over six hours old.
  window.addEventListener('load', () => {
    if (Date.now() - (b.at || 0) < FRESH || !window.Ops || !Ops.view) return;
    setTimeout(() => Ops.view('brand').then(v => Brand.set(v.brand)).catch(() => {}), 1500);
  });
})();
