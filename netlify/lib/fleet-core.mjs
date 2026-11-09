// SA eBikes Operations Tools v3.6 — fleet records and the register's change history.
//
// One record per bike per day, so utilisation doesn't change when the register does:
//   fleet-days    { days: { 'YYYY-MM-DD': { date, src, at, manifest, bikes: { <id>: rec } } } }
//   asset-history { startedAt, entries: [{ id, at, bike, how, by, changes: { field: [from, to] }, snapshot? }] }
//
// A bike's record (short keys keep a year of records near 1 MB):
//   m  model                    l  where it started the day (its base location at opening)
//   s  status at opening: 'h' hired that day, 'a' available, 'o' out of service (P5), 's' in storage
//   h  hire locations it went out from (hired only)   n  hires that day   d  day of hire (1, 2, 3…)
//   e  parts estimated in a rebuild: 'm' model from today's register, 'l' location unknown then
//
// Records are written when the next manifest is loaded ("live"), or rebuilt from the daily
// archives, the move log, the issue history and the register history ("rebuilt"). A rebuild never
// replaces a live record. Every calendar day counts: a day with no manifest (or no groups) is a day
// the bikes were available and none went out.
import { TZ } from './tz.mjs';

export const KEY_FLEET_DAYS = 'fleet-days';
export const KEY_ASSET_HISTORY = 'asset-history';
export const emptyFleetDays = () => ({ rev: 0, updatedAt: 0, days: {} });
export const emptyAssetHistory = () => ({ rev: 0, updatedAt: 0, startedAt: 0, entries: [] });
export const MAX_HISTORY = 20000;
export const OPENING_HOUR = 8; // status and location are taken as they stood at 8:00 am, Adelaide time

// The register fields the change history follows. Location is followed by the move log instead.
export const HISTORY_FIELDS = ['serial', 'keyNumber', 'brand', 'model', 'size', 'purchaseDate', 'purchasePrice', 'disposalDate', 'salePrice', 'disposalNote'];

