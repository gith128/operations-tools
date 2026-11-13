// SA eBikes Operations Tools v3.12 — settings: business, tours, maintenance and the home screen.
//
//   app-settings { faultTypes: [{ id, label, retired? }], repeatDays, home: { order: [tile], hidden: [tile] } }
//
// Fault types are set in Admin. An id never changes or goes away: renaming keeps it, and a type no
// longer wanted is retired (hidden from the lists, kept on old issues). A repeat fault is an issue on
// a bike with a fault type that bike already had logged within repeatDays before it.

export const KEY_SETTINGS = 'app-settings';
export const DEFAULT_FAULT_TYPES = [
  { id: 'brakes', label: 'Brakes' }, { id: 'tyres', label: 'Tyres and wheels' }, { id: 'gears', label: 'Gears, chain and pedals' },
  { id: 'battery', label: 'Battery and charging' }, { id: 'motor', label: 'Motor and display' }, { id: 'frame', label: 'Frame, fork and steering' },
  { id: 'saddle', label: 'Saddle and seatpost' }, { id: 'lights', label: 'Lights, bell and kickstand' },
  { id: 'accessories', label: 'Accessories (locks, baskets, child seats)' }, { id: 'other', label: 'Other' },
];
// The fault type an M-check item's failure is logged under.
export const MCHECK_FAULT = { front: 'tyres', rear: 'tyres', steering: 'frame', frame: 'frame', brakes: 'brakes', drive: 'gears', saddle: 'saddle', battery: 'battery', motor: 'motor', lights: 'lights' };
// The home screen tiles, in their original order. Load Manifest can't be hidden: Admin is reached from it.
export const HOME_TILES = ['contacts', 'checklists', 'roster', 'scanner', 'qr', 'fleet', 'issues', 'lost', 'manifest', 'help'];
export const ALWAYS_SHOWN = ['manifest'];
// v3.10: the business. Filled with SA eBikes' values when first read, so an upgrade changes nothing.
// logo: '' = the logo shipped with the app (/assets/brand/logo.png); 'none' = no logo; or a data: URL.
export const DEFAULT_BUSINESS = { name: 'SA eBikes', tagline: 'Just like riding a bike... just more fun', main: '#415b30', bright: '#5fd64f', font: 'baloo', country: 'AU', logo: '', showName: true };
export const FONTS = ['baloo', 'app'];
// v3.12: guided tours. Each is recognised from the Rezdy product name by its matching words, starts
// and finishes at one location, runs for a set time, and has its usual session times (for rostering
// guides ahead). Bookings for the same tour and session are one departure.
export const DEFAULT_TOURS = [
  { id: 'morning', name: 'Morning Tour', match: ['Guided Morning E-Bike Tour'], location: 'OXB', durationMins: 150, sessions: ['09:30'] },
  { id: 'wine-stories', name: 'Wine & Stories Tour', match: ['Wine & Stories'], location: 'OXB', durationMins: 150, sessions: ['13:00'] },
];
export const emptySettings = () => ({ rev: 0, updatedAt: 0, faultTypes: DEFAULT_FAULT_TYPES.map(t => ({ ...t })), repeatDays: 90, home: { order: [...HOME_TILES], hidden: [] }, business: { ...DEFAULT_BUSINESS },
  tours: DEFAULT_TOURS.map(t => ({ ...t, match: [...t.match], sessions: [...t.sessions] })) });
