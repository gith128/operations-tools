// SA eBikes Operations Tools v3.6: the fleet report's sums, from the daily bike records.
// Used by the Fleet report page and by the tests. Utilisation = days hired ÷ days available.
// A bike-day is available if the bike was hired that day ('h') or free to hire at opening ('a');
// out of service ('o') and in storage ('s') don't count. By location, a hired bike counts where it
// went out from; one not hired counts where it was at opening.
(function (root) {
  const counts = s => s === 'a' || s === 'h';
  const locOf = b => (b.s === 'h' ? ((b.h && b.h[0]) || b.l || '') : b.l || '');
  const keyOf = (by, id, b) => (by === 'bike' ? id : by === 'model' ? b.m : locOf(b) || '—');
  const ratio = (h, a) => (a ? h / a : null);
  function aggregate(days, by) {
    const rows = {};
    for (const r of Object.values(days)) for (const [id, b] of Object.entries(r.bikes || {})) {
      const k = keyOf(by, id, b);
      const x = rows[k] = rows[k] || { key: k, days: 0, available: 0, hired: 0, hires: 0, oos: 0, storage: 0, models: new Set() };
      x.days++;
      if (counts(b.s)) x.available++;
      if (b.s === 'h') { x.hired++; x.hires += b.n || 1; }
      if (b.s === 'o') x.oos++;
      if (b.s === 's') x.storage++;
      x.models.add(b.m);
    }
    return Object.values(rows).map(x => ({ ...x, models: [...x.models], util: ratio(x.hired, x.available) }));
  }
  function monthly(days, by) {
    const months = [...new Set(Object.keys(days).map(d => d.slice(0, 7)))].sort();
    const rows = {};
    for (const [date, r] of Object.entries(days)) for (const [id, b] of Object.entries(r.bikes || {})) {
      const k = keyOf(by, id, b), mo = date.slice(0, 7);
      const x = rows[k] = rows[k] || { key: k, months: {} };
      const c = x.months[mo] = x.months[mo] || { available: 0, hired: 0 };
      if (counts(b.s)) c.available++;
      if (b.s === 'h') c.hired++;
    }
    for (const x of Object.values(rows)) for (const c of Object.values(x.months)) c.util = ratio(c.hired, c.available);
    return { months, rows: Object.values(rows) };
  }
  function quality(days) {
    let bikeDays = 0, estModel = 0, estLocation = 0, rebuilt = 0, unregistered = 0;
    const noManifest = [];
    for (const [date, r] of Object.entries(days)) {
      if (!r.manifest) noManifest.push(date);
      for (const b of Object.values(r.bikes || {})) {
        bikeDays++;
        if ((b.e || '').includes('m')) estModel++;
        if ((b.e || '').includes('l')) estLocation++;
        if (r.src === 'rebuilt') rebuilt++;
        if (b.u) unregistered++;
      }
    }
    return { bikeDays, estModel, estLocation, rebuilt, unregistered, noManifest: noManifest.sort() };
  }
  function totals(days) {
    let available = 0, hired = 0;
    for (const r of Object.values(days)) for (const b of Object.values(r.bikes || {})) { if (counts(b.s)) available++; if (b.s === 'h') hired++; }
    return { available, hired, util: ratio(hired, available) };
  }
  root.FleetCore = { aggregate, monthly, quality, totals, locOf };
})(typeof window !== 'undefined' ? window : globalThis);