// ── Adelaide dates ─────────────────────────────────────────────────────────
const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
// The moment it is `hour`:00 on `date` in the business's time zone (daylight saving included).
export function adlAt(date, hour = 0) {
  const [y, m, d] = date.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d, hour);
  let t = target;
  for (let n = 0; n < 3; n++) {
    const p = Object.fromEntries(parts.formatToParts(new Date(t)).map(x => [x.type, x.value]));
    const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
    if (local === target) break;
    t -= local - target;
  }
  return t;
}
export const adlDateOf = t => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
export function addDays(date, n) { const t = new Date(date + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── the register's change history ──────────────────────────────────────────
const rid = () => Math.random().toString(36).slice(2, 12);
const val = v => (v == null ? '' : v);
// What changed between two copies of the register. `renames` is [{ from, to }] for a bike whose ID
// was changed in this save. Returns history entries, oldest first.
export function diffAssets(before, after, { by = '', how = '', renames = [], at = Date.now() } = {}) {
  const b = new Map(before.map(a => [a.id, a])), a = new Map(after.map(x => [x.id, x]));
  const out = [];
  for (const r of renames) {
    if (!b.has(r.from) || !a.has(r.to) || r.from === r.to) continue;
    out.push({ id: rid(), at, bike: r.to, how: 'renamed', by, changes: { id: [r.from, r.to] } });
    b.set(r.to, { ...b.get(r.from), id: r.to }); b.delete(r.from);
  }
  for (const [id, x] of a) {
    const old = b.get(id);
    const changes = {};
    for (const f of HISTORY_FIELDS) if (JSON.stringify(val(old ? old[f] : '')) !== JSON.stringify(val(x[f]))) changes[f] = [old ? val(old[f]) : '', val(x[f])];
    const via = how === 'import' ? { via: 'import' } : {};
    if (!old) out.push({ id: rid(), at, bike: id, how: 'added', by, ...via, changes });
    else if (Object.keys(changes).length) out.push({ id: rid(), at, bike: id, how: 'edited', by, ...via, changes });
  }
  for (const [id, old] of b) if (!a.has(id)) {
    const snapshot = {}; for (const f of ['id', 'location', ...HISTORY_FIELDS]) if (old[f] != null && old[f] !== '') snapshot[f] = old[f];
    out.push({ id: rid(), at, bike: id, how: 'removed', by, snapshot });
  }
  return out;
}
export function appendHistory(doc, entries, now = Date.now()) {
  if (!doc.startedAt) doc.startedAt = now;
  doc.entries.push(...entries);
  if (doc.entries.length > MAX_HISTORY) doc.entries = doc.entries.slice(-MAX_HISTORY);
}

// Each ID a bike has had, mapped to the ID it has now (from renames).
function aliases(history) {
  const map = {};
  for (const e of history.entries) if (e.how === 'renamed') {
    const [from, to] = e.changes.id;
    map[from] = to;
    for (const k of Object.keys(map)) if (map[k] === from) map[k] = to;
  }
  return map;
}
// The register as it stood at time t, keyed by each bike's ID now. Bikes removed since t are
// brought back from the copy kept when they were removed.
export function registerAt(assets, history, t) {
  const recs = new Map(assets.map(a => [a.id, { ...a }]));
  const later = history.entries.filter(e => e.at > t).sort((x, y) => y.at - x.at);
  const now = aliases(history);
  const cur = id => now[id] || id;
  for (const e of later) {
    const key = cur(e.bike);
    if (e.how === 'removed') { if (!e.error && !recs.has(key)) recs.set(key, { ...e.snapshot, id: key }); continue; }
    if (e.how === 'restored') continue; // a removal in error: the bike was in the fleet all along
    const r = recs.get(key);
    if (!r || e.how === 'added' || e.how === 'renamed') continue;
    for (const [f, [from]] of Object.entries(e.changes || {})) r[f] = from;
  }
  return { recs, cur };
}

// ── where each bike was, and whether it was out of service ────────────────
// A bike's location at time t: today's, with every move since t undone.
export function locationAt(moves, ids, current, t) {
  let loc = current || '';
  for (let i = moves.length - 1; i >= 0; i--) {
    const m = moves[i];
    if (m.at <= t) break;
    // A move from nowhere is the bike's first location being set: keep that as its location before.
    if (ids.has(m.bike) && m.from) loc = m.from;
  }
  return loc;
}
// Periods on P5, per bike: [[from, to], …] in ms, from the priority changes in the issue log.
export function p5Periods(issues, now = Date.now()) {
  const out = {};
  for (const i of issues) {
    if (i.error) continue; // logged in error (v3.9)
    const first = (i.updates || []).find(u => u.priorityFrom);
    const steps = [{ at: i.reportedAt, p: first ? first.priorityFrom : i.priority }]
      .concat((i.updates || []).filter(u => u.priorityTo).map(u => ({ at: u.at, p: u.priorityTo })));
    const end = i.status === 'resolved' && i.resolvedAt ? i.resolvedAt : now;
    for (let n = 0; n < steps.length; n++) {
      if (steps[n].p !== 5) continue;
      const to = n + 1 < steps.length ? steps[n + 1].at : end;
      (out[i.bikeId] = out[i.bikeId] || []).push([steps[n].at, Math.max(steps[n].at, to)]);
    }
  }
  return out;
}
const onP5 = (periods, ids, t) => [...ids].some(id => (periods[id] || []).some(([a, b]) => a <= t && t < b));

// ── hires on a day ─────────────────────────────────────────────────────────
// Every bike out with a group on `date`, from that day's saved copies (and, for a day with no
// manifest, the previous day's). A bike already checked in, or a group returned, before the day
// started doesn't count for a later day.
export function hiresOn(date, dayDocs, cur = x => x) {
  const sod = adlAt(date, 0);
  const out = new Map();
  for (const day of dayDocs) {
    for (const g of day.groups || []) {
      const start = g.startDate || day.manifestDate || '';
      if (!start || start > date) continue;
      const earlier = start < date;
      if (earlier && g.status === 'returned' && g.returnedAt && g.returnedAt < sod) continue;
      for (const b of g.bikes || []) {
        if (earlier && b.inAt && b.inAt < sod) continue;
        const code = cur(b.code);
        const h = out.get(code) || { sites: [], groups: new Set(), day: 1, model: '' };
        if (g.site && !h.sites.includes(g.site)) h.sites.push(g.site);
        h.groups.add(g.id || g.name);
        h.day = Math.max(h.day, daysBetween(start, date) + 1);
        if (b.model && !h.model) h.model = b.model;
        out.set(code, h);
      }
    }
  }
  return out;
}

// ── one day's records ──────────────────────────────────────────────────────
// ctx: { assets, history, moves, issues|periods, locations }. dayDocs: that day's saved copies
// (or the previous day's, with manifest false, for a day with no manifest).
export function buildFleetDay(date, dayDocs, ctx, { manifest = true, src = 'live', now = Date.now() } = {}) {
  const t = adlAt(date, OPENING_HOUR);
  const { recs, cur } = registerAt(ctx.assets, ctx.history, t);
  const periods = ctx.periods || p5Periods(ctx.issues || [], now);
  const hires = hiresOn(date, dayDocs, cur);
  const kinds = Object.fromEntries((ctx.locations || []).map(l => [l.code, l.kind]));
  const histStart = ctx.history.startedAt || Infinity;
  const movesStart = ctx.moves.length ? ctx.moves[0].at : Infinity;
  const now2 = aliases(ctx.history);
  const idsOf = id => new Set([id, ...Object.keys(now2).filter(k => now2[k] === id)]);
  const current = new Map(ctx.assets.map(a => [a.id, a]));
  const bikes = {};
  for (const [id, r] of recs) {
    const hire = hires.get(id);
    const inFleet = (!r.purchaseDate || r.purchaseDate <= date) && !(r.disposalDate && r.disposalDate <= date);
    if (!inFleet && !hire) continue;
    const ids = idsOf(id);
    const base = locationAt(ctx.moves, ids, (current.get(id) || r).location, t);
    const rec = { m: (hire && hire.model) || r.model || 'No model', l: base,
      s: hire ? 'h' : onP5(periods, ids, t) ? 'o' : kinds[base] === 'storage' ? 's' : 'a' };
    if (hire) { rec.h = hire.sites; rec.n = hire.groups.size; rec.d = hire.day; }
    let e = '';
    // Only a rebuild can be wrong about these: on the day itself, the register and locations are current.
    if (!(hire && hire.model) && t < histStart && src === 'rebuilt') e += 'm';
    if (t < movesStart && src === 'rebuilt') e += 'l';
    if (e) rec.e = e;
    bikes[id] = rec;
  }
  // A barcode hired out that isn't in the register: counted as hired, with no model.
  for (const [code, hire] of hires) if (!bikes[code]) bikes[code] = { m: hire.model || 'Not registered', l: '', s: 'h', h: hire.sites, n: hire.groups.size, d: hire.day, u: 1 };
  return { date, src, at: now, manifest, bikes };
}

// ── the daily archives ─────────────────────────────────────────────────────
// Archive keys by date, oldest copy first: { 'YYYY-MM-DD': [key, …] }.
export async function archiveIndex(store) {
  const { blobs } = await store.list({ prefix: 'archive/' });
  const by = {};
  for (const b of blobs) {
    const [, date, stamp] = b.key.split('/');
    if (!DATE_RE.test(date || '')) continue;
    (by[date] = by[date] || []).push({ key: b.key, t: Number(String(stamp).split('-')[0]) || 0 });
  }
  for (const d of Object.keys(by)) by[d] = by[d].sort((a, b) => a.t - b.t).map(x => x.key);
  return by;
}
async function readMany(store, keys) {
  const out = [];
  for (let i = 0; i < keys.length; i += 8) {
    const got = await Promise.all(keys.slice(i, i + 8).map(k => store.get(k, { type: 'json' }).catch(() => null)));
    out.push(...got.map(a => (a && a.day ? a.day : null)));
  }
  return out; // lined up with keys; null for a copy that can't be read
}

// The records for `dates`, from the archives. A date with no archive takes the newest copy of the
// last date before it that has one (bikes still out overnight); dates before the first archive get
// nothing. `extra` adds day copies not (yet) archived: { date: [day] }.
export async function buildFromArchives(store, dates, ctx, { index, extra = {}, src = 'rebuilt', now = Date.now() } = {}) {
  index = index || await archiveIndex(store);
  const archived = Object.keys(index).sort();
  const plan = [];
  const need = new Set();
  for (const date of dates) {
    if (index[date]) { plan.push({ date, keys: index[date], manifest: true }); index[date].forEach(k => need.add(k)); continue; }
    const prev = archived.filter(d => d < date).pop();
    if (!prev && !extra[date]) continue;
    const key = prev ? index[prev][index[prev].length - 1] : null;
    plan.push({ date, keys: key ? [key] : [], manifest: !!extra[date] });
    if (key) need.add(key);
  }
  const keys = [...need];
  const docs = await readMany(store, keys);
  const byKey = new Map(keys.map((k, n) => [k, docs[n]]));
  const out = [];
  for (const p of plan) {
    const list = p.keys.map(k => byKey.get(k)).filter(Boolean).concat(extra[p.date] || []);
    out.push(buildFleetDay(p.date, list, ctx, { manifest: p.manifest, src, now }));
  }
  return out;
}