export const toursOf = st => (st && Array.isArray(st.tours) ? st.tours : DEFAULT_TOURS);
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const minsOf = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
// The tours as saved: ids kept (renames follow), new ones get an id from their name; a tour left out
// is kept, retired, so past departures keep their name.
export function cleanTours(given, existing, locations) {
  if (!Array.isArray(given)) throw new SettingsError('Send the list of tours');
  const have = new Map((existing || []).map(t => [t.id, t])), ids = new Set(), names = new Set(), out = [];
  const okLoc = new Set((locations || []).filter(l => !l.retired).map(l => l.code));
  for (const t of given.slice(0, 30)) {
    const name = String((t && t.name) || '').trim().replace(/\s+/g, ' ');
    if (!name) throw new SettingsError('Each tour needs a name');
    if (name.length > 50) throw new SettingsError('Keep tour names under 50 characters');
    if (names.has(name.toLowerCase())) throw new SettingsError('"' + name + '" is in the list twice');
    names.add(name.toLowerCase());
    const match = [...new Set((Array.isArray(t.match) ? t.match : String(t.match || '').split(',')).map(w => String(w).trim()).filter(Boolean))].slice(0, 10);
    if (!match.length && !t.retired) throw new SettingsError('Give "' + name + '" at least one matching word from its Rezdy product name');
    const location = String(t.location || '').toUpperCase();
    if (okLoc.size && !okLoc.has(location)) throw new SettingsError('Choose where "' + name + '" starts');
    const durationMins = parseInt(t.durationMins, 10);
    if (!(durationMins >= 15 && durationMins <= 720)) throw new SettingsError('A tour lasts between 15 minutes and 12 hours');
    const sessions = [...new Set((Array.isArray(t.sessions) ? t.sessions : String(t.sessions || '').split(',')).map(x => String(x).trim()).filter(Boolean))];
    for (const x of sessions) if (!HHMM.test(x)) throw new SettingsError('Session times are 24-hour, such as 09:30 or 13:00');
    let tid = t.id && have.has(t.id) ? t.id : '';
    if (!tid) { const base = slug(name); tid = base; let n = 2; while (have.has(tid) || ids.has(tid)) tid = base + '-' + n++; }
    ids.add(tid);
    out.push({ id: tid, name, match, location, durationMins, sessions: sessions.sort(), ...(t.retired ? { retired: true } : {}) });
  }
  for (const t of existing || []) if (!ids.has(t.id)) out.push({ ...t, retired: true });
  return out;
}
// The tour a Rezdy product belongs to: the first active tour with a matching word in its name.
export function tourFor(product, tours) {
  const p = String(product || '').toLowerCase();
  return p ? tours.find(t => !t.retired && t.match.some(w => p.includes(String(w).toLowerCase()))) || null : null;
}
export const businessOf = st => ({ ...DEFAULT_BUSINESS, ...((st && st.business) || {}) });
// What every page needs to show the business: small, apart from the logo (about 50 KB at most).
export const brandView = st => { const b = businessOf(st); return { ...b, logo: b.logo === 'none' ? '' : b.logo || '/assets/brand/logo.png', rev: (st && st.rev) || 0 }; };
const HEX = /^#[0-9a-f]{6}$/i;
const MAX_LOGO = 90000; // characters of data: URL, about 65 KB of image
export function cleanBusiness(b, cur) {
  b = b || {};
  const out = { ...cur };
  const text = (v, max, label, required) => { const t = String(v == null ? '' : v).trim().replace(/\s+/g, ' '); if (required && !t) throw new SettingsError(label + ' is required'); if (t.length > max) throw new SettingsError(label + ' is too long (' + max + ' characters at most)'); return t; };
  if ('name' in b) out.name = text(b.name, 40, 'The business name', true);
  if ('tagline' in b) out.tagline = text(b.tagline, 80, 'The tagline', false);
  for (const k of ['main', 'bright']) if (k in b) { const v = String(b[k] || '').trim(); if (!HEX.test(v)) throw new SettingsError('Colours are six-digit codes such as #415b30'); out[k] = v.toLowerCase(); }
  if ('font' in b) { if (!FONTS.includes(b.font)) throw new SettingsError('Choose a heading font from the list'); out.font = b.font; }
  if ('country' in b) { const c = String(b.country || '').trim().toUpperCase(); if (!/^[A-Z]{2}$/.test(c)) throw new SettingsError('The country is a two-letter code, such as AU'); out.country = c; }
  if ('showName' in b) out.showName = b.showName !== false;
  if ('logo' in b) {
    const l = String(b.logo || '');
    if (l && l !== 'none' && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(l)) throw new SettingsError('The logo must be a PNG, JPEG or WebP image');
    if (l.length > MAX_LOGO) throw new SettingsError('The logo is too large: use a smaller image');
    out.logo = l;
  }
  return out;
}

export class SettingsError extends Error { constructor(message) { super(message); this.code = 'invalid'; } }
const slug = s => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'type';

// The fault types as saved: existing ids keep their place in the given order; any existing type left
// out is kept, retired. New ones get an id from their label.
export function cleanFaultTypes(given, existing) {
  if (!Array.isArray(given)) throw new SettingsError('Send the list of fault types');
  const have = new Map(existing.map(t => [t.id, t]));
  const out = [], labels = new Set(), ids = new Set();
  for (const t of given.slice(0, 40)) {
    const label = String((t && t.label) || '').trim().replace(/\s+/g, ' ');
    if (!label) throw new SettingsError('Each fault type needs a name');
    if (label.length > 50) throw new SettingsError('Keep each fault type under 50 characters');
    if (labels.has(label.toLowerCase())) throw new SettingsError('"' + label + '" is in the list twice');
    labels.add(label.toLowerCase());
    let tid = t && t.id && have.has(t.id) ? t.id : '';
    if (!tid) { const base = slug(label); tid = base; let n = 2; while (have.has(tid) || ids.has(tid)) tid = base + '-' + n++; }
    if (ids.has(tid)) throw new SettingsError('A fault type is in the list twice');
    ids.add(tid);
    out.push({ id: tid, label, ...(t && t.retired ? { retired: true } : {}) });
  }
  for (const t of existing) if (!ids.has(t.id)) out.push({ ...t, retired: true });
  if (!out.some(t => !t.retired)) throw new SettingsError('Keep at least one fault type in use');
  return out;
}
export function cleanHome(order, hidden) {
  const o = (Array.isArray(order) ? order : []).filter((t, i, a) => HOME_TILES.includes(t) && a.indexOf(t) === i);
  for (const t of HOME_TILES) if (!o.includes(t)) o.push(t);
  const h = (Array.isArray(hidden) ? hidden : []).filter((t, i, a) => HOME_TILES.includes(t) && !ALWAYS_SHOWN.includes(t) && a.indexOf(t) === i);
  return { order: o, hidden: h };
}

// Repeat faults: for each issue, the earlier issues on the same bike sharing a fault type within
// `days` before it. { issueId: [{ id, at, type }] }
export function repeatFaults(issues, days = 90) {
  const win = days * 864e5, out = {};
  const byBike = {};
  for (const i of issues) if ((i.faults || []).length && !i.error) (byBike[i.bikeId] = byBike[i.bikeId] || []).push(i);
  for (const list of Object.values(byBike)) {
    list.sort((a, b) => a.reportedAt - b.reportedAt);
    for (let n = 0; n < list.length; n++) {
      const i = list[n], hits = [];
      for (let k = n - 1; k >= 0; k--) {
        const p = list[k];
        if (i.reportedAt - p.reportedAt > win) break;
        for (const t of i.faults) if (p.faults.includes(t)) hits.push({ id: p.id, at: p.reportedAt, type: t });
      }
      if (hits.length) out[i.id] = hits;
    }
  }
  return out;
}

// Bikes out of service now: each bike with an open P5, from when (the latest move to P5 on its
// earliest open P5 issue).
export function unavailableNow(issues) {
  const out = {};
  for (const i of issues) {
    if (i.status !== 'open' || (i.priority || 3) !== 5) continue;
    const to5 = (i.updates || []).filter(u => u.priorityTo === 5).pop();
    const since = to5 ? to5.at : i.reportedAt;
    const cur = out[i.bikeId];
    if (!cur || since < cur.since) out[i.bikeId] = { bike: i.bikeId, since, issueId: i.id, issue: i.issue, faults: i.faults || [] };
  }
  return Object.values(out).sort((a, b) => a.since - b.since);
}
