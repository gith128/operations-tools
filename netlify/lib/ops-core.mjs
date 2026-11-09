// SA eBikes Operations Tools v3.10 — server-side core.
//
// All data lives in one Netlify Blobs store, one file per area ("day" for today's groups and
// contacts, "issues", "assets", "mchecks" and so on), plus "archive/<date>/<timestamp>" copies
// of each day, taken automatically before a new manifest is loaded or the scanner is reset.
// Backups and restore are in backup-core.mjs.
//
// Pages never send whole documents. They send small actions ("add this bike
// to this group") and the server applies them to the latest copy. Each write
// is conditional on the document not having changed since it was read; if
// another phone got in first, we re-read and re-apply. This is what stops two
// phones scanning at the same time from wiping each other's bikes.

import { TZ } from './tz.mjs';
export { TZ };
import { takeSnapshot, listSnapshots, backupStatus, markOffsite, restoreSnapshot, downloadPart, currentCounts, SECTIONS, BackupError } from './backup-core.mjs';
import { rosterActions, rosterView, emptyRoster, KEY_ROSTER, RosterError, todayAdelaide } from './roster-core.mjs';
import { KEY_FLEET_DAYS, KEY_ASSET_HISTORY, emptyFleetDays, emptyAssetHistory, diffAssets, appendHistory, archiveIndex, buildFromArchives,
  buildFleetDay, addDays, p5Periods } from './fleet-core.mjs';
export { KEY_FLEET_DAYS, KEY_ASSET_HISTORY };
import { KEY_SETTINGS, emptySettings, cleanFaultTypes, cleanHome, repeatFaults, unavailableNow, MCHECK_FAULT, SettingsError, businessOf, brandView, cleanBusiness } from './maint-core.mjs';
export { KEY_SETTINGS };

// The version these tools report (checked against package.json by tools/check.mjs).
export const APP_VERSION = '3.10';

export const KEY_DAY = 'day';
// Every Rezdy product name seen in a manifest, with the location it matched (v3.4).
export const KEY_PRODUCTS = 'rezdy-products';
const emptyProducts = () => ({ rev: 0, updatedAt: 0, products: {} });
export const KEY_ISSUES = 'issues';
export const KEY_ASSETS = 'assets';
export const KEY_MOVES = 'moves';
export const KEY_TEAM = 'team';
export const KEY_CHECKS = 'mchecks';       // every M-check ever done (read for history and exports)
export const KEY_CHECK_STATUS = 'mcheck-status'; // per bike: last check, last pass, last hire (small, read often)
export const KEY_SITE_LISTS = 'site-checklists';   // the opening and closing checklists for each site
export const KEY_SITE_CHECKS = 'site-checks';      // every opening and closing signed off
export const KEY_QR = 'qr-links';                  // the QR codes shown to guests
export const KEY_DAILY = 'daily-stats';            // one summary per hire day, for the dashboard
export const KEY_LOST = 'lost-property';           // the lost property register (photos are kept apart, under lost-photo/<id>)
export const KEY_MSG = 'message-templates';        // messages staff send guests: late for pickup, late returning, weather

// ── message templates ──────────────────────────────────────────────────────
// {first}, {site}, {time} and {weather} are filled in on the phone when a message is sent.
const DEFAULT_MESSAGES = [
  { id: 'late-pickup', label: 'Running late for pickup', text: "Hi {first}, it's the SA eBikes team at {site}. Your bikes are set up and ready to go. Could you let us know roughly when you'll get here? Running a little late isn't a problem. It just helps us have someone free to fit helmets and talk you through the route when you arrive. Thanks!" },
  { id: 'late-return', label: 'Late returning', text: "Hi {first}, it's the SA eBikes team. We hope you've had a good day out on the bikes. We close shortly and need the bikes back and on charge for tomorrow's riders. Could you let us know roughly when you'll be back? If anything's holding you up, call or reply and we'll help." },
  { id: 'weather', label: 'Weather warning', text: "Hi {first}, it's the SA eBikes team with a quick weather heads-up: {weather}. You might like to start heading back a little earlier, or wait it out somewhere sheltered. If you'd like a hand, call or reply and we'll help." },
];
export const emptyMessages = () => ({ rev: 0, updatedAt: 0, templates: DEFAULT_MESSAGES.map(t => ({ ...t })) });

// ── lost property ──────────────────────────────────────────────────────────
export const emptyLost = () => ({ rev: 0, updatedAt: 0, items: [] });
export const LOST_OUTCOMES = ['returned', 'posted', 'donated', 'disposed', 'police', 'other'];
const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
function photoData(v) {
  if (!v) return '';
  const s = String(v);
  if (!PHOTO_RE.test(s) || s.length > 600000) throw new HttpError(400, 'The photo must be a small JPEG, PNG or WebP image', 'invalid');
  return s;
}

// ── QR codes for guests ────────────────────────────────────────────────────
const DEFAULT_QR = [
  { id: 'ride', label: 'SA eBikes Ride Guide', url: 'https://saebikeride.netlify.app/' },
  { id: 'waiver', label: 'SA eBikes Online Waiver', url: 'https://waiver.smartwaiver.com/w/prwkdsokgygsjwcd3z5rna/web/' },
  { id: 'review', label: 'SA eBikes Google Review', url: 'https://g.page/r/CWIrDeCyAarQEBM/review' },
];
export const emptyQr = () => ({ rev: 0, updatedAt: 0, links: DEFAULT_QR.map(l => ({ ...l })) });

// ── daily summary ──────────────────────────────────────────────────────────
// One record per hire day, saved when the next manifest is loaded: bookings and bikes, walk-ins,
// bikes per hire location, load against availability for each model, and workshop counts.
export const emptyDaily = () => ({ rev: 0, updatedAt: 0, days: {} });
const adlDate = t => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
export function summariseDay(day, assetsDoc, issuesDoc, checksDoc) {
  const date = day.manifestDate;
  if (!date) return null;
  const models = {};
  const modelOf = code => { const a = assetsDoc.assets.find(x => x.id === code); return a ? (a.model || 'No model') : 'Not registered'; };
  const oos = new Set(fleetFlags(issuesDoc).oos);
  for (const a of assetsDoc.assets) {
    if (a.disposalDate && a.disposalDate <= date) continue;
    if (a.purchaseDate && a.purchaseDate > date) continue;
    const m = models[a.model || 'No model'] = models[a.model || 'No model'] || { fleet: 0, available: 0, out: 0 };
    m.fleet++; if (!oos.has(a.id)) m.available++;
  }
  const started = g => !g.startDate || g.startDate === date;
  let bookings = 0, walkins = 0;
  const hired = new Set(), out = new Set(), bySite = {};
  for (const g of day.groups || []) {
    const codes = g.bikes.map(b => b.code);
    codes.forEach(c => out.add(c));
    if (!codes.length || !started(g)) continue;
    if (g.walkin) walkins++; else bookings++;
    codes.forEach(c => hired.add(c));
    const site = g.site || 'NONE';
    bySite[site] = (bySite[site] || 0) + codes.length;
  }
  for (const c of out) { const m = models[modelOf(c)] = models[modelOf(c)] || { fleet: 0, available: 0, out: 0 }; m.out++; }
  const checks = (checksDoc ? checksDoc.checks : []).filter(c => adlDate(c.at) === date);
  return {
    date, bookings, walkins, groups: bookings + walkins,
    bikes: [...hired].length, bikesOut: out.size, bySite, models,
    hired: [...hired], oos: oos.size,
    mchecksPass: checks.filter(c => c.result === 'pass').length, mchecksFail: checks.filter(c => c.result === 'fail').length,
    savedAt: Date.now(),
  };
}
// Days each bike spent out of service (P5), from the time it went to P5 until resolved or lowered.
function workshopTime(issuesDoc) {
  const out = {};
  const now = Date.now();
  for (const i of issuesDoc.issues) {
    if (i.error) continue; // logged in error (v3.9): the bike wasn't really out of service
    const steps = [{ at: i.reportedAt, p: (i.updates || []).find(u => u.priorityFrom) ? (i.updates.find(u => u.priorityFrom).priorityFrom) : i.priority }]
      .concat((i.updates || []).filter(u => u.priorityTo).map(u => ({ at: u.at, p: u.priorityTo })));
    const end = i.status === 'resolved' && i.resolvedAt ? i.resolvedAt : now;
    for (let n = 0; n < steps.length; n++) {
      if (steps[n].p !== 5) continue;
      const to = n + 1 < steps.length ? steps[n + 1].at : end;
      (out[i.bikeId] = out[i.bikeId] || []).push([steps[n].at, Math.max(steps[n].at, to)]);
    }
  }
  return out; // { bike: [[from, to], ...] } in ms; the dashboard clips them to the period it shows
}
async function saveDaySummary(store, day) {
  if (!day || !day.manifestDate || !(day.groups || []).length) return null;
  const [assets, issues, checks] = await Promise.all([read(store, KEY_ASSETS, emptyAssets), read(store, KEY_ISSUES, emptyIssues), read(store, KEY_CHECKS, emptyChecks)]);
  const sum = summariseDay(day, assets.data, issues.data, checks.data);
  if (!sum) return null;
  await mutate(store, KEY_DAILY, emptyDaily, doc => { doc.days[sum.date] = sum; });
  return sum;
}

// ── site checklists ────────────────────────────────────────────────────────
// One opening and one closing list per site. VIC's lists are the starting point; a new site starts
// with a copy of them, edited in Admin. Mandatory items must be ticked as done before sign-off.
const DEFAULT_SITE_LISTS = {
  open: [
    'Site unlocked, alarm off, no sign of damage or tampering overnight',
    'Out-of-service (P5) bikes tagged and parked away from the hire line',
    'Batteries charged. Any still charging noted, with the expected ready time',
    'Solar charging system running, with no fault lights',
    "Today's manifest loaded. Equipment for flagged bookings set aside",
    "M-checks done for bikes due on today's list",
    'Helmets: enough in each size, clean, no damaged ones in use',
    'Locks, keys and phone holders counted and ready',
    'Ride Guide maps, QR codes and printed route cards stocked',
    'Sign and A-frame out. Hire area tidy and safe',
    'Weather checked. Any heat, wind or rain warnings shared with the team',
  ],
  close: [
    'Every group checked in and marked Returned, or Out overnight. Any overdue group chased',
    'On-site fleet count matches the register',
    "Bikes returned today M-checked, or noted as due for the morning",
    'Faults found today logged in the Issue Reporter',
    '*Batteries on charge for tomorrow',
    'Helmets wiped and returned. Damaged gear set aside',
    'Keys, locks and phone holders counted back in',
    'Lost property logged, with the customer contacted if known',
    '*Sign and A-frame in. Bikes secured. Site locked and alarm on',
  ],
};
const listFrom = lines => lines.map((l, n) => ({ key: 'i' + (n + 1), label: l.replace(/^\*/, ''), mandatory: l.startsWith('*') }));
export const emptySiteLists = () => ({ rev: 0, updatedAt: 0, sites: {} });
export const emptySiteChecks = () => ({ rev: 0, updatedAt: 0, records: [] });
// VIC's opening list also checks the backup status shown on the home screen (once a day is enough).
const BACKUP_ITEM = 'Backup status on the home screen is green (tell the manager if it\'s red)';
const siteListsFor = (doc, site) => doc.sites[site] ||
  { open: listFrom(site === 'VIC' ? [...DEFAULT_SITE_LISTS.open, BACKUP_ITEM] : DEFAULT_SITE_LISTS.open), close: listFrom(DEFAULT_SITE_LISTS.close), isDefault: true };
const MAX_ATTEMPTS = 6;


export class HttpError extends Error {
  constructor(status, message, code, extra) {
    super(message);
    this.status = status;
    this.code = code || 'error';
    this.extra = extra || {};
  }
}

export const emptyDay = () => ({ rev: 0, updatedAt: 0, manifestDate: '', manifestDateDisplay: '', contacts: [], groups: [], deletedGroups: [] });
export const emptyIssues = () => ({ rev: 0, updatedAt: 0, issues: [] });
// Locations live with the register. These four are the starting list; staff can add more.
// kind: hire (bookings start there), delivery (taken to the customer), collection (bikes dropped off at the
// end of the day), storage (kept there only). match: words that identify the location in a Rezdy product name.
export const DEFAULT_LOCATIONS = [
  { code: 'VIC', name: 'Visitor Centre', kind: 'hire', match: ['visitor centre', 'visitor center'] },
  { code: 'OXB', name: 'Oxenberry Farm', kind: 'hire', match: ['oxenberry'] },
  { code: 'BER', name: 'Beresford', kind: 'hire', match: ['beresford'] },
  { code: 'DOG', name: 'Dog Ridge', kind: 'hire', match: ['dog ridge'] },
  { code: 'SRV', name: 'Shirvington Wines', kind: 'hire', match: ['shirvington'] },
  { code: 'HUG', name: 'Hugo Wines', kind: 'hire', match: ['hugo'] },
  { code: 'HAZ', name: 'Nick Hazelgrove Wines', kind: 'hire', match: ['hazelgrove'] },
  { code: 'HMD', name: 'Home Delivery', kind: 'delivery', match: ['deliver', 'collection'] },
  { code: 'DLN', name: 'Dandelion Wines', kind: 'collection', match: [] },
  { code: 'HOM', name: 'Home storage and workshop', kind: 'storage', match: [] },
  { code: 'TRA', name: 'Trailer', kind: 'storage', match: [] },
];
export const LOCATION_KINDS = ['hire', 'delivery', 'collection', 'storage'];
// Brings an older location list up to date: adds any starting location it lacks, and gives each one
// a kind and matching words. Edits already made in Admin are kept.
function upgradeLocations(doc) {
  if (!Array.isArray(doc.locations)) doc.locations = [];
  for (const d of DEFAULT_LOCATIONS) {
    const l = doc.locations.find(x => x.code === d.code);
    if (!l) doc.locations.push({ ...d, match: [...d.match] });
    else { if (!l.kind) l.kind = d.kind; if (!Array.isArray(l.match)) l.match = [...d.match]; }
  }
  for (const l of doc.locations) { if (!l.kind) l.kind = 'storage'; if (!Array.isArray(l.match)) l.match = []; }
  return doc;
}
// Home delivery used to be DEL; it's HMD now.
function upgradeDaySites(day) {
  for (const x of [...(day.groups || []), ...(day.deletedGroups || []), ...(day.contacts || [])]) if (x.site === 'DEL') x.site = 'HMD';
  return day;
}
// Locations a hire can be at: hire sites and home delivery.
const hireCodes = locations => (locations || []).filter(l => !l.retired && (l.kind === 'hire' || l.kind === 'delivery')).map(l => l.code);
export const emptyAssets = () => ({ rev: 0, updatedAt: 0, assets: [], locations: DEFAULT_LOCATIONS.map(l => ({ ...l, match: [...l.match] })) });
// Every change of a bike's location, newest last. Kept apart from the register so the
// scanner's frequent reads of the register stay small.
export const emptyMoves = () => ({ rev: 0, updatedAt: 0, moves: [] });
const MAX_MOVES = 20000;
// The team list: names staff pick from on their phone. Retired members stay so old records still read.
export const emptyTeam = () => ({ rev: 0, updatedAt: 0, members: [] });
// M-checks are a safety record, so the log isn't capped.
export const emptyChecks = () => ({ rev: 0, updatedAt: 0, checks: [] });
export const emptyCheckStatus = () => ({ rev: 0, updatedAt: 0, bikes: {} });
// The checklist, in M-check order. Failing a critical item suggests P5 (out of service).
export const MCHECK_ITEMS = [
  { key: 'front', label: 'Front wheel and tyre' }, { key: 'steering', label: 'Steering and handlebars', critical: true },
  { key: 'brakes', label: 'Brakes, front and rear', critical: true }, { key: 'frame', label: 'Frame and fork', critical: true },
  { key: 'drive', label: 'Pedals, cranks and chain' }, { key: 'saddle', label: 'Saddle and seatpost' },
  { key: 'rear', label: 'Rear wheel, tyre and gears' }, { key: 'battery', label: 'Battery: seated, locked, charged', critical: true },
  { key: 'motor', label: 'Motor assist and display' }, { key: 'lights', label: 'Lights, bell and kickstand' },
];
// A bike needs an M-check if it has never passed one, or hasn't passed one since it last went out.
const needsCheck = st => !st || !st.lastPass || !!(st.lastHire && st.lastPass.at < st.lastHire.at);
function mcheckDue(statusDoc, assetsDoc) {
  return (assetsDoc ? assetsDoc.assets : []).filter(a => !a.disposalDate && needsCheck(statusDoc.bikes[a.id])).map(a => a.id);
}
// Initials of whoever is using the phone, sent with scanner actions. Optional.
const byOf = p => str(p && p.by, 10, 'Initials').toUpperCase();
// Fault type ids from a phone: only types that exist (retired ones too, for old issues), no repeats.
function faultsOf(v, settings) {
  const known = new Set(((settings && settings.faultTypes) || emptySettings().faultTypes).map(t => t.id));
  return [...new Set((Array.isArray(v) ? v : v ? [v] : []).map(String))].filter(t => known.has(t)).slice(0, 5);
}

// ── validation helpers ─────────────────────────────────────────────────────
const ID_RE = /^[A-Za-z0-9_-]{4,40}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function str(v, max, field, { required = false } = {}) {
  const s = v == null ? '' : String(v).trim();
  if (required && !s) throw new HttpError(400, `${field} is required`, 'invalid');
  if (s.length > max) throw new HttpError(400, `${field} is too long`, 'invalid');
  return s;
}
function id(v, field) {
  const s = String(v || '');
  if (!ID_RE.test(s)) throw new HttpError(400, `${field} is invalid`, 'invalid');
  return s;
}
export function normCode(v) {
  const s = String(v || '').trim().toUpperCase();
  if (!s || s.length > 30) throw new HttpError(400, 'Bike ID is invalid', 'invalid');
  return s;
}
// Odometer in whole km. Blank means "couldn't read it".
function km(v) {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(/[,\s]|km$/gi, ''));
  if (!Number.isFinite(n) || n < 0 || n > 500000) throw new HttpError(400, 'Odometer must be a number of km', 'invalid');
  return Math.round(n);
}
// Dollars, to the cent. Accepts "$1,850.00". Blank means not recorded.
function money(v, field) {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0 || n > 1000000) throw new HttpError(400, `${field} must be an amount in dollars`, 'invalid');
  return Math.round(n * 100) / 100;
}
function isoDate(v, field) {
  const s = str(v, 10, field);
  if (s && !DATE_RE.test(s)) throw new HttpError(400, `${field} must be a date`, 'invalid');
  return s;
}
const tomorrowISO = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);
function ts(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : Date.now();
}

// ── storage primitives ─────────────────────────────────────────────────────
async function read(store, key, empty) {
  const r = await store.getWithMetadata(key, { type: 'json' });
  const data = !r || r.data == null ? empty() : { ...empty(), ...r.data };
  if (key === KEY_ASSETS) upgradeLocations(data);
  if (key === KEY_DAY) upgradeDaySites(data);
  return { data, etag: r && r.data != null ? r.etag || null : null };
}

// Read, apply fn, write back only if nobody else wrote in between.
async function mutate(store, key, empty, fn) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data, etag } = await read(store, key, empty);
    const before = JSON.stringify(data);
    const result = (await fn(data)) || {};
    if (JSON.stringify(data) === before) return { data, ...result }; // nothing changed
    data.rev = (data.rev || 0) + 1;
    data.updatedAt = Date.now();
    const res = await store.setJSON(key, data, etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
    if (!res || res.modified !== false) return { data, ...result };
    await new Promise(r => setTimeout(r, 40 + Math.random() * 120)); // someone else wrote — retry
  }
  throw new HttpError(503, 'Too many simultaneous changes — please try again', 'busy');
}

async function archive(store, day, reason, reuseKey) {
  if (!day.groups.length && !day.contacts.length) return null;
  // A retried attempt (two phones saving at once) overwrites its own archive instead of adding another.
  const key = reuseKey || `archive/${day.manifestDate || 'undated'}/${Date.now()}-${reason}`;
  await store.setJSON(key, { archivedAt: Date.now(), reason, day });
  return key;
}

// ── views (what pages read) ────────────────────────────────────────────────
function fleetFlags(issuesDoc) {
  const oos = new Set(), open = new Set();
  for (const i of issuesDoc.issues) {
    if (i.status !== 'open' || i.error) continue;
    open.add(i.bikeId);
    if ((i.priority || 3) === 5) oos.add(i.bikeId);
  }
  return { oos: [...oos], openIssueBikes: [...open] };
}

// Brand and model for every registered bike, so the scanner can show what each barcode is.
function bikeInfo(assetsDoc) {
  const out = {};
  for (const a of (assetsDoc ? assetsDoc.assets : [])) {
    out[a.id] = { brand: a.brand || '', model: a.model || '' };
    if (a.disposalDate) out[a.id].disposed = a.disposalDate;
  }
  return out;
}

function scannerView(day, issuesDoc, assetsDoc, statusDoc) {
  return {
    mcheckDue: statusDoc ? mcheckDue(statusDoc, assetsDoc) : [],
    rev: day.rev,
    manifestDate: day.manifestDate,
    manifestDateDisplay: day.manifestDateDisplay,
    groups: day.groups,
    issuesRev: issuesDoc.rev,
    ...fleetFlags(issuesDoc),
    assetsRev: assetsDoc ? assetsDoc.rev : 0,
    bikeInfo: bikeInfo(assetsDoc),
    locations: (assetsDoc ? assetsDoc.locations : DEFAULT_LOCATIONS).filter(l => !l.retired).map(l => ({ code: l.code, name: l.name, kind: l.kind })),
    contactInfo: contactInfo(day),
    // v3.9: the day's undos and corrections, and groups deleted today (so they can be restored).
    corrections: day.corrections || [],
    deletedGroups: (day.deletedGroups || []).filter(g => !g.restoredAt).map(g => ({ id: g.id, name: g.name, bikes: g.bikes.length, deletedAt: g.deletedAt })),
  };
}
// For messaging from a group card: each booking's name, phone and latest message, by order number.
function contactInfo(day) {
  const out = {};
  for (const c of day.contacts || []) {
    if (!c.code) continue;
    const m = (c.messages || []).slice(-1)[0];
    out[c.code] = { name: c.name, phone: c.phone || '', ...(m ? { last: { label: m.label, status: m.status, at: m.at, by: m.by } } : {}) };
  }
  return out;
}
const contactsView = (day, assetsDoc) => ({
  rev: day.rev, manifestDate: day.manifestDate, manifestDateDisplay: day.manifestDateDisplay, contacts: day.contacts,
  locations: assetsDoc ? assetsDoc.locations.filter(l => !l.retired).map(l => ({ code: l.code, name: l.name, kind: l.kind })) : [],
});
// The issue reporter also gets the asset register, so it can confirm bike details as an ID is entered.
// v3.7: with the fault types and repeat window from Admin, and each issue's earlier repeats.
const issuesView = (doc, assetsDoc, settings) => ({
  rev: doc.rev, issues: doc.issues,
  assetsRev: assetsDoc ? assetsDoc.rev : undefined, assets: assetsDoc ? assetsDoc.assets : undefined,
  ...(settings ? { faultTypes: settings.faultTypes, repeatDays: settings.repeatDays, repeats: repeatFaults(doc.issues, settings.repeatDays) } : {}),
});
// Bikes out with a group right now (scanned, not checked in, group not returned).
function bikesOut(day) {
  const out = {};
  for (const g of (day ? day.groups : [])) {
    if (g.status === 'returned') continue;
    for (const b of g.bikes) if (!b.inAt) out[b.code] = g.name;
  }
  return out;
}
// For the register: each bike's last check and whether it's due.
function mcheckSummary(statusDoc) {
  const out = {};
  for (const [code, st] of Object.entries(statusDoc.bikes)) out[code] = { last: st.lastCheck || null, due: needsCheck(st) };
  return out;
}
// Staff see each person's Known as name and initials, never their contact details.
const teamView = doc => ({ rev: doc.rev, members: doc.members.map(m => ({ id: m.id, name: m.name, initials: m.initials, ...(m.retired ? { retired: true } : {}) })) });
const teamAdminView = doc => ({ rev: doc.rev, members: doc.members.map(m => ({ id: m.id, name: m.name, initials: m.initials, fullName: m.fullName || '', email: m.email || '', mobile: m.mobile || '', v: m.v || 0, ...(m.retired ? { retired: true } : {}) })) });
const fleetView = (doc, day) => ({ rev: doc.rev, assets: doc.assets, locations: doc.locations, out: bikesOut(day) });

// ── fleet records and register history (v3.6; see fleet-core.mjs) ──────────
// Moves queued history entries from the register into asset-history (each entry once), then
// clears them from the register.
// v3.7: repeat faults for the Dashboard: each issue that repeats an earlier one on the same bike.
async function dashboardRepeats(store, issuesDoc) {
  const st = (await read(store, KEY_SETTINGS, emptySettings)).data;
  const rep = repeatFaults(issuesDoc.issues, st.repeatDays);
  return { faultTypes: st.faultTypes, repeatDays: st.repeatDays,
    repeats: issuesDoc.issues.filter(i => rep[i.id]).map(i => ({ id: i.id, bike: i.bikeId, at: i.reportedAt, types: [...new Set(rep[i.id].map(r => r.type))], earlier: rep[i.id].length })) };
}
async function flushHistory(store, assetsDoc) {
  const q = (assetsDoc && assetsDoc.historyQueue) || [];
  if (!q.length) return;
  try {
    await mutate(store, KEY_ASSET_HISTORY, emptyAssetHistory, doc => {
      const have = new Set(doc.entries.slice(-500).map(e => e.id));
      const add = q.filter(e => !have.has(e.id));
      if (add.length) appendHistory(doc, add);
    });
    const done = new Set(q.map(e => e.id));
    await mutate(store, KEY_ASSETS, emptyAssets, doc => {
      if (!(doc.historyQueue || []).length) return;
      doc.historyQueue = doc.historyQueue.filter(e => !done.has(e.id));
      if (!doc.historyQueue.length) delete doc.historyQueue;
    });
  } catch (e) { console.warn('register history not saved yet (kept for the next save)', e); }
}
async function fleetContext(store) {
  const [assets, history, moves, issues] = await Promise.all([read(store, KEY_ASSETS, emptyAssets), read(store, KEY_ASSET_HISTORY, emptyAssetHistory),
    read(store, KEY_MOVES, emptyMoves), read(store, KEY_ISSUES, emptyIssues)]);
  const h = history.data;
  // Entries still queued in the register count too.
  const queued = (assets.data.historyQueue || []).filter(e => !h.entries.some(x => x.id === e.id));
  return { assets: assets.data.assets, locations: assets.data.locations, moves: moves.data.moves,
    history: queued.length ? { ...h, startedAt: h.startedAt || queued[0].at, entries: [...h.entries, ...queued] } : h,
    periods: p5Periods(issues.data.issues) };
}
// When a manifest replaces the previous day: that day's records, plus any days in between with no
// manifest, are written as they stood ("live"). A live record is never replaced by a rebuild.
async function saveFleetDays(store, previous, nextDate) {
  const from = previous.manifestDate;
  if (!from || !nextDate || nextDate <= from) return null;
  const dates = [from];
  for (let d = addDays(from, 1); d < nextDate && dates.length < 60; d = addDays(d, 1)) dates.push(d);
  const ctx = await fleetContext(store);
  const recs = await buildFromArchives(store, dates, ctx, { src: 'live', extra: { [from]: [previous] } });
  await mutate(store, KEY_FLEET_DAYS, emptyFleetDays, doc => { for (const r of recs) doc.days[r.date] = r; });
  return recs.length;
}
const FLEET_RANGE_MAX = 800; // days in one report

export async function handleView(store, params, ctx = {}) {
  const view = params.get('view');
  if (ADMIN_VIEWS.has(view)) needAdmin(ctx, { strict: view === 'teamAdmin' });
  if (view === 'backupStatus' || view === 'backups' || view === 'backupPart') return backupView(store, view, params, ctx);
  if (view === 'scanner') {
    const [day, issues, assets, status] = await Promise.all([read(store, KEY_DAY, emptyDay), read(store, KEY_ISSUES, emptyIssues), read(store, KEY_ASSETS, emptyAssets), read(store, KEY_CHECK_STATUS, emptyCheckStatus)]);
    return scannerView(day.data, issues.data, assets.data, status.data);
  }
  // M-check history: one bike (newest first), or every check for the export.
  if (view === 'mchecks') {
    const bike = params.get('bike') ? normCode(params.get('bike')) : '';
    const { checks } = (await read(store, KEY_CHECKS, emptyChecks)).data;
    const list = bike ? checks.filter(c => c.bike === bike) : checks;
    return { checks: [...list].reverse(), items: MCHECK_ITEMS };
  }
  if (view === 'contacts') {
    const [day, assets] = await Promise.all([read(store, KEY_DAY, emptyDay), read(store, KEY_ASSETS, emptyAssets)]);
    return contactsView(day.data, assets.data);
  }
  if (view === 'issues') {
    const [issues, assets, settings] = await Promise.all([read(store, KEY_ISSUES, emptyIssues), read(store, KEY_ASSETS, emptyAssets), read(store, KEY_SETTINGS, emptySettings)]);
    return issuesView(issues.data, assets.data, settings.data);
  }
  if (view === 'fleet') {
    const [assets, day, status, issues] = await Promise.all([read(store, KEY_ASSETS, emptyAssets), read(store, KEY_DAY, emptyDay), read(store, KEY_CHECK_STATUS, emptyCheckStatus), read(store, KEY_ISSUES, emptyIssues)]);
    return { ...fleetView(assets.data, day.data), mcheck: mcheckSummary(status.data), unavailable: unavailableNow(issues.data.issues) };
  }
  // v3.7: fault types, the repeat window and the home screen, for every page that needs them.
  if (view === 'settings') {
    const st = (await read(store, KEY_SETTINGS, emptySettings)).data;
    return { rev: st.rev, faultTypes: st.faultTypes, repeatDays: st.repeatDays, home: cleanHome(st.home.order, st.home.hidden), brand: brandView(st), business: businessOf(st), timeZone: TZ };
  }
  // v3.10: the business's name, logo, colours and font, for every page (cached on the phone).
  if (view === 'brand') return { brand: brandView((await read(store, KEY_SETTINGS, emptySettings)).data) };
  // v3.10 (Admin): everything on the Configuration page, as one file.
  if (view === 'configExport') {
    const [st, qr, msg, lists, assets] = await Promise.all([read(store, KEY_SETTINGS, emptySettings), read(store, KEY_QR, emptyQr), read(store, KEY_MSG, emptyMessages),
      read(store, KEY_SITE_LISTS, emptySiteLists), read(store, KEY_ASSETS, emptyAssets)]);
    const strip = d => { const { rev, updatedAt, ...rest } = d; return rest; };
    return { kind: 'operations-tools-configuration', schema: 1, appVersion: APP_VERSION, at: Date.now(), timeZone: TZ,
      sections: { business: businessOf(st.data), maintenance: { faultTypes: st.data.faultTypes, repeatDays: st.data.repeatDays }, home: st.data.home,
        qr: strip(qr.data), messages: strip(msg.data), checklists: strip(lists.data), locations: assets.data.locations } };
  }
  // v3.7: one bike's whole history, from purchase to disposal.
  if (view === 'bikeHistory') {
    const bike = normCode(params.get('bike'));
    if (!bike) throw new HttpError(400, 'Choose a bike', 'invalid');
    const [assets, history, moves, issues, checks, fleet, settings] = await Promise.all([read(store, KEY_ASSETS, emptyAssets), read(store, KEY_ASSET_HISTORY, emptyAssetHistory),
      read(store, KEY_MOVES, emptyMoves), read(store, KEY_ISSUES, emptyIssues), read(store, KEY_CHECKS, emptyChecks), read(store, KEY_FLEET_DAYS, emptyFleetDays), read(store, KEY_SETTINGS, emptySettings)]);
    const queued = (assets.data.historyQueue || []).filter(e => !history.data.entries.some(x => x.id === e.id));
    const allHist = [...history.data.entries, ...queued];
    // Every ID this bike has had, through renames.
    const ids = new Set([bike]);
    for (let grew = true; grew;) { grew = false; for (const e of allHist) if (e.how === 'renamed' && e.changes.id.some(x => ids.has(x)) && !e.changes.id.every(x => ids.has(x))) { e.changes.id.forEach(x => ids.add(x)); grew = true; } }
    let asset = assets.data.assets.find(a => a.id === bike) || null, removed = null;
    if (!asset) { const r = [...allHist].reverse().find(e => e.how === 'removed' && ids.has(e.bike)); if (r) { asset = r.snapshot; removed = r.at; } }
    const bikeIssues = issues.data.issues.filter(i => ids.has(i.bikeId));
    if (!asset && !bikeIssues.length) throw new HttpError(404, bike + ' isn\'t in the register', 'not-found');
    const days = {};
    for (const [d, r] of Object.entries(fleet.data.days)) for (const id of ids) if (r.bikes[id]) { days[d] = { ...r.bikes[id], src: r.src }; break; }
    // Repeats across all of this bike's IDs (an issue logged before a rename counts).
    const rep = repeatFaults(bikeIssues.map(i => ({ ...i, bikeId: bike })), settings.data.repeatDays);
    return { bike, asset, removed, ids: [...ids], history: allHist.filter(e => ids.has(e.bike)), moves: moves.data.moves.filter(m => ids.has(m.bike)),
      issues: bikeIssues.map(i => ({ ...i, repeats: rep[i.id] || [] })), checks: checks.data.checks.filter(c => ids.has(c.bike)), days,
      faultTypes: settings.data.faultTypes, repeatDays: settings.data.repeatDays, mcheckItems: MCHECK_ITEMS.map(i => ({ key: i.key, label: i.label })),
      locations: assets.data.locations.map(l => ({ code: l.code, name: l.name, kind: l.kind })) };
  }
  if (view === 'moves') {
    const bike = params.get('bike') ? normCode(params.get('bike')) : '';
    const { moves } = (await read(store, KEY_MOVES, emptyMoves)).data;
    const list = bike ? moves.filter(m => m.bike === bike) : moves;
    return { moves: list.slice(-(bike ? 200 : MAX_MOVES)).reverse() };
  }
  if (view === 'team') return teamView((await read(store, KEY_TEAM, emptyTeam)).data);
  if (view === 'teamAdmin') return teamAdminView((await read(store, KEY_TEAM, emptyTeam)).data);
  if (view === 'roster' || view === 'rosterAdmin') {
    const rctx = await rosterContext(store);
    return rosterView((await read(store, KEY_ROSTER, emptyRoster)).data, rctx, { start: params.get('start') || '', days: params.get('days') || 7, admin: view === 'rosterAdmin' });
  }
  // Site checklists: each active location's lists, and what's been signed off on the given day.
  if (view === 'sitechecks') {
    const date = params.get('date') || '';
    const [lists, checks, assets] = await Promise.all([read(store, KEY_SITE_LISTS, emptySiteLists), read(store, KEY_SITE_CHECKS, emptySiteChecks), read(store, KEY_ASSETS, emptyAssets)]);
    const sites = assets.data.locations.filter(l => !l.retired).map(l => l.code);
    const out = { date, sites: {}, locations: assets.data.locations.filter(l => !l.retired).map(l => ({ code: l.code, name: l.name })) };
    for (const site of sites) {
      const day = checks.data.records.filter(r => r.site === site && r.date === date);
      out.sites[site] = { lists: siteListsFor(lists.data, site), open: day.filter(r => r.kind === 'open').pop() || null, close: day.filter(r => r.kind === 'close').pop() || null,
        skip: day.filter(r => r.kind === 'skip').pop() || null };
    }
    return out;
  }
  if (view === 'rezdyProducts') return productsView((await read(store, KEY_PRODUCTS, emptyProducts)).data);
  if (view === 'qr') { const r = (await read(store, KEY_QR, emptyQr)).data; return { links: r.links, rev: r.rev || 0 }; }
  if (view === 'messages') { const r = (await read(store, KEY_MSG, emptyMessages)).data; return { templates: r.templates, rev: r.rev || 0 }; }
  if (view === 'lost') return lostView((await read(store, KEY_LOST, emptyLost)).data);
  if (view === 'lostphoto') {
    const pid = id(params.get('id'), 'Item id');
    const photo = await store.get('lost-photo/' + pid, { type: 'json' });
    return { id: pid, photo: photo ? photo.data : '' };
  }
  // Everything the dashboard needs: the saved daily summaries plus today's so far, the register,
  // and time out of service per bike this financial year (from the issue log).
  if (view === 'dashboard') {
    const [daily, day, assets, issues, checks] = await Promise.all([read(store, KEY_DAILY, emptyDaily), read(store, KEY_DAY, emptyDay),
      read(store, KEY_ASSETS, emptyAssets), read(store, KEY_ISSUES, emptyIssues), read(store, KEY_CHECKS, emptyChecks)]);
    const days = { ...daily.data.days };
    const live = summariseDay(day.data, assets.data, issues.data, checks.data);
    if (live && (day.data.groups || []).length) days[live.date] = { ...live, live: true };
    // v3.6: for days with fleet records, each model's fleet and bikes available come from the records,
    // which say what each bike was on the day (not what today's register and issues say).
    const fleet = (await read(store, KEY_FLEET_DAYS, emptyFleetDays)).data.days;
    for (const [d, sum] of Object.entries(days)) {
      const r = fleet[d];
      if (!r || !sum.models) continue;
      const models = {};
      for (const b of Object.values(r.bikes)) {
        if (b.u) continue;
        const m = models[b.m] = models[b.m] || { fleet: 0, available: 0, out: 0 };
        m.fleet++; if (b.s === 'a' || b.s === 'h') m.available++;
      }
      for (const [m, v] of Object.entries(sum.models)) models[m] = { ...(models[m] || { fleet: 0, available: 0 }), out: v.out };
      days[d] = { ...sum, models, fleetRecords: true };
    }
    return { days, today: day.data.manifestDate || '', assets: assets.data.assets.map(a => ({ id: a.id, model: a.model || '', purchaseDate: a.purchaseDate || '', disposalDate: a.disposalDate || '' })),
      locations: assets.data.locations.map(l => ({ code: l.code, name: l.name, kind: l.kind })), workshop: workshopTime(issues.data), ...(await dashboardRepeats(store, issues.data)) };
  }
  // Fleet report (v3.6): the records between two dates, plus today's so far (not yet frozen).
  if (view === 'fleetReport') {
    const from = String(params.get('from') || ''), to = String(params.get('to') || '');
    if (!DATE_RE.test(from) || !DATE_RE.test(to) || to < from) throw new HttpError(400, 'Choose a start and end date', 'invalid');
    if ((Date.parse(to) - Date.parse(from)) / 864e5 > FLEET_RANGE_MAX) throw new HttpError(400, 'Choose a period of up to two years', 'invalid');
    const [fleet, day, assets, history, moves] = await Promise.all([read(store, KEY_FLEET_DAYS, emptyFleetDays), read(store, KEY_DAY, emptyDay),
      read(store, KEY_ASSETS, emptyAssets), read(store, KEY_ASSET_HISTORY, emptyAssetHistory), read(store, KEY_MOVES, emptyMoves)]);
    const days = {};
    for (const [d, r] of Object.entries(fleet.data.days)) if (d >= from && d <= to) days[d] = r;
    const today = day.data.manifestDate;
    if (today && today >= from && today <= to && !days[today]) {
      const ctx = await fleetContext(store);
      const idx = await archiveIndex(store);
      const [r] = await buildFromArchives(store, [today], ctx, { index: { ...idx, [today]: idx[today] || [] }, src: 'today', extra: { [today]: [day.data] } });
      if (r) { r.manifest = true; days[today] = r; }
    }
    const all = Object.keys(fleet.data.days).sort();
    return { from, to, days, today: today || '', first: all[0] || '', last: all[all.length - 1] || '',
      locations: assets.data.locations.map(l => ({ code: l.code, name: l.name, kind: l.kind, ...(l.retired ? { retired: true } : {}) })),
      assets: assets.data.assets.map(a => ({ id: a.id, brand: a.brand || '', model: a.model || '', disposalDate: a.disposalDate || '' })),
      historyStart: history.data.startedAt || 0, movesStart: moves.data.moves.length ? moves.data.moves[0].at : 0 };
  }
  // The register's change history: one bike's (latest 200) or everyone's.
  if (view === 'assetHistory') {
    const bike = params.get('bike') ? normCode(params.get('bike')) : '';
    const [h, assets] = await Promise.all([read(store, KEY_ASSET_HISTORY, emptyAssetHistory), read(store, KEY_ASSETS, emptyAssets)]);
    const queued = (assets.data.historyQueue || []).filter(e => !h.data.entries.some(x => x.id === e.id));
    const all = [...h.data.entries, ...queued];
    const list = bike ? all.filter(e => e.bike === bike || (e.how === 'renamed' && e.changes.id.includes(bike))) : all;
    return { startedAt: h.data.startedAt || (queued[0] && queued[0].at) || 0, entries: list.slice(-(bike ? 200 : 20000)).reverse() };
  }
  // Admin: what a fleet rebuild would cover.
  if (view === 'fleetRebuildInfo') {
    const [idx, fleet, day] = await Promise.all([archiveIndex(store), read(store, KEY_FLEET_DAYS, emptyFleetDays), read(store, KEY_DAY, emptyDay)]);
    const dates = Object.keys(idx).sort();
    const recs = Object.values(fleet.data.days);
    return { firstArchive: dates[0] || '', lastArchive: dates[dates.length - 1] || '', archivedDays: dates.length, today: day.data.manifestDate || '',
      live: recs.filter(r => r.src === 'live').length, rebuilt: recs.filter(r => r.src === 'rebuilt').length };
  }
  if (view === 'sitechecklog') {
    const site = String(params.get('site') || '').toUpperCase();
    const { records } = (await read(store, KEY_SITE_CHECKS, emptySiteChecks)).data;
    return { records: (site ? records.filter(r => r.site === site) : records).slice().reverse() };
  }
  // The previous manifest's day, read-only: the newest archive saved when a manifest replaced
  // a different date (a reload of the same date doesn't count).
  if (view === 'previous') {
    const current = (await read(store, KEY_DAY, emptyDay)).data;
    const { blobs } = await store.list({ prefix: 'archive/' });
    const keys = blobs.map(b => b.key).filter(k => /-manifest$/.test(k) && k.split('/')[1] !== current.manifestDate)
      .sort((a, b) => Number(b.split('/')[2].split('-')[0]) - Number(a.split('/')[2].split('-')[0]));
    if (!keys.length) return { found: false };
    const data = await store.get(keys[0], { type: 'json' });
    if (!data || !data.day) return { found: false };
    const d = data.day;
    return { found: true, archivedAt: data.archivedAt, manifestDate: d.manifestDate, manifestDateDisplay: d.manifestDateDisplay, groups: d.groups || [], contacts: d.contacts || [] };
  }
  if (view === 'archives') {
    const { blobs } = await store.list({ prefix: 'archive/' });
    return { archives: blobs.map(b => b.key).sort().reverse().slice(0, 2000) };
  }
  if (view === 'archive') {
    const key = String(params.get('key') || '');
    if (!/^archive\/[\w-]+\/[\w-]+$/.test(key)) throw new HttpError(400, 'Invalid archive key', 'invalid');
    const data = await store.get(key, { type: 'json' });
    if (!data) throw new HttpError(404, 'Archive not found', 'not-found');
    return data;
  }
  throw new HttpError(400, 'Unknown view', 'invalid');
}

// ── actions (what pages change) ────────────────────────────────────────────
function findGroup(day, groupId) {
  const g = day.groups.find(x => x.id === groupId);
  if (!g) throw new HttpError(404, 'That group no longer exists — it may have been deleted or replaced by a new manifest', 'no-group');
  return g;
}

function cleanContact(c) {
  return {
    code: str(c.code, 40, 'Order number', { required: true }),
    name: str(c.name, 120, 'Customer name'),
    phone: str(c.phone, 40, 'Phone'),
    ptime: str(c.ptime, 40, 'Pick-up time'),
    ploc: str(c.ploc, 160, 'Pick-up location'),
    bikeLines: (Array.isArray(c.bikeLines) ? c.bikeLines : []).slice(0, 20).map(l => str(l, 160, 'Bike line')),
    totalBikes: Math.max(0, Math.min(200, parseInt(c.totalBikes, 10) || 0)),
    flags: (Array.isArray(c.flags) ? c.flags : []).slice(0, 20).map(f => str(f, 80, 'Flag')),
    special: str(c.special, 1000, 'Special requirements'),
    dropoff: str(c.dropoff, 200, 'Drop-off location'),
    hireDays: hireDaysOf(c.hireDays),
    ...hireWhere(c),
    ...phoneCheck(c),
  };
}
// Phone checks are done on the phone (libphonenumber); the server keeps what they found.
// phoneFrom: the number as it arrived, when it was corrected. phoneCheck: true when it still doesn't look valid.
function phoneCheck(c) {
  const out = {};
  const d = str(c && c.phoneDisplay, 40, 'Phone'); if (d) out.phoneDisplay = d;
  const f = str(c && c.phoneFrom, 40, 'Phone'); if (f) out.phoneFrom = f;
  const n = str(c && c.phoneNote, 120, 'Phone note'); if (n) out.phoneNote = n;
  if (c && c.phoneCheck) out.phoneCheck = true;
  return out;
}
// From the pickup manifest: where the hire is (a location code such as VIC, BER or HMD), the Rezdy product and the agent.
function hireWhere(x) {
  let site = String((x && x.site) || '').toUpperCase();
  if (site === 'DEL') site = 'HMD';
  return { site: /^[A-Z0-9]{2,6}$/.test(site) ? site : '', product: str(x && x.product, 120, 'Product'), agent: str(x && x.agent, 60, 'Agent') };
}

// ── multi-day hires ────────────────────────────────────────────────────────
const MAX_HIRE_DAYS = 7;
function hireDaysOf(v) {
  const n = parseInt(v, 10);
  return n >= 1 && n <= MAX_HIRE_DAYS ? n : 1;
}
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
// Which day of its hire a group is on, for a given manifest date.
const dayOfHire = (g, date) => (g.startDate ? daysBetween(g.startDate, date) : 0) + 1;

// Check-in and return. A bike is checked in when it comes back; Returned needs every bike
// checked in, or a recorded reason for each one that isn't.
export const EXCEPTION_REASONS = ['collect', 'damaged', 'missing', 'other'];
const isIn = b => !!b.inAt;

// Why a bike came off a group. Kept with the group so the day's trail shows every change.
export const REMOVE_REASONS = ['swap', 'fault', 'mistake', 'cleared', 'undone', 'other'];
// v3.9: undos and corrections. An Undo (within 10 seconds, on the phone) needs no reason; a
// correction needs initials and a reason. Either way the original stays and the trail records it.
function correctionOf(p, kind, extra) {
  const undo = p.undo === true;
  const by = byOf(p);
  const reason = str(p.reason, 300, 'Reason');
  if (!undo && p.requireReason !== false && !reason) throw new HttpError(400, 'Give a reason for the correction', 'invalid');
  return { id: Math.random().toString(36).slice(2, 12), at: Date.now(), kind, undo, by, reason, ...extra };
}
function takeOff(g, bike, reason, at, by) {
  g.removed = g.removed || [];
  g.removed.push({ ...bike, removedAt: at, reason, ...(by ? { removedBy: by } : {}) });
}

// The contact for a hand-added group, linked by a made-up order number so it carries over like a booking.
function setContact(day, g, c) {
  if (!g.code) g.code = 'WALK-' + g.id.slice(0, 8).toUpperCase();
  const fields = cleanContact({ ...c, code: g.code, name: c.name || g.name.split(' (')[0], site: g.site, ptime: g.ptime, totalBikes: g.bikes.length });
  const i = day.contacts.findIndex(x => x.code === g.code);
  const rec = { ...(i >= 0 ? day.contacts[i] : {}), ...fields, walkin: true, groupId: g.id, startDate: g.startDate || day.manifestDate || '' };
  if (!c.phone) { delete rec.phoneFrom; delete rec.phoneNote; delete rec.phoneCheck; delete rec.phoneDisplay; }
  if (i >= 0) day.contacts[i] = rec; else day.contacts.push(rec);
  g.contactName = rec.name; g.contactPhone = rec.phoneDisplay || rec.phone || '';
}

// Delete group, Clear all and Reset day carry the manifest date they were made on (dayOf). If a
// different day has been loaded since (a phone that was offline overnight), they're refused.
const staleDay = (day, p) => !!(p && p.dayOf && day.manifestDate && p.dayOf !== day.manifestDate);
const dayChanged = () => new HttpError(409, 'A new day has been loaded since this was done, so it was not applied', 'day-changed');

const dayActions = {
  // A walk-in or other group added by hand: where it's hired from, when it started, 4 hours or a full day,
  // and optionally a contact (name and phone), which can also be added later.
  async createGroup(day, p, ctx) {
    const gid = id(p.groupId, 'Group id');
    const name = str(p.name, 80, 'Group name', { required: true });
    if (day.groups.some(g => g.id === gid)) return;
    const g = { id: gid, name, status: '', bikes: [], hireDays: hireDaysOf(p.hireDays), startDate: day.manifestDate || '', walkin: true };
    const where = hireWhere(p);
    if (where.site && (!ctx || !ctx.locations || hireCodes(ctx.locations).includes(where.site))) g.site = where.site;
    g.startAt = ts(p.startAt);
    g.ptime = str(p.ptime, 40, 'Start time');
    if (p.hireLength === '4h') g.hireLength = '4h';
    day.groups.push(g);
    if (p.contact && (p.contact.name || p.contact.phone)) setContact(day, g, p.contact);
  },
  async setGroupSite(day, p, ctx) {
    const g = findGroup(day, p.groupId);
    const site = hireWhere(p).site;
    if (!site || !hireCodes(ctx && ctx.locations).includes(site)) throw new HttpError(400, 'Choose a hire location or Home Delivery', 'invalid');
    g.site = site;
    const c = g.code && day.contacts.find(x => x.code === g.code);
    if (c) c.site = site;
  },
  // Bikes left at a collection point (Dandelion) at the end of the hire: every bike still out is checked in
  // there and the group is closed. The bikes are moved to that location in the register.
  async dropOff(day, p, ctx) {
    const g = findGroup(day, p.groupId);
    const loc = String(p.location || '').toUpperCase();
    const l = (ctx && ctx.locations || []).find(x => x.code === loc && !x.retired);
    if (!l || l.kind !== 'collection') throw new HttpError(400, 'Choose a collection point', 'invalid');
    const at = ts(p.at), by = byOf(p);
    // Already dropped there (a retry): pass the bikes on again, so their moves are finished if the
    // first attempt stopped part-way. Moving a bike already at the drop-off point changes nothing.
    if (g.status === 'returned' && g.droppedAt === loc) return { result: 'already-saved', dropped: { codes: g.bikes.filter(b => b.droppedAt === loc).map(b => b.code), loc, groupName: g.name } };
    for (const b of g.bikes) if (!isIn(b)) { b.inAt = at; if (by) b.inBy = by; b.droppedAt = loc; }
    g.statusBeforeDrop = g.status || 'out';
    g.status = 'returned'; g.returnedAt = at; g.returnedBy = by; g.exceptions = []; g.droppedAt = loc;
    g.statusBy = by; g.statusAt = Date.now();
    return { dropped: { codes: g.bikes.filter(b => b.droppedAt === loc).map(b => b.code), loc, groupName: g.name } };
  },
  // A message to a guest: logged as "opened" when Text or WhatsApp is tapped, then marked sent or not sent.
  async logMessage(day, p) {
    const c = day.contacts.find(x => x.code === str(p.code, 40, 'Order number', { required: true }));
    if (!c) throw new HttpError(404, 'That booking is no longer on the contact list', 'not-found');
    const e = p.entry || {};
    const mid = id(e.id, 'Message id');
    c.messages = c.messages || [];
    if (c.messages.some(x => x.id === mid)) return;
    c.messages.push({ id: mid, at: ts(e.at), by: byOf(p), template: str(e.template, 40, 'Template'), label: str(e.label, 60, 'Message', { required: true }),
      channel: e.channel === 'whatsapp' ? 'whatsapp' : 'sms', status: 'opened' });
    if (c.messages.length > 30) c.messages = c.messages.slice(-30);
  },
  async updateMessage(day, p) {
    const c = day.contacts.find(x => x.code === p.code);
    const m = c && (c.messages || []).find(x => x.id === p.id);
    if (!m) throw new HttpError(404, 'That message is no longer on record', 'not-found');
    if (!['sent', 'not-sent'].includes(p.status)) throw new HttpError(400, 'Sent or not sent?', 'invalid');
    m.status = p.status; m.confirmedAt = Date.now();
    const by = byOf(p); if (by) m.confirmedBy = by;
    m.reason = p.status === 'not-sent' ? str(p.reason, 120, 'Reason') : '';
  },
  async setGroupContact(day, p) {
    const g = findGroup(day, p.groupId);
    const cur = g.code ? day.contacts.find(x => x.code === g.code) : null;
    if (p.baseV != null && cur && (cur.v || 0) !== p.baseV) {
      const want = p.contact || {};
      if ((cur.name || '') === (want.name || '') && (cur.phone || '') === (want.phone || '')) return { result: 'already-saved' };
      throw new HttpError(409, 'Someone changed this contact since you opened it', 'changed', { current: { name: cur.name || '', phone: cur.phoneDisplay || cur.phone || '', v: cur.v || 0 } });
    }
    setContact(day, g, p.contact || {});
    const now = day.contacts.find(x => x.code === g.code);
    if (now) now.v = (cur && cur.v || 0) + 1;
  },
  // A deleted group is kept aside (not shown on phones) so its bikes still appear in the day's archive.
  async deleteGroup(day, p) {
    if (staleDay(day, p)) throw dayChanged();
    const g = day.groups.find(x => x.id === p.groupId);
    if (!g) return;
    day.groups = day.groups.filter(x => x.id !== p.groupId);
    if (g.bikes.length || (g.removed || []).length) {
      day.deletedGroups = day.deletedGroups || [];
      day.deletedGroups.push({ ...g, deletedAt: Date.now() });
    }
  },
  // Out, Out overnight, Returned, or none. Returned needs every bike checked in, or an exception
  // (a reason) for each bike that isn't. Undoing Returned clears its exceptions.
  async setGroupStatus(day, p) {
    const status = String(p.status || '');
    if (!['', 'out', 'overnight', 'returned'].includes(status)) throw new HttpError(400, 'Invalid status', 'invalid');
    const g = findGroup(day, p.groupId);
    if (status === 'returned' && g.status !== 'returned') {
      const outstanding = g.bikes.filter(b => !isIn(b));
      const given = Array.isArray(p.exceptions) ? p.exceptions : [];
      const exceptions = outstanding.map(b => {
        const e = given.find(x => x && x.bikeId === b.id);
        if (!e) throw new HttpError(409, `${b.code} hasn't been checked in`, 'not-checked-in', { code: b.code });
        const reason = EXCEPTION_REASONS.includes(e.reason) ? e.reason : 'other';
        const note = str(e.note, 300, 'Exception note');
        if (reason === 'other' && !note) throw new HttpError(400, `Add a note for ${b.code}`, 'invalid');
        return { bikeId: b.id, code: b.code, reason, note, at: ts(p.at), ...(byOf(p) ? { by: byOf(p) } : {}) };
      });
      g.exceptions = exceptions;
      g.returnedAt = ts(p.at);
      g.returnedBy = byOf(p);
    }
    if (status !== 'returned' && g.status === 'returned') { g.exceptions = []; g.returnedAt = null; g.returnedBy = ''; }
    g.statusBy = byOf(p);
    g.statusAt = Date.now();
    if (status === 'overnight' && dayOfHire(g, day.manifestDate) >= (g.hireDays || 1)) {
      throw new HttpError(409, 'This is the last day of the hire, so the bikes are due back today', 'last-day');
    }
    if (p.undo === true && g.status !== status) {
      day.corrections = day.corrections || [];
      day.corrections.push(correctionOf(p, 'status', { groupId: g.id, group: g.name, from: g.status, to: status }));
    }
    g.status = status;
  },
  // v3.9: a drop-off undone (Undo, or a correction with a reason): the bikes it checked in are
  // unticked and moved back, and the group goes back to how it was. Once only.
  async undoDropOff(day, p) {
    const g = findGroup(day, p.groupId);
    if (!g.droppedAt) {
      if ((day.corrections || []).some(c => c.kind === 'drop-off' && c.groupId === g.id)) return { result: 'already-saved' };
      throw new HttpError(409, g.name + ' wasn\'t dropped off', 'invalid');
    }
    const loc = g.droppedAt, codes = [];
    for (const b of g.bikes) if (b.droppedAt === loc) { delete b.inAt; delete b.inBy; delete b.droppedAt; codes.push(b.code); }
    const c = correctionOf(p, 'drop-off', { groupId: g.id, group: g.name, location: loc, codes });
    day.corrections = day.corrections || []; day.corrections.push(c);
    g.status = g.statusBeforeDrop || 'out'; delete g.statusBeforeDrop;
    delete g.droppedAt; g.returnedAt = null; g.returnedBy = ''; g.exceptions = [];
    g.statusBy = byOf(p); g.statusAt = Date.now();
    return { undropped: { codes, loc } };
  },
  // v3.9: a group deleted by mistake, back as it was. Its bikes that have since gone out with
  // another group stay with that group (they're listed as taken off this one).
  async restoreGroup(day, p) {
    const d = (day.deletedGroups || []).find(x => x.id === p.groupId && !x.restoredAt);
    if (!d) { if (day.groups.some(x => x.id === p.groupId)) return { result: 'already-saved' }; throw new HttpError(404, 'That group isn\'t in today\'s deleted groups', 'not-found'); }
    if (day.groups.some(x => x.id === d.id)) throw new HttpError(409, 'A group with that id is already in today\'s list', 'invalid');
    const c = correctionOf(p, 'restore-group', { groupId: d.id, group: d.name });
    const { deletedAt, restoredAt, ...g } = d;
    const at = Date.now(), elsewhere = [];
    g.bikes = (g.bikes || []).filter(b => {
      const other = day.groups.find(x => x.status !== 'returned' && x.bikes.some(o => o.code === b.code && !isIn(o)));
      if (other && !isIn(b)) { elsewhere.push(b.code); takeOff(g, b, 'other', at, byOf(p)); return false; }
      return true;
    });
    day.groups.push(g);
    d.restoredAt = at;
    c.elsewhere = elsewhere;
    day.corrections = day.corrections || []; day.corrections.push(c);
    return { elsewhere };
  },
  // Tick a bike in (or out again, for a mistaken tap).
  async checkIn(day, p) {
    const g = findGroup(day, p.groupId);
    const b = g.bikes.find(x => x.id === p.bikeId);
    if (!b) return;
    if (p.in === false) {
      if (!b.inAt) return;
      // v3.9: unticking is an undo or a correction, kept in the day's trail; the bike moves back.
      // (A phone on an older page sends no reason; that's still recorded.)
      const c = correctionOf({ ...p, requireReason: false }, 'check-in', { groupId: g.id, group: g.name, code: b.code, was: b.inAt });
      day.corrections = day.corrections || []; day.corrections.push(c);
      delete b.inAt; delete b.inBy;
      return { uncheck: { code: b.code } };
    }
    if (!b.inAt) { b.inAt = ts(p.at); const by = byOf(p); if (by) b.inBy = by; }
    return { code: b.code, groupName: g.name };
  },
  // Set by hand when the internal note was missed. Can't be shorter than the day the hire is on.
  async setHireDays(day, p) {
    const g = findGroup(day, p.groupId);
    const n = hireDaysOf(p.hireDays);
    const today = dayOfHire(g, day.manifestDate);
    if (n < today) throw new HttpError(409, `This hire is already on day ${today}`, 'invalid');
    g.hireDays = n;
    if (!g.startDate) g.startDate = day.manifestDate;
    const c = day.contacts.find(x => x.code && x.code === g.code);
    if (c) c.hireDays = n;
  },
  async addBike(day, p, ctx) {
    const g = findGroup(day, p.groupId);
    const bike = { id: id(p.bike && p.bike.id, 'Bike entry id'), code: normCode(p.bike && p.bike.code), ts: ts(p.bike && p.bike.ts) };
    const by = byOf(p);
    if (by) bike.by = by;
    // A retried request: already in the group. The hire is still passed on, so a retry after a
    // half-finished first attempt still records it for the M-check rule (that step is safe to repeat).
    const same = g.bikes.find(b => b.id === bike.id);
    if (same) return { result: 'already-saved', hired: { code: same.code, entryId: same.id, at: same.ts, group: g.name } };
    if (g.bikes.some(b => b.code === bike.code)) throw new HttpError(409, `${bike.code} is already in this group`, 'duplicate');
    if (ctx.flags.oos.includes(bike.code)) throw new HttpError(409, `${bike.code} is out of service`, 'oos');
    // v3.8: a bike still out with another group (not checked in, group not returned) is refused. It has
    // to be checked in, or taken off that group, first, so one bike can't be on two hires at once.
    const other = day.groups.find(x => x.id !== g.id && x.status !== 'returned' && x.bikes.some(b => b.code === bike.code && !isIn(b)));
    if (other) throw new HttpError(409, `${bike.code} is still out with ${other.name}. Check it in, or take it off that group, first.`, 'out-elsewhere', { group: other.name, groupId: other.id });
    // Record what the bike was when it went out, so archives stay readable if the register changes later.
    const a = ctx.assets.find(x => x.id === bike.code);
    if (a) { bike.brand = a.brand || ''; bike.model = a.model || ''; }
    // The bike's M-check as it stood when it went out, kept with the hire.
    const st = ctx.checkStatus && ctx.checkStatus.bikes[bike.code];
    if (st && st.lastCheck) bike.mcheck = { at: st.lastCheck.at, by: st.lastCheck.by, result: st.lastCheck.result };
    if (a && needsCheck(st)) bike.mcheckDue = true;
    g.bikes.push(bike);
    return { result: 'added', openIssue: ctx.flags.openIssueBikes.includes(bike.code), alsoIn: null, inRegister: !!a, disposed: a && a.disposalDate ? a.disposalDate : null,
      mcheckDue: !!bike.mcheckDue, hired: { code: bike.code, entryId: bike.id, at: bike.ts, group: g.name } };
  },
  // The bike leaves the group but stays on its record as removed, with the time and reason.
  // It can be scanned into any group again straight away.
  async removeBike(day, p) {
    const g = day.groups.find(x => x.id === p.groupId);
    if (!g) return;
    const b = g.bikes.find(x => x.id === p.bikeId);
    if (!b) return; // already removed (a retried request)
    const reason = REMOVE_REASONS.includes(p.reason) ? p.reason : 'other';
    g.bikes = g.bikes.filter(x => x.id !== p.bikeId);
    takeOff(g, b, reason, ts(p.removedAt), byOf(p));
    // Scanned by mistake or swapped before riding: the bike didn't go out, so its M-check still stands.
    if (reason === 'mistake' || reason === 'swap' || reason === 'undone') return { unhired: { code: b.code, entryId: b.id } };
  },
  async clearGroup(day, p) {
    if (staleDay(day, p)) throw dayChanged();
    const g = findGroup(day, p.groupId), at = ts(p.removedAt);
    g.bikes.forEach(b => takeOff(g, b, 'cleared', at, byOf(p)));
    g.bikes = [];
  },
  async resetDay(day, p, ctx) {
    if (staleDay(day, p)) throw dayChanged();
    ctx.archiveKey = await archive(ctx.store, JSON.parse(JSON.stringify(day)), 'reset', ctx.archiveKey);
    day.groups = [];
    day.deletedGroups = [];
  },
  async loadManifest(day, p, ctx) {
    const manifestDate = str(p.manifestDate, 10, 'Manifest date', { required: true });
    if (!DATE_RE.test(manifestDate)) throw new HttpError(400, 'Manifest date is invalid', 'invalid');
    // The same load sent twice (a retry after a lost reply) is recognised and changes nothing.
    if (p.loadId && day.loadId === String(p.loadId)) return { result: 'already-saved' };
    let groups = (Array.isArray(p.groups) ? p.groups : []).slice(0, 200)
      .map(g => ({
        id: id(g.id, 'Group id'), name: str(g.name, 120, 'Group name', { required: true }), status: '', bikes: [],
        code: str(g.code, 40, 'Order number'), special: str(g.special, 1000, 'Special requirements'),
        dropoff: str(g.dropoff, 200, 'Drop-off location'), hireDays: hireDaysOf(g.hireDays), startDate: manifestDate,
        ...hireWhere(g), ptime: str(g.ptime, 40, 'Start time'),
        // v3.5: bikes booked, and any non-standard equipment ("1× Child Seat"), shown when issuing.
        qty: Math.max(0, Math.min(99, parseInt(g.qty, 10) || 0)),
        equip: (Array.isArray(g.equip) ? g.equip : []).slice(0, 6).map(x => String(x || '').trim().slice(0, 40)).filter(Boolean),
      }));
    let contacts = (Array.isArray(p.contacts) ? p.contacts : []).slice(0, 300).map(cleanContact);
    // Only locations on the list count; anything else is left without a location.
    const okSites = hireCodes(ctx.locations);
    for (const x of [...groups, ...contacts]) if (x.site && !okSites.includes(x.site)) x.site = '';

    // Carried into the new day, with their bikes:
    //  - multi-day hires still running (Rezdy only lists a hire on its first day);
    //  - any earlier group with bikes not yet checked in and not marked Returned: overdue.
    // Works for a reload of the same day and for skipped days too.
    const startOf = g => g.startDate || day.manifestDate || '';
    const running = g => (g.hireDays || 1) > 1 && dayOfHire(g, manifestDate) <= g.hireDays;
    const stillOut = g => g.bikes.some(b => !isIn(b));
    const carried = (day.groups || []).filter(g => startOf(g) && startOf(g) < manifestDate && g.status !== 'returned' &&
      (running({ ...g, startDate: startOf(g) }) || stillOut(g)));
    const carriedCodes = new Set(carried.map(g => g.code).filter(Boolean));
    groups = groups.filter(g => !(g.code && carriedCodes.has(g.code)));
    contacts = contacts.filter(c => !carriedCodes.has(c.code));
    const carriedGroups = carried.map(g => {
      const onSchedule = running({ ...g, startDate: startOf(g) });
      return {
        ...g, startDate: startOf(g), status: 'out', exceptions: [], returnedAt: null, removed: [],
        // A multi-day hire on schedule starts the day with every bike out. An overdue group keeps the
        // bikes already checked in, so only the missing ones need ticking.
        bikes: g.bikes.map(b => { const x = { ...b }; delete x.pending; if (onSchedule) { delete x.inAt; delete x.inBy; } return x; }),
      };
    });
    const carriedContacts = carried.map(g => (day.contacts || []).find(c => c.code && c.code === g.code)).filter(Boolean);
    // A day with no bookings is allowed when asked for ("No bookings today", or an empty file confirmed).
    if (!groups.length && !carriedGroups.length && p.empty !== true) throw new HttpError(400, 'The manifest has no groups', 'invalid');

    ctx.previous = JSON.parse(JSON.stringify(day));
    ctx.archiveKey = await archive(ctx.store, ctx.previous, 'manifest', ctx.archiveKey);
    if (ctx.previous.manifestDate && ctx.previous.manifestDate !== manifestDate) ctx.summarise = ctx.previous;
    ctx.carried = carriedGroups.length;
    ctx.overdue = carriedGroups.filter(g => dayOfHire(g, manifestDate) > (g.hireDays || 1)).length;
    groups = [...carriedGroups, ...groups];
    contacts = [...carriedContacts, ...contacts.map(c => ({ ...c, startDate: manifestDate }))];
    day.groups = groups;
    day.deletedGroups = [];
    day.contacts = contacts;
    day.manifestDate = manifestDate;
    day.manifestDateDisplay = str(p.manifestDateDisplay, 40, 'Manifest date label');
    day.loadId = p.loadId ? String(p.loadId).slice(0, 40) : '';
  },
};

const issueActions = {
  async reportIssue(doc, p, ctx) {
    const i = p.issue || {};
    const issueId = id(i.id, 'Issue id');
    if (doc.issues.some(x => x.id === issueId)) return { result: 'already-saved' };
    const priority = parseInt(i.priority, 10);
    if (!(priority >= 1 && priority <= 5)) throw new HttpError(400, 'Priority must be 1–5', 'invalid');
    // An odometer reading is required, unless staff tick that it can't be read (e.g. a flat battery).
    const odo = km(i.odometer);
    if (odo == null && !i.odometerUnreadable) throw new HttpError(400, 'Odometer reading is required', 'invalid');
    doc.issues.unshift({
      id: issueId,
      bikeId: normCode(i.bikeId),
      issue: str(i.issue, 2000, 'Issue description', { required: true }),
      priority,
      notes: str(i.notes, 1000, 'Notes') || null,
      reportedBy: str(i.reportedBy, 10, 'Initials', { required: true }).toUpperCase(),
      reportedAt: Date.now(),
      odometer: odo,
      status: 'open',
      resolution: null, repairedBy: null, resolvedAt: null,
      updates: [],
      faults: faultsOf(i.faults, ctx.settings),
    });
    // Record the bike's details as they were when the issue was logged.
    const a = ctx.assets.find(x => x.id === doc.issues[0].bikeId);
    if (a) doc.issues[0].asset = { serial: a.serial || '', keyNumber: a.keyNumber, brand: a.brand, model: a.model, size: a.size, purchaseDate: a.purchaseDate };
    return { result: 'added', inRegister: !!a };
  },
  // Anyone can add an update to any issue, open or resolved: progress, parts, a changed priority.
  // A priority change on an open issue takes effect straight away (P5 takes the bike out of service).
  async updateIssue(doc, p, ctx) {
    const issue = doc.issues.find(x => x.id === p.id);
    if (!issue) throw new HttpError(404, 'That issue no longer exists', 'not-found');
    const u = p.update || {};
    const updateId = id(u.id, 'Update id');
    issue.updates = issue.updates || [];
    if (issue.updates.some(x => x.id === updateId)) return { result: 'already-saved' };
    if (issue.updates.length >= 100) throw new HttpError(400, 'This issue has reached 100 updates', 'invalid');
    // v3.7: an update can set or change the fault types; the text can then be left out.
    const faults = u.faults !== undefined ? faultsOf(u.faults, ctx && ctx.settings) : null;
    const faultsChange = faults && JSON.stringify(faults) !== JSON.stringify(issue.faults || []);
    const entry = {
      id: updateId,
      at: Date.now(),
      by: str(u.by, 10, 'Initials', { required: true }).toUpperCase(),
      text: str(u.text, 2000, 'Update', { required: !faultsChange }),
    };
    if (faultsChange) { entry.faultsFrom = issue.faults || []; entry.faultsTo = faults; issue.faults = faults; }
    const odo = km(u.odometer);
    if (odo != null) entry.odometer = odo;
    if (u.priority != null && u.priority !== '') {
      const pr = parseInt(u.priority, 10);
      if (!(pr >= 1 && pr <= 5)) throw new HttpError(400, 'Priority must be 1–5', 'invalid');
      if (pr !== issue.priority) {
        if (issue.status === 'resolved') throw new HttpError(409, 'Priority can only be changed on an open issue', 'resolved');
        entry.priorityFrom = issue.priority;
        entry.priorityTo = pr;
        issue.priority = pr;
      }
    }
    issue.updates.push(entry);
    return { result: 'updated' };
  },
  // v3.9 corrections, once per issue, with initials and a reason; the original is kept on the issue.
  async reopenIssue(doc, p) {
    const issue = doc.issues.find(x => x.id === p.id);
    if (!issue) throw new HttpError(404, 'That issue no longer exists', 'not-found');
    if ((issue.corrections || []).length) throw new HttpError(409, 'This issue has already been corrected', 'already-corrected');
    if (issue.status !== 'resolved' || issue.error) throw new HttpError(409, 'Only a repaired issue can be reopened', 'invalid');
    const c = correctionOf(p, 'reopened', { resolution: issue.resolution, repairedBy: issue.repairedBy, resolvedAt: issue.resolvedAt });
    if (!c.by) throw new HttpError(400, 'Initials are required', 'invalid');
    issue.corrections = [c];
    issue.status = 'open'; issue.resolution = null; issue.repairedBy = null; issue.resolvedAt = null;
    return { result: 'reopened' };
  },
  async issueInError(doc, p) {
    const issue = doc.issues.find(x => x.id === p.id);
    if (!issue) throw new HttpError(404, 'That issue no longer exists', 'not-found');
    if ((issue.corrections || []).length) throw new HttpError(409, 'This issue has already been corrected', 'already-corrected');
    const c = correctionOf(p, 'logged-in-error', { status: issue.status, resolution: issue.resolution, repairedBy: issue.repairedBy, resolvedAt: issue.resolvedAt });
    if (!c.by) throw new HttpError(400, 'Initials are required', 'invalid');
    issue.corrections = [c];
    issue.error = true;
    issue.status = 'resolved'; issue.resolution = 'Logged in error: ' + c.reason; issue.repairedBy = c.by; issue.resolvedAt = c.at;
    return { result: 'in-error' };
  },
  async resolveIssue(doc, p) {
    const issue = doc.issues.find(x => x.id === p.id);
    if (!issue) throw new HttpError(404, 'That issue no longer exists', 'not-found');
    // Already resolved (a retry, or someone else got there first): the work is done, so it's not an error.
    if (issue.status === 'resolved') return { result: 'already-resolved', resolvedBy: issue.repairedBy || '', resolvedAt: issue.resolvedAt || 0 };
    issue.status = 'resolved';
    issue.resolution = str(p.resolution, 2000, 'Repair details', { required: true });
    issue.repairedBy = str(p.repairedBy, 80, "Repairer's name", { required: true });
    issue.resolvedAt = Date.now();
    return { result: 'resolved' };
  },
};

// ── asset register ─────────────────────────────────────────────────────────
// partial: only fields actually supplied are returned, so a spreadsheet without (say)
// a Purchase Price column leaves existing prices alone. ID and serial are always required.
function cleanAsset(a, { partial = false } = {}) {
  a = a || {};
  const out = {
    id: normCode(a.id),
    // Serials are stored upper case with spaces tidied.
    serial: str(a.serial, 40, 'Serial number', { required: true }).toUpperCase().replace(/\s+/g, ' '),
  };
  const fields = {
    keyNumber: v => str(v, 30, 'Key number'),
    brand: v => str(v, 60, 'Brand'),
    model: v => str(v, 80, 'Model'),
    size: v => str(v, 30, 'Frame or rim size'),
    purchaseDate: v => isoDate(v, 'Purchase date'),
    purchasePrice: v => money(v, 'Purchase price'),
    disposalDate: v => isoDate(v, 'Disposal date'),
    salePrice: v => money(v, 'Sale price'),
    disposalNote: v => str(v, 120, 'Disposal note'),
  };
  for (const [k, clean] of Object.entries(fields)) {
    if (partial && a[k] === undefined) continue;
    out[k] = clean(a[k]);
  }
  return out;
}
// Checks across fields, run on the finished record.
function checkAsset(a) {
  const tomorrow = tomorrowISO();
  if (a.purchaseDate && a.purchaseDate > tomorrow) throw new HttpError(400, 'Purchase date is in the future', 'invalid');
  if (a.disposalDate && a.disposalDate > tomorrow) throw new HttpError(400, 'Disposal date is in the future', 'invalid');
  if (a.disposalDate && a.purchaseDate && a.disposalDate < a.purchaseDate) throw new HttpError(400, 'Disposal date is before the purchase date', 'invalid');
  if (a.salePrice != null && !a.disposalDate) throw new HttpError(400, 'Add the disposal date as well as the sale price', 'invalid');
  if (a.disposalNote && !a.disposalDate) throw new HttpError(400, 'Add the disposal date as well as the disposal note', 'invalid');
}

// Two bikes can't share a frame serial. Comparison ignores spaces, so "WTU 123" and "WTU123" clash.
const serialKey = s => String(s || '').toUpperCase().replace(/\s+/g, '');
function checkSerials(assets) {
  const seen = new Map();
  for (const x of assets) {
    const k = serialKey(x.serial);
    if (!k) continue;
    if (seen.has(k)) throw new HttpError(409, `Serial ${x.serial} is recorded against both ${seen.get(k)} and ${x.id}`, 'serial-exists');
    seen.set(k, x.id);
  }
}

// ── locations and moves ────────────────────────────────────────────────────
const LOC_RE = /^[A-Z0-9]{2,6}$/;
function locCode(v) {
  const c = String(v || '').trim().toUpperCase();
  if (!LOC_RE.test(c)) throw new HttpError(400, 'Location code must be 2–6 letters or numbers', 'invalid');
  return c;
}
// A location the bike can be moved to: on the list and not retired.
function activeLocation(doc, code) {
  const l = doc.locations.find(x => x.code === code);
  if (!l) throw new HttpError(400, `There's no location ${code}`, 'invalid');
  if (l.retired) throw new HttpError(400, `${code} has been retired`, 'invalid');
  return l;
}
function moveRecord(bike, from, to, meta) {
  return { id: Math.random().toString(36).slice(2, 12), at: Date.now(), bike, from: from || '', to, how: meta.how, by: meta.by || '', note: meta.note || '' };
}
async function appendMoves(store, moves) {
  if (!moves.length) return;
  await mutate(store, KEY_MOVES, emptyMoves, doc => {
    doc.moves.push(...moves);
    if (doc.moves.length > MAX_MOVES) doc.moves = doc.moves.slice(-MAX_MOVES);
  });
}
// Moves bikes in the register and logs each change. A bike already there, or not in the register, is skipped.
// Moves each bike back from its latest move of this kind (check-in or drop-off), if it's still there.
async function moveBack(store, codes, how, by) {
  const { moves } = (await read(store, KEY_MOVES, emptyMoves)).data;
  const assets = (await read(store, KEY_ASSETS, emptyAssets)).data.assets;
  const back = {};
  for (const code of codes) {
    const m = [...moves].reverse().find(x => x.bike === code && x.how === how);
    const a = assets.find(x => x.id === code);
    if (m && m.from && a && a.location === m.to) (back[m.from] = back[m.from] || []).push(code);
  }
  for (const [to, list] of Object.entries(back)) await moveBikes(store, list, to, { how: 'correction', by, note: 'undone ' + how });
}
export async function moveBikes(store, codes, to, meta) {
  let moves = [], results = [];
  await mutate(store, KEY_ASSETS, emptyAssets, doc => {
    moves = []; results = [];
    activeLocation(doc, to);
    for (const code of codes) {
      const a = doc.assets.find(x => x.id === code);
      if (!a) { results.push({ code, result: 'not-registered' }); continue; }
      if (a.location === to) { results.push({ code, result: 'already-there' }); continue; }
      moves.push(moveRecord(a.id, a.location, to, meta));
      results.push({ code, result: 'moved', from: a.location || '' });
      a.location = to; a.v = (a.v || 0) + 1;
    }
  });
  await appendMoves(store, moves);
  return results;
}

// ── M-checks ───────────────────────────────────────────────────────────────
// A pass signs the bike off. A fail also logs an issue in the Issue Reporter, linked to the check.
// Safe to retry: the check and the issue both carry ids from the phone.
async function recordMcheck(store, body) {
  const c = body.check || {};
  const checkId = id(c.id, 'Check id');
  const bike = normCode(c.bike);
  const by = str(c.by || body.by, 10, 'Initials', { required: true }).toUpperCase();
  const keys = MCHECK_ITEMS.map(i => i.key);
  const failed = (Array.isArray(c.failed) ? c.failed : []).filter(k => keys.includes(k));
  const result = failed.length ? 'fail' : 'pass';
  const note = str(c.note, 1000, 'Note');
  const odometer = km(c.odometer);
  const assetsDoc = (await read(store, KEY_ASSETS, emptyAssets)).data;
  const asset = assetsDoc.assets.find(a => a.id === bike);
  const at = Date.now();
  let issueId = null;
  if (result === 'fail') {
    issueId = id(c.issueId, 'Issue id');
    const priority = parseInt(c.priority, 10) >= 1 && parseInt(c.priority, 10) <= 5 ? parseInt(c.priority, 10)
      : failed.some(k => MCHECK_ITEMS.find(i => i.key === k).critical) ? 5 : 3;
    const labels = failed.map(k => MCHECK_ITEMS.find(i => i.key === k).label);
    await mutate(store, KEY_ISSUES, emptyIssues, doc => {
      if (doc.issues.some(x => x.id === issueId)) return;
      doc.issues.unshift({
        id: issueId, bikeId: bike, issue: 'M-check failed: ' + labels.join('; ') + (note ? '. ' + note : ''),
        priority, notes: null, reportedBy: by, reportedAt: at, odometer, status: 'open',
        resolution: null, repairedBy: null, resolvedAt: null, updates: [], source: 'mcheck', checkId,
        faults: [...new Set(failed.map(k => MCHECK_FAULT[k]).filter(Boolean))],
        ...(asset ? { asset: { serial: asset.serial || '', keyNumber: asset.keyNumber, brand: asset.brand, model: asset.model, size: asset.size, purchaseDate: asset.purchaseDate } } : {}),
      });
    });
  }
  let added = false;
  await mutate(store, KEY_CHECKS, emptyChecks, doc => {
    added = false;
    if (doc.checks.some(x => x.id === checkId)) return;
    doc.checks.push({ id: checkId, at, bike, by, result, failed, note, ...(odometer != null ? { odometer } : {}), ...(issueId ? { issueId } : {}) });
    added = true;
  });
  const statusDoc = (await mutate(store, KEY_CHECK_STATUS, emptyCheckStatus, doc => {
    if (!added) return;
    const st = doc.bikes[bike] = doc.bikes[bike] || {};
    st.lastCheck = { id: checkId, at, by, result };
    if (result === 'pass') st.lastPass = { id: checkId, at, by };
  })).data;
  const [day, issues] = await Promise.all([read(store, KEY_DAY, emptyDay), read(store, KEY_ISSUES, emptyIssues)]);
  return { ok: true, result: added ? result : 'already-saved', inRegister: !!asset, issueId,
    view: scannerView(day.data, issues.data, assetsDoc, statusDoc) };
}

// ── team ───────────────────────────────────────────────────────────────────
const INITIALS_RE = /^[A-Z]{1,5}$/;
// name is the person's "Known as" name: the only name staff ever see. Full name, email and
// mobile are contact details, kept for Admin only; a field left out of a save keeps its value.
const CONTACT_FIELDS = ['fullName', 'email', 'mobile'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function cleanMember(m) {
  const name = str(m && m.name, 60, 'Known as', { required: true });
  const initials = str(m && m.initials, 5, 'Initials', { required: true }).toUpperCase();
  if (!INITIALS_RE.test(initials)) throw new HttpError(400, 'Initials must be 1–5 letters', 'invalid');
  const out = { name, initials };
  if (m && 'fullName' in m) out.fullName = str(m.fullName, 100, 'Full name');
  if (m && 'email' in m) {
    out.email = str(m.email, 120, 'Email').toLowerCase();
    if (out.email && !EMAIL_RE.test(out.email)) throw new HttpError(400, 'That email address doesn\'t look right', 'invalid');
  }
  if (m && 'mobile' in m) {
    out.mobile = str(m.mobile, 30, 'Mobile');
    if (out.mobile && !/^[+\d][\d ()-]{5,29}$/.test(out.mobile)) throw new HttpError(400, 'That mobile number doesn\'t look right', 'invalid');
  }
  return out;
}
const hasContacts = m => !!m && CONTACT_FIELDS.some(f => f in m);
// Signing off an opening or closing. Every item needs an answer; mandatory items must be done.
async function recordSiteCheck(store, body) {
  const r = body.record || {};
  const recId = id(r.id, 'Checklist id');
  // "Not required today": the site doesn't open. No items; a reason is optional.
  if (r.kind === 'skip') return recordSiteSkip(store, body, r, recId);
  const kind = r.kind === 'close' ? 'close' : r.kind === 'open' ? 'open' : '';
  if (!kind) throw new HttpError(400, 'Opening or closing?', 'invalid');
  const date = str(r.date, 10, 'Date', { required: true });
  if (!DATE_RE.test(date)) throw new HttpError(400, 'Date must be a date', 'invalid');
  const by = str(r.by || body.by, 10, 'Initials', { required: true }).toUpperCase();
  const [listsDoc, assetsDoc] = (await Promise.all([read(store, KEY_SITE_LISTS, emptySiteLists), read(store, KEY_ASSETS, emptyAssets)])).map(x => x.data);
  const site = String(r.site || '').toUpperCase();
  if (!assetsDoc.locations.some(l => l.code === site && !l.retired)) throw new HttpError(400, `There's no site ${site}`, 'invalid');
  const list = siteListsFor(listsDoc, site)[kind];
  const answers = Array.isArray(r.items) ? r.items : [];
  const items = list.map(it => {
    const a = answers.find(x => x && x.key === it.key);
    if (!a || (a.done !== true && a.done !== false)) throw new HttpError(400, `Answer every item: "${it.label}"`, 'invalid');
    if (it.mandatory && !a.done) throw new HttpError(400, `"${it.label}" must be done before signing off`, 'mandatory');
    return { key: it.key, label: it.label, mandatory: !!it.mandatory, done: a.done, note: str(a.note, 300, 'Note') };
  });
  let added = false;
  const out = await mutate(store, KEY_SITE_CHECKS, emptySiteChecks, doc => {
    added = false;
    if (doc.records.some(x => x.id === recId)) return;
    doc.records.push({ id: recId, site, kind, date, at: Date.now(), by, items, problems: items.filter(i => !i.done).length, note: str(r.note, 1000, 'Note') });
    added = true;
  });
  return { ok: true, result: added ? 'signed-off' : 'already-saved', record: out.data.records.find(x => x.id === recId) };
}

async function recordSiteSkip(store, body, r, recId) {
  const date = str(r.date, 10, 'Date', { required: true });
  if (!DATE_RE.test(date)) throw new HttpError(400, 'Date must be a date', 'invalid');
  const by = str(r.by || body.by, 10, 'Initials', { required: true }).toUpperCase();
  const site = String(r.site || '').toUpperCase();
  const assetsDoc = (await read(store, KEY_ASSETS, emptyAssets)).data;
  if (!assetsDoc.locations.some(l => l.code === site && !l.retired)) throw new HttpError(400, `There's no site ${site}`, 'invalid');
  let added = false;
  const out = await mutate(store, KEY_SITE_CHECKS, emptySiteChecks, doc => {
    added = false;
    if (doc.records.some(x => x.id === recId)) return;
    doc.records.push({ id: recId, site, kind: 'skip', date, at: Date.now(), by, items: [], problems: 0, note: str(r.note, 300, 'Reason') });
    added = true;
  });
  return { ok: true, result: added ? 'not-required' : 'already-saved', record: out.data.records.find(x => x.id === recId) };
}

// ── lost property register ──
const lostView = doc => ({ rev: doc.rev, items: doc.items });
async function lostBackup(store) {
  const doc = (await read(store, KEY_LOST, emptyLost)).data;
  const photos = {};
  for (const i of doc.items) if (i.hasPhoto) { const ph = await store.get('lost-photo/' + i.id, { type: 'json' }); if (ph) photos[i.id] = ph.data; }
  return { ...doc, photos };
}
const lostDate = (v, field) => { const d = str(v, 10, field, { required: true }); if (!DATE_RE.test(d)) throw new HttpError(400, `${field} must be a date`, 'invalid'); return d; };
const findLost = (doc, lid) => { const i = doc.items.find(x => x.id === lid); if (!i) throw new HttpError(404, 'That item is no longer on the register', 'not-found'); return i; };
const lostActions = {
  // A new item: what it is, when and where it was found, who found it, where it's kept, and (optionally) whose it is.
  async lostAdd(doc, p) {
    const it = p.item || {};
    const lid = id(it.id, 'Item id');
    if (doc.items.some(x => x.id === lid)) return { result: 'already-saved' };
    const rec = {
      id: lid, description: str(it.description, 200, 'Description', { required: true }), foundDate: lostDate(it.foundDate, 'Date found'),
      foundSite: str(it.foundSite, 6, 'Where found').toUpperCase(), foundNote: str(it.foundNote, 200, 'Where found note'),
      foundBy: byOf(p), storedAt: str(it.storedAt, 6, 'Where it is kept').toUpperCase(), storedNote: str(it.storedNote, 200, 'Storage note'),
      groupName: str(it.groupName, 120, 'Group'), orderCode: str(it.orderCode, 40, 'Order number'), guestName: str(it.guestName, 120, 'Guest name'),
      ...phoneCheck(it), guestPhone: str(it.guestPhone, 40, 'Guest phone'),
      status: 'open', log: [], createdAt: Date.now(), hasPhoto: !!p.photo,
    };
    rec.v = 1;
    doc.items.unshift(rec);
    return { result: 'added' };
  },
  // Change the details (where it's kept, the owner, the description) or the photo.
  async lostEdit(doc, p) {
    const i = findLost(doc, p.id);
    const f = p.fields || {};
    if (p.baseV != null && p.baseV !== (i.v || 0)) throw new HttpError(409, 'Someone changed this item since you opened it', 'changed', { current: i });
    for (const [k, max] of [['description', 200], ['foundNote', 200], ['storedNote', 200], ['groupName', 120], ['orderCode', 40], ['guestName', 120], ['guestPhone', 40]])
      if (f[k] !== undefined) i[k] = str(f[k], max, k, { required: k === 'description' });
    for (const k of ['foundSite', 'storedAt']) if (f[k] !== undefined) i[k] = str(f[k], 6, k).toUpperCase();
    if (f.foundDate !== undefined) i.foundDate = lostDate(f.foundDate, 'Date found');
    if (f.guestPhone !== undefined) Object.assign(i, { phoneDisplay: '', phoneFrom: '', phoneNote: '', phoneCheck: false }, phoneCheck(f));
    if (p.photo !== undefined) i.hasPhoto = !!p.photo;
    i.updatedAt = Date.now();
    i.v = (i.v || 0) + 1;
    return { result: 'updated' };
  },
  // A follow-up: what was tried, by whom and when.
  async lostNote(doc, p) {
    const i = findLost(doc, p.id);
    const nid = id(p.noteId, 'Note id');
    if (i.log.some(x => x.id === nid)) return { result: 'already-saved' };
    i.log.push({ id: nid, at: Date.now(), by: byOf(p), text: str(p.text, 500, 'Note', { required: true }) });
    return { result: 'noted' };
  },
  async lostClose(doc, p) {
    const i = findLost(doc, p.id);
    if (!LOST_OUTCOMES.includes(p.outcome)) throw new HttpError(400, 'Choose what happened to the item', 'invalid');
    if (i.status === 'closed' && i.outcome === p.outcome) return { result: 'already-saved' };
    i.status = 'closed'; i.v = (i.v || 0) + 1; i.outcome = p.outcome; i.closedDate = lostDate(p.closedDate, 'Closure date');
    i.closedNote = str(p.note, 300, 'Note'); i.closedBy = byOf(p);
    if (p.outcome === 'other' && !i.closedNote) throw new HttpError(400, 'Add a note saying what happened', 'invalid');
    return { result: 'closed' };
  },
  async lostReopen(doc, p) {
    const i = findLost(doc, p.id);
    if (i.status === 'open') return { result: 'already-saved' }; // a retry: no second "Reopened" note
    i.v = (i.v || 0) + 1;
    i.status = 'open'; delete i.outcome; delete i.closedDate; delete i.closedNote; delete i.closedBy;
    i.log.push({ id: Math.random().toString(36).slice(2, 12), at: Date.now(), by: byOf(p), text: 'Reopened' });
    return { result: 'reopened' };
  },
};

const siteListActions = {
  // Edit a site's opening or closing list (Admin). Items keep their key while their wording stays the same.
  async saveChecklist(doc, p) {
    const site = locCode(p.site);
    const kind = p.kind === 'close' ? 'close' : p.kind === 'open' ? 'open' : '';
    if (!kind) throw new HttpError(400, 'Opening or closing?', 'invalid');
    const lines = (Array.isArray(p.items) ? p.items : []).slice(0, 60);
    if (!lines.length) throw new HttpError(400, 'A checklist needs at least one item', 'invalid');
    const cur = siteListsFor(doc, site);
    const used = new Set();
    let n = Math.max(0, ...['open', 'close'].flatMap(k => cur[k].map(i => parseInt(String(i.key).slice(1), 10) || 0)));
    const items = lines.map(l => {
      const label = str(l.label, 200, 'Item', { required: true });
      const old = cur[kind].find(i => i.label === label && !used.has(i.key));
      const key = old ? old.key : 'i' + (++n);
      used.add(key);
      return { key, label, mandatory: !!l.mandatory };
    });
    if (p.baseV != null && p.baseV !== (cur.v || 0)) {
      if (JSON.stringify(cur[kind].map(i => [i.label, i.mandatory])) === JSON.stringify(items.map(i => [i.label, i.mandatory]))) return { result: 'already-saved' };
      throw new HttpError(409, 'Someone changed this site\'s checklists since you opened them', 'changed');
    }
    doc.sites[site] = { open: cur.open, close: cur.close, [kind]: items, v: (cur.v || 0) + 1 };
    return { result: 'saved' };
  },
};

const teamActions = {
  async addMember(doc, p) {
    const m = cleanMember(p.member);
    const mid = id(p.member.id, 'Member id');
    const same = doc.members.find(x => x.id === mid);
    if (same) { if (same.name === m.name && same.initials === m.initials) return { result: 'already-saved' }; throw new HttpError(409, 'That person is already on the list', 'exists'); }
    if (doc.members.some(x => !x.retired && x.initials === m.initials)) throw new HttpError(409, `Someone already uses ${m.initials}`, 'exists');
    doc.members.push({ id: mid, ...m, v: 1 });
    doc.members.sort((a, b) => a.name.localeCompare(b.name));
    return { result: 'added' };
  },
  async updateMember(doc, p) {
    const x = doc.members.find(y => y.id === p.id);
    if (!x) throw new HttpError(404, 'That person is no longer on the list', 'not-found');
    const m = cleanMember(p.member);
    // The edit-conflict check: refuse if someone saved this person since the form was opened.
    if (p.baseV != null && p.baseV !== (x.v || 0)) {
      const same = Object.keys(m).every(k => (x[k] || '') === m[k]);
      if (same) return { result: 'already-saved' };
      throw new HttpError(409, 'Someone changed this person\'s details since you opened them', 'changed', { current: teamAdminView({ members: [x] }).members[0] });
    }
    if (doc.members.some(y => y.id !== x.id && !y.retired && y.initials === m.initials)) throw new HttpError(409, `Someone already uses ${m.initials}`, 'exists');
    Object.assign(x, m);
    x.v = (x.v || 0) + 1;
    doc.members.sort((a, b) => a.name.localeCompare(b.name));
    return { result: 'updated' };
  },
  async retireMember(doc, p) {
    const x = doc.members.find(y => y.id === p.id);
    if (!x) throw new HttpError(404, 'That person is no longer on the list', 'not-found');
    if (p.retired === false) {
      if (doc.members.some(y => y.id !== x.id && !y.retired && y.initials === x.initials)) throw new HttpError(409, `Someone already uses ${x.initials}`, 'exists');
      delete x.retired;
    } else x.retired = true;
    return { result: p.retired === false ? 'restored' : 'retired' };
  },
};

const locKind = k => (LOCATION_KINDS.includes(k) ? k : 'storage');
// Matching words: a list, or text separated by commas. Lower case, 2 to 40 characters each.
function matchWords(v) {
  const list = Array.isArray(v) ? v : String(v || '').split(',');
  return [...new Set(list.map(w => String(w).trim().toLowerCase()).filter(w => w.length >= 2 && w.length <= 40))].slice(0, 12);
}

const assetActions = {
  // isNew stops "Add bike" silently overwriting a bike that's already registered.
  // originalId lets an existing record be renamed (e.g. a replaced barcode).
  async saveAsset(doc, p) {
    const a = cleanAsset(p.asset);
    const originalId = p.originalId ? normCode(p.originalId) : '';
    const existing = doc.assets.find(x => x.id === a.id);
    if (p.isNew && existing) {
      // A retry of an add that went through: the same details again is fine.
      if (Object.keys(a).every(k => JSON.stringify(existing[k] ?? '') === JSON.stringify(a[k] ?? ''))) return { result: 'already-saved', moves: [] };
      throw new HttpError(409, `${a.id} is already in the register — edit it instead`, 'exists');
    }
    // The edit-conflict check: refuse if this bike was changed (or moved) since the form was opened.
    if (!p.isNew && p.baseV != null) {
      const cur = doc.assets.find(x => x.id === (originalId || a.id));
      if (cur && (cur.v || 0) !== p.baseV) {
        if (Object.keys(a).every(k => JSON.stringify(cur[k] ?? '') === JSON.stringify(a[k] ?? ''))) return { result: 'already-saved', moves: [] };
        throw new HttpError(409, `${cur.id} was changed or moved since you opened it`, 'changed', { current: cur });
      }
    }
    if (originalId && originalId !== a.id && existing) throw new HttpError(409, `${a.id} is already used by another bike`, 'exists');
    const target = originalId || a.id;
    const idx = doc.assets.findIndex(x => x.id === target);
    const now = Date.now();
    const clash = doc.assets.find((x, i) => i !== idx && serialKey(x.serial) === serialKey(a.serial));
    if (clash) throw new HttpError(409, `Serial ${a.serial} is already recorded against ${clash.id}`, 'serial-exists');
    const rec = idx >= 0 ? { ...doc.assets[idx], ...a, updatedAt: now, v: (doc.assets[idx].v || 0) + 1 } : { ...a, addedAt: now, updatedAt: now, v: 1 };
    checkAsset(rec);
    // Location changed by hand: logged, with initials (not needed when a new bike first gets one).
    const moves = [];
    if (p.asset && p.asset.location !== undefined) {
      const to = p.asset.location ? locCode(p.asset.location) : '';
      const from = idx >= 0 ? doc.assets[idx].location || '' : '';
      if (to !== from) {
        if (to) activeLocation(doc, to);
        const by = str(p.by, 10, 'Initials').toUpperCase();
        if (idx >= 0 && !by) throw new HttpError(400, 'Enter your initials to move the bike', 'invalid');
        rec.location = to;
        if (to) moves.push(moveRecord(rec.id, from, to, { how: 'hand', by }));
      }
    }
    if (idx >= 0) doc.assets[idx] = rec;
    else doc.assets.push(rec);
    doc.assets.sort((x, y) => x.id.localeCompare(y.id, 'en', { numeric: true }));
    return { result: idx >= 0 ? 'updated' : 'added', moves };
  },
  async deleteAsset(doc, p) {
    const id = normCode(p.id);
    doc.assets = doc.assets.filter(x => x.id !== id);
    return { result: 'deleted' };
  },
  // Bulk load from a spreadsheet: adds new bikes, updates ones already there.
  async importAssets(doc, p) {
    const rows = (Array.isArray(p.assets) ? p.assets : []).slice(0, 1000);
    if (!rows.length) throw new HttpError(400, 'No rows to import', 'invalid');
    let added = 0, updated = 0;
    const now = Date.now(), moves = [];
    rows.forEach((r, n) => {
      try {
        const a = cleanAsset(r, { partial: true });
        const idx = doc.assets.findIndex(x => x.id === a.id);
        const rec = idx >= 0 ? { ...doc.assets[idx], ...a, updatedAt: now, v: (doc.assets[idx].v || 0) + 1 } : { ...a, addedAt: now, updatedAt: now, v: 1 };
        checkAsset(rec);
        // Location column: a code or a name. Blank leaves the bike where it is.
        if (r.location !== undefined && String(r.location).trim()) {
          const v = String(r.location).trim().toLowerCase();
          const l = doc.locations.find(x => !x.retired && (x.code.toLowerCase() === v || x.name.toLowerCase() === v));
          if (!l) throw new HttpError(400, `Location "${r.location}" isn't on the list`, 'invalid');
          if ((rec.location || '') !== l.code) { moves.push(moveRecord(rec.id, rec.location, l.code, { how: 'import' })); rec.location = l.code; }
        }
        if (idx >= 0) { doc.assets[idx] = rec; updated++; } else { doc.assets.push(rec); added++; }
      } catch (e) { throw new HttpError(400, `Row ${n + 2}: ${e.message}`, 'invalid'); }
    });
    checkSerials(doc.assets); // a clash anywhere cancels the whole import
    doc.assets.sort((x, y) => x.id.localeCompare(y.id, 'en', { numeric: true }));
    return { result: 'imported', added, updated, moves };
  },
  // Scan-to-move: one or more bikes to a location. Anyone can, with initials.
  async moveAssets(doc, p) {
    const to = locCode(p.location);
    activeLocation(doc, to);
    const by = str(p.by, 10, 'Initials', { required: true }).toUpperCase();
    const codes = (Array.isArray(p.codes) ? p.codes : []).slice(0, 100).map(normCode);
    if (!codes.length) throw new HttpError(400, 'No bikes to move', 'invalid');
    const moves = [], results = [];
    for (const code of codes) {
      const a = doc.assets.find(x => x.id === code);
      if (!a) { results.push({ code, result: 'not-registered' }); continue; }
      if (a.location === to) { results.push({ code, result: 'already-there' }); continue; }
      moves.push(moveRecord(a.id, a.location, to, { how: 'scan', by }));
      results.push({ code, result: 'moved', from: a.location || '' });
      a.location = to; a.v = (a.v || 0) + 1;
    }
    return { result: 'moved', results, moves };
  },
  // Anyone can add or rename a location. Retiring hides it from the pick lists; bikes must be moved off first.
  async addLocation(doc, p) {
    const code = locCode(p.code);
    const name = str(p.name, 40, 'Location name', { required: true });
    if (doc.locations.some(l => l.code === code)) throw new HttpError(409, `${code} is already on the list`, 'exists');
    doc.locations.push({ code, name, kind: locKind(p.kind), match: matchWords(p.match) });
    return { result: 'added' };
  },
  // Kind and matching words (Rezdy product names), and the name.
  async updateLocation(doc, p) {
    const l = doc.locations.find(x => x.code === locCode(p.code));
    if (!l) throw new HttpError(404, 'That location no longer exists', 'not-found');
    if (p.baseV != null && p.baseV !== (l.v || 0)) throw new HttpError(409, `${l.code} was changed since you opened it`, 'changed', { current: l });
    l.v = (l.v || 0) + 1;
    if (p.name !== undefined) l.name = str(p.name, 40, 'Location name', { required: true });
    if (p.kind !== undefined) l.kind = locKind(p.kind);
    if (p.match !== undefined) l.match = matchWords(p.match);
    return { result: 'updated' };
  },
  async renameLocation(doc, p) {
    const l = doc.locations.find(x => x.code === locCode(p.code));
    if (!l) throw new HttpError(404, 'That location no longer exists', 'not-found');
    l.name = str(p.name, 40, 'Location name', { required: true });
    return { result: 'renamed' };
  },
  async retireLocation(doc, p) {
    const l = doc.locations.find(x => x.code === locCode(p.code));
    if (!l) throw new HttpError(404, 'That location no longer exists', 'not-found');
    if (p.retired === false) { delete l.retired; return { result: 'restored' }; }
    const here = doc.assets.filter(a => a.location === l.code && !a.disposalDate).length;
    if (here) throw new HttpError(409, `${here} bike${here > 1 ? 's are' : ' is'} still at ${l.code}. Move them first.`, 'in-use');
    l.retired = true;
    return { result: 'retired' };
  },
};

export async function handleAction(store, body, ctx = {}) {
  const action = String((body && body.action) || '');
  if (ADMIN_ACTIONS.has(action)) needAdmin(ctx, { strict: (action === 'addMember' || action === 'updateMember') && hasContacts(body.member) });
  if (rosterActions[action]) return rosterAction(store, action, body);
  if (action === 'backupNow' || action === 'restoreSnapshot' || action === 'markOffsite') return backupAction(store, action, body, ctx);

  if (action === 'mcheck') return recordMcheck(store, body);
  if (dayActions[action]) {
    const ctx = { store };
    if (action === 'addBike') ctx.checkStatus = (await read(store, KEY_CHECK_STATUS, emptyCheckStatus)).data;
    // addBike needs the fleet status up front so it can refuse out-of-service bikes,
    // and the register so it can record the bike's brand and model.
    const [issuesDoc, assetsDoc] = (await Promise.all([read(store, KEY_ISSUES, emptyIssues), read(store, KEY_ASSETS, emptyAssets)])).map(r => r.data);
    ctx.flags = fleetFlags(issuesDoc);
    ctx.locations = assetsDoc.locations;
    ctx.assets = assetsDoc.assets;
    const out = await mutate(store, KEY_DAY, emptyDay, day => dayActions[action](day, body, ctx));
    // A bike checked in moves to the location the phone is set to.
    if (ctx.summarise) { try { await saveDaySummary(store, ctx.summarise); } catch (e) { console.warn('daily summary not saved', e); } }
    if (ctx.summarise) { try { await saveFleetDays(store, ctx.summarise, out.data.manifestDate); } catch (e) { console.warn('fleet records not saved', e); } }
    if (action === 'dropOff' && out.dropped && out.dropped.codes.length) {
      try { await moveBikes(store, out.dropped.codes, out.dropped.loc, { how: 'drop-off', by: byOf(body), note: out.dropped.groupName }); }
      catch (e) { if (!(e instanceof HttpError)) throw e; }
    }
    // v3.9: unticked or a drop-off undone: each bike goes back to where it was before it was checked in.
    if (out.uncheck || out.undropped) {
      try { await moveBack(store, out.uncheck ? [out.uncheck.code] : out.undropped.codes, out.uncheck ? 'check-in' : 'drop-off', byOf(body)); }
      catch (e) { if (!(e instanceof HttpError)) throw e; }
    }
    if (action === 'checkIn' && body.in !== false && body.location && out.code) {
      try { await moveBikes(store, [out.code], locCode(body.location), { how: 'check-in', by: byOf(body), note: out.groupName }); }
      catch (e) { if (!(e instanceof HttpError)) throw e; } // an unknown location doesn't undo the check-in
    }
    // Remember when each bike last went out, so the next M-check is due; undo it for a mistake or swap.
    let statusDoc;
    if (out.hired && (out.result === 'added' || out.result === 'already-saved')) {
      statusDoc = (await mutate(store, KEY_CHECK_STATUS, emptyCheckStatus, doc => {
        const st = doc.bikes[out.hired.code] = doc.bikes[out.hired.code] || {};
        if (st.lastHire && st.lastHire.entryId === out.hired.entryId) return;
        st.lastHire = { at: out.hired.at, group: out.hired.group, entryId: out.hired.entryId, prev: st.lastHire ? { ...st.lastHire, prev: undefined } : null };
      })).data;
    } else if (out.unhired) {
      statusDoc = (await mutate(store, KEY_CHECK_STATUS, emptyCheckStatus, doc => {
        const st = doc.bikes[out.unhired.code];
        if (st && st.lastHire && st.lastHire.entryId === out.unhired.entryId) st.lastHire = st.lastHire.prev || null;
      })).data;
    } else statusDoc = (await read(store, KEY_CHECK_STATUS, emptyCheckStatus)).data;
    const view = scannerView(out.data, issuesDoc, assetsDoc, statusDoc);
    const res = { ok: true, result: out.result || 'ok', view };
    if (out.mcheckDue) res.mcheckDue = true;
    if (out.openIssue) res.openIssue = true;
    if (out.alsoIn) res.alsoIn = out.alsoIn;
    if (action === 'addBike' && out.result === 'added') { res.inRegister = !!out.inRegister; if (out.disposed) res.disposed = out.disposed; }
    if (ctx.archiveKey) res.archiveKey = ctx.archiveKey;
    if (action === 'loadManifest') { res.previous = ctx.previous; res.carried = ctx.carried || 0; res.overdue = ctx.overdue || 0; }
    // Remember each product name and where it matched, so a name never seen before can be flagged
    // on Load Manifest. A retried load (already saved) isn't counted twice.
    if (action === 'loadManifest' && out.result !== 'already-saved') {
      try { await recordProducts(store, body); } catch (e) { console.warn('products not recorded', e); }
    }
    return res;
  }

  if (issueActions[action]) {
    const [assetsDoc, settings] = (await Promise.all([read(store, KEY_ASSETS, emptyAssets), read(store, KEY_SETTINGS, emptySettings)])).map(r => r.data);
    const out = await mutate(store, KEY_ISSUES, emptyIssues, doc => issueActions[action](doc, body, { assets: assetsDoc.assets, settings }));
    const res = { ok: true, result: out.result || 'ok', view: issuesView(out.data, assetsDoc, settings) };
    if (action === 'reportIssue') res.inRegister = !!out.inRegister;
    if (out.result === 'already-resolved') { res.resolvedBy = out.resolvedBy; res.resolvedAt = out.resolvedAt; }
    return res;
  }

  if (action === 'siteCheck') return recordSiteCheck(store, body);
  if (action === 'saveMessages') {
    const templates = (Array.isArray(body.templates) ? body.templates : []).slice(0, 12).map((t, n) => ({
      id: str(t && t.id, 40, 'Id') || 'm' + (n + 1), label: str(t && t.label, 60, 'Name', { required: true }), text: str(t && t.text, 1000, 'Message', { required: true }) }));
    if (!templates.length) throw new HttpError(400, 'Keep at least one message', 'invalid');
    const out = await mutate(store, KEY_MSG, emptyMessages, doc => {
      if (body.baseRev != null && (doc.rev || 0) !== body.baseRev && JSON.stringify(doc.templates) !== JSON.stringify(templates)) throw new HttpError(409, 'Someone changed the messages since you opened them', 'changed');
      doc.templates = templates;
    });
    return { ok: true, result: 'saved', templates: out.data.templates, rev: out.data.rev };
  }
  if (lostActions[action]) {
    // A photo goes in its own storage file; the register just notes that one exists.
    const photo = body.photo !== undefined ? photoData(body.photo) : undefined;
    // A new or changed photo is saved first, so the register never says an item has a photo that
    // isn't there (if the register save then fails, a retry just saves the same photo again).
    const photoId = action === 'lostAdd' ? body.item && body.item.id : action === 'lostEdit' ? body.id : null;
    if (photo && photoId) await store.setJSON('lost-photo/' + id(photoId, 'Item id'), { data: photo, at: Date.now() });
    const out = await mutate(store, KEY_LOST, emptyLost, doc => lostActions[action](doc, body));
    if (photo === '' && photoId && store.delete) await store.delete('lost-photo/' + id(photoId, 'Item id'));
    return { ok: true, result: out.result || 'ok', view: lostView(out.data) };
  }
  if (action === 'saveQrLinks') {
    const links = (Array.isArray(body.links) ? body.links : []).slice(0, 8).map((l, n) => {
      const url = str(l && l.url, 500, 'Link', { required: true });
      if (!/^https:\/\/[^\s]+$/i.test(url)) throw new HttpError(400, 'Each link must start with https://', 'invalid');
      return { id: str(l.id, 40, 'Id') || 'q' + (n + 1), label: str(l && l.label, 60, 'Name', { required: true }), url };
    });
    if (!links.length) throw new HttpError(400, 'Keep at least one QR code', 'invalid');
    const out = await mutate(store, KEY_QR, emptyQr, doc => {
      if (body.baseRev != null && (doc.rev || 0) !== body.baseRev && JSON.stringify(doc.links) !== JSON.stringify(links)) throw new HttpError(409, 'Someone changed the QR codes since you opened them', 'changed');
      doc.links = links;
    });
    return { ok: true, result: 'saved', links: out.data.links, rev: out.data.rev };
  }
  // Fill the daily summaries from the saved archives (the last archive of each day counts).
  if (action === 'rebuildDaily') {
    const { blobs } = await store.list({ prefix: 'archive/' });
    const latest = {};
    for (const b of blobs) {
      const [, date, stamp] = b.key.split('/'); const t = Number(String(stamp).split('-')[0]);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) continue;
      if (!latest[date] || t > latest[date].t) latest[date] = { key: b.key, t };
    }
    const [assets, issues, checks] = await Promise.all([read(store, KEY_ASSETS, emptyAssets), read(store, KEY_ISSUES, emptyIssues), read(store, KEY_CHECKS, emptyChecks)]);
    const sums = [];
    for (const { key } of Object.values(latest)) {
      const a = await store.get(key, { type: 'json' });
      if (!a || !a.day || !(a.day.groups || []).length) continue;
      const sum = summariseDay(upgradeDaySites(a.day), assets.data, issues.data, checks.data);
      if (sum) sums.push(sum);
    }
    await mutate(store, KEY_DAILY, emptyDaily, doc => { for (const x of sums) doc.days[x.date] = { ...x, rebuilt: true }; });
    return { ok: true, result: 'rebuilt', days: sums.length };
  }
  // v3.9: an M-check pass signed off wrongly (or undone within 10 seconds): voided, kept in the
  // history, and the bike is due again unless an earlier pass still covers it.
  if (action === 'voidMcheck') {
    const checkId = id(body.checkId, 'Check id');
    let check = null, already = false;
    const c = correctionOf(body, 'void-mcheck', {});
    if (!c.by) throw new HttpError(400, 'Initials are required', 'invalid');
    const checks = await mutate(store, KEY_CHECKS, emptyChecks, doc => {
      check = doc.checks.find(x => x.id === checkId);
      if (!check) throw new HttpError(404, 'That M-check isn\'t in the history', 'not-found');
      if (check.voided) { already = true; return; }
      if (check.result !== 'pass') throw new HttpError(409, 'Only a passed M-check can be voided. For a fault, close its issue as logged in error.', 'invalid');
      check.voided = c;
    });
    const list = checks.data.checks.filter(x => x.bike === check.bike && !x.voided).sort((a, b) => a.at - b.at);
    const lastCheck = list[list.length - 1], lastPass = [...list].reverse().find(x => x.result === 'pass');
    const statusDoc = (await mutate(store, KEY_CHECK_STATUS, emptyCheckStatus, doc => {
      const st = doc.bikes[check.bike] = doc.bikes[check.bike] || {};
      st.lastCheck = lastCheck ? { id: lastCheck.id, at: lastCheck.at, by: lastCheck.by, result: lastCheck.result } : null;
      st.lastPass = lastPass ? { id: lastPass.id, at: lastPass.at, by: lastPass.by } : null;
    })).data;
    const [day, issues, assets] = await Promise.all([read(store, KEY_DAY, emptyDay), read(store, KEY_ISSUES, emptyIssues), read(store, KEY_ASSETS, emptyAssets)]);
    return { ok: true, result: already ? 'already-saved' : 'voided', bike: check.bike, view: scannerView(day.data, issues.data, assets.data, statusDoc) };
  }
  // v3.9: a bike removed from the register by mistake, put back as it was. The removal is marked
  // "removed in error" in the register's history, so past days count it as in the fleet throughout.
  if (action === 'restoreAsset') {
    const bike = normCode(body.id);
    const c = correctionOf(body, 'restored', {});
    if (!c.by) throw new HttpError(400, 'Initials are required', 'invalid');
    const hist = (await read(store, KEY_ASSET_HISTORY, emptyAssetHistory)).data;
    const removal = [...hist.entries].reverse().find(e => e.how === 'removed' && e.bike === bike);
    if (!removal) throw new HttpError(404, bike + ' isn\'t in the register\'s removals', 'not-found');
    if (removal.error) return { ok: true, result: 'already-saved' };
    const out = await mutate(store, KEY_ASSETS, emptyAssets, doc => {
      if (doc.assets.some(a => a.id === bike)) throw new HttpError(409, bike + ' is already in the register', 'exists');
      const snap = { ...removal.snapshot }; delete snap.id;
      doc.assets.push({ id: bike, ...snap, addedAt: Date.now(), v: 1 });
    });
    await mutate(store, KEY_ASSET_HISTORY, emptyAssetHistory, doc => {
      const r = doc.entries.find(e => e.id === removal.id); if (r) r.error = { at: c.at, by: c.by, reason: c.reason };
      appendHistory(doc, [{ id: c.id, at: c.at, bike, how: 'restored', by: c.by, reason: c.reason }]);
    });
    const day = (await read(store, KEY_DAY, emptyDay)).data;
    return { ok: true, result: 'restored', view: fleetView(out.data, day) };
  }
  // v3.6: rebuild one month of fleet records from the archives (Admin). dryRun writes nothing.
  // Records written when the day happened ("live") are kept; earlier rebuilt ones are replaced.
  if (action === 'rebuildFleet') {
    const month = String(body.month || '');
    if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, 'Choose a month', 'invalid');
    const [idx, fleet, day] = await Promise.all([archiveIndex(store), read(store, KEY_FLEET_DAYS, emptyFleetDays), read(store, KEY_DAY, emptyDay)]);
    const first = Object.keys(idx).sort()[0];
    const today = day.data.manifestDate || todayAdelaide();
    const dates = [];
    for (let d = month + '-01'; d.startsWith(month); d = addDays(d, 1)) if (first && d >= first && d < today) dates.push(d);
    const keep = dates.filter(d => fleet.data.days[d] && fleet.data.days[d].src === 'live');
    const todo = dates.filter(d => !keep.includes(d));
    const ctx = await fleetContext(store);
    const recs = todo.length ? await buildFromArchives(store, todo, ctx, { index: idx }) : [];
    const sum = r => { const v = Object.values(r.bikes); return { date: r.date, manifest: r.manifest, bikes: v.length,
      available: v.filter(b => b.s === 'a' || b.s === 'h').length, hired: v.filter(b => b.s === 'h').length,
      estModel: v.filter(b => (b.e || '').includes('m')).length, estLocation: v.filter(b => (b.e || '').includes('l')).length,
      changed: !fleet.data.days[r.date] || JSON.stringify(fleet.data.days[r.date].bikes) !== JSON.stringify(r.bikes) }; };
    if (!body.dryRun && recs.length) await mutate(store, KEY_FLEET_DAYS, emptyFleetDays, doc => {
      for (const r of recs) if (!(doc.days[r.date] && doc.days[r.date].src === 'live')) doc.days[r.date] = r;
    });
    return { ok: true, result: body.dryRun ? 'preview' : 'rebuilt', month, days: recs.map(sum), kept: keep.length };
  }
  // v3.7: fault types, the repeat window, and the home screen (Admin).
  if (action === 'saveFaultTypes' || action === 'saveHomeTiles' || action === 'saveBusiness') {
    const out = await mutate(store, KEY_SETTINGS, emptySettings, doc => {
      if (body.baseRev != null && (doc.rev || 0) !== body.baseRev) throw new HttpError(409, 'Someone changed these settings since you opened them. Reload Admin and try again.', 'changed');
      try {
        if (action === 'saveFaultTypes') {
          doc.faultTypes = cleanFaultTypes(body.types, doc.faultTypes);
          const d = parseInt(body.repeatDays, 10);
          if (body.repeatDays != null) { if (!(d >= 7 && d <= 365)) throw new SettingsError('The repeat window must be 7 to 365 days'); doc.repeatDays = d; }
        } else if (action === 'saveBusiness') doc.business = cleanBusiness(body.business, businessOf(doc));
        else doc.home = cleanHome(body.order, body.hidden);
      } catch (e) { if (e instanceof SettingsError) throw new HttpError(400, e.message, 'invalid'); throw e; }
    });
    const st = out.data;
    return { ok: true, result: 'saved', settings: { rev: st.rev, faultTypes: st.faultTypes, repeatDays: st.repeatDays, home: cleanHome(st.home.order, st.home.hidden), brand: brandView(st), business: businessOf(st), timeZone: TZ } };
  }
  // v3.10 (Admin): load a configuration file. A backup is taken first; each chosen section replaces
  // the current one, except locations, which are added or updated by code (none are taken away).
  if (action === 'configImport') {
    const cfg = body.config || {};
    if (cfg.kind !== 'operations-tools-configuration' || !cfg.sections) throw new HttpError(400, 'That isn\'t a configuration file from Operations Tools', 'invalid');
    const want = new Set(Array.isArray(body.sections) ? body.sections : []);
    const S = cfg.sections, done = [];
    if (!want.size) throw new HttpError(400, 'Choose what to load', 'invalid');
    let backupId = null;
    if (ctx.backups) { try { backupId = (await takeSnapshot(store, ctx.backups, { reason: 'pre-config-load', by: byOf(body), appVersion: APP_VERSION, budgetMs: 15000, copyArchives: false, prune: false })).id || null; } catch (e) { throw new HttpError(503, 'The backup before loading didn\'t finish, so nothing was loaded. Try again.', 'backup-failed'); } }
    const bad = e => { if (e instanceof SettingsError) throw new HttpError(400, e.message, 'invalid'); throw e; };
    if (['business', 'maintenance', 'home'].some(k => want.has(k) && S[k])) await mutate(store, KEY_SETTINGS, emptySettings, doc => {
      try {
        if (want.has('business') && S.business) { doc.business = cleanBusiness(S.business, businessOf(doc)); done.push('business'); }
        if (want.has('maintenance') && S.maintenance) {
          doc.faultTypes = cleanFaultTypes(S.maintenance.faultTypes, doc.faultTypes);
          const d = parseInt(S.maintenance.repeatDays, 10); if (d >= 7 && d <= 365) doc.repeatDays = d;
          done.push('maintenance');
        }
        if (want.has('home') && S.home) { doc.home = cleanHome(S.home.order, S.home.hidden); done.push('home'); }
      } catch (e) { bad(e); }
    });
    const whole = async (k, key, empty, check) => {
      if (!want.has(k) || !S[k]) return;
      if (!check(S[k])) throw new HttpError(400, 'The ' + k + ' section of that file isn\'t readable', 'invalid');
      await mutate(store, key, empty, doc => { for (const f of Object.keys(doc)) if (f !== 'rev' && f !== 'updatedAt') delete doc[f]; Object.assign(doc, S[k]); });
      done.push(k);
    };
    await whole('qr', KEY_QR, emptyQr, v => Array.isArray(v.links));
    await whole('messages', KEY_MSG, emptyMessages, v => Array.isArray(v.templates));
    await whole('checklists', KEY_SITE_LISTS, emptySiteLists, v => v && typeof v === 'object');
    if (want.has('locations') && Array.isArray(S.locations)) {
      await mutate(store, KEY_ASSETS, emptyAssets, doc => {
        for (const l of S.locations) {
          if (!l || !/^[A-Z0-9]{2,4}$/.test(String(l.code || ''))) continue;
          const cur = doc.locations.find(x => x.code === l.code);
          const clean = { code: l.code, name: String(l.name || l.code).slice(0, 60), kind: ['hire', 'delivery', 'collection', 'storage'].includes(l.kind) ? l.kind : 'hire',
            ...(Array.isArray(l.match) ? { match: l.match.map(String).slice(0, 20) } : {}), ...(l.retired ? { retired: true } : {}) };
          if (cur) Object.assign(cur, clean); else doc.locations.push(clean);
        }
      });
      done.push('locations');
    }
    return { ok: true, result: 'loaded', loaded: done, backupId };
  }
  if (siteListActions[action]) {
    const out = await mutate(store, KEY_SITE_LISTS, emptySiteLists, doc => siteListActions[action](doc, body));
    return { ok: true, result: out.result || 'ok', lists: siteListsFor(out.data, locCode(body.site)) };
  }
  if (teamActions[action]) {
    const out = await mutate(store, KEY_TEAM, emptyTeam, doc => teamActions[action](doc, body));
    return { ok: true, result: out.result || 'ok', view: teamView(out.data) };
  }
  if (assetActions[action]) {
    // Each change to the register is recorded in its change history (v3.6). The entries are queued
    // in the register itself, in the same save, then moved to the history file, so a save cut off
    // between the two is finished by the next register save.
    const out = await mutate(store, KEY_ASSETS, emptyAssets, async doc => {
      const before = doc.assets.map(a => ({ ...a }));
      const r = await assetActions[action](doc, body);
      const renames = action === 'saveAsset' && body.originalId ? [{ from: normCode(body.originalId), to: normCode(body.asset && body.asset.id) }] : [];
      const entries = diffAssets(before, doc.assets, { by: byOf(body), how: action === 'importAssets' ? 'import' : '', renames });
      if (entries.length) doc.historyQueue = [...(doc.historyQueue || []), ...entries];
      return r;
    });
    await flushHistory(store, out.data);
    await appendMoves(store, out.moves || []);
    const day = (await read(store, KEY_DAY, emptyDay)).data;
    const res = { ok: true, result: out.result || 'ok', view: fleetView(out.data, day) };
    if (action === 'moveAssets') res.results = out.results;
    if (action === 'importAssets') { res.added = out.added; res.updated = out.updated; }
    return res;
  }

  throw new HttpError(400, 'Unknown action', 'invalid');
}

// ── backups (see backup-core.mjs) ──────────────────────────────────────────
// ctx comes from netlify/functions/ops.mjs: the backup store for this deploy, the live site's
// backup store (the same one in production), and whether this is the live site.
function needBackups(ctx) {
  if (!ctx || !ctx.backups) throw new HttpError(503, 'Backups are not available here', 'no-backups');
}
async function guard(fn) {
  try { return await fn(); }
  catch (e) { if (e instanceof BackupError) throw new HttpError(e.status, e.message, e.code); throw e; }
}
async function backupView(store, view, params, ctx) {
  needBackups(ctx);
  return guard(async () => {
    if (view === 'backupStatus') return { ...(await backupStatus(ctx.backups)), isLive: ctx.isLive !== false, context: ctx.deployContext || 'production', appVersion: APP_VERSION };
    if (view === 'backupPart') return downloadPart(store, String(params.get('key') || ''));
    const out = { status: await backupStatus(ctx.backups), ...(await listSnapshots(ctx.backups)), current: await currentCounts(store),
      sections: SECTIONS.map(s => ({ id: s.id, label: s.label, files: s.files })), isLive: ctx.isLive !== false, context: ctx.deployContext || 'production', appVersion: APP_VERSION, admin: adminInfo(ctx) };
    // A preview can load one of the live site's backups into its own, separate data.
    if (ctx.isLive === false && ctx.liveBackups) out.liveSnapshots = (await listSnapshots(ctx.liveBackups)).snapshots;
    return out;
  });
}
async function backupAction(store, action, body, ctx) {
  needBackups(ctx);
  const by = byOf(body);
  return guard(async () => {
    if (action === 'backupNow') return takeSnapshot(store, ctx.backups, { reason: 'manual', by, appVersion: APP_VERSION, budgetMs: 35000 });
    if (action === 'markOffsite') return markOffsite(ctx.backups, by);
    // restoreSnapshot
    if (body.confirm !== 'RESTORE') throw new HttpError(400, 'Type RESTORE to confirm', 'invalid');
    let source = ctx.backups;
    if (body.from === 'live') {
      // Only a preview may load the live site's backups, and only into its own data.
      if (ctx.isLive !== false || !ctx.liveBackups) throw new HttpError(403, 'Live backups can only be loaded into a preview', 'forbidden');
      source = ctx.liveBackups;
    }
    return restoreSnapshot(store, source, ctx.backups, { id: body.id, sections: body.sections, by, appVersion: APP_VERSION });
  });
}

// ── Admin ──────────────────────────────────────────────────────────────────
// Once SAEBIKES_ADMIN_PASSWORD is set in Netlify, everything on the Admin page and every roster
// change needs it (ops.mjs checks it and passes ctx.admin). Until it's set, Admin works with the
// staff PIN as before, but contact details can't be stored or read at all ("strict").
const ADMIN_ACTIONS = new Set(['addMember', 'updateMember', 'retireMember', 'backupNow', 'markOffsite', 'rebuildDaily', 'rebuildFleet', 'restoreSnapshot', 'saveFaultTypes', 'saveHomeTiles', 'saveBusiness', 'configImport',
  'saveChecklist', 'saveMessages', 'saveQrLinks', ...Object.keys(rosterActions)]);
const ADMIN_VIEWS = new Set(['backups', 'backupPart', 'teamAdmin', 'rosterAdmin', 'fleetRebuildInfo', 'configExport']);
function needAdmin(ctx, { strict = false } = {}) {
  const a = (ctx && ctx.admin) || { configured: false };
  if (!a.configured) {
    if (strict) throw new HttpError(403, a.tooShort ? 'The admin password in Netlify is too short (it needs at least 8 characters)' : 'Contact details need an admin password', 'admin-not-configured',
      { fix: 'Set SAEBIKES_ADMIN_PASSWORD (at least 8 characters) in Netlify > Site configuration > Environment variables, then redeploy.' });
    return;
  }
  if (!a.ok) throw new HttpError(403, a.supplied ? 'Incorrect admin password' : 'Admin password required', a.supplied ? 'admin-wrong' : 'admin-required');
}
export function adminInfo(ctx) { const a = (ctx && ctx.admin) || {}; return { configured: !!a.configured, tooShort: !!a.tooShort, unlocked: !!a.ok }; }

// ── roster (see roster-core.mjs) ───────────────────────────────────────────
async function rosterContext(store) {
  const [team, assets] = await Promise.all([read(store, KEY_TEAM, emptyTeam), read(store, KEY_ASSETS, emptyAssets)]);
  return { members: team.data.members, locations: assets.data.locations, today: todayAdelaide(), now: Date.now() };
}
async function rosterAction(store, action, body) {
  const rctx = await rosterContext(store);
  try {
    const out = await mutate(store, KEY_ROSTER, emptyRoster, doc => rosterActions[action](doc, body, rctx));
    const { data, ...rest } = out;
    return { ok: true, ...rest, view: rosterView(data, rctx, { start: body.viewStart || '', days: body.viewDays || 7, admin: true }) };
  } catch (e) {
    if (e instanceof RosterError) throw new HttpError(e.status, e.message, e.code, e.extra);
    throw e;
  }
}

// ── Rezdy products seen (v3.4) ─────────────────────────────────────────────
async function recordProducts(store, body) {
  const date = String(body.manifestDate || '').slice(0, 10);
  const groups = Array.isArray(body.groups) ? body.groups.slice(0, 200) : [];
  if (!groups.some(g => g && g.product)) return;
  await mutate(store, KEY_PRODUCTS, emptyProducts, doc => {
    for (const g of groups) {
      const name = String((g && g.product) || '').trim().slice(0, 200);
      if (!name) continue;
      const key = name.toLowerCase();
      const p = doc.products[key] = doc.products[key] || { name, firstSeen: date, bookings: 0 };
      p.name = name; p.lastSeen = date; p.bookings += 1; p.site = String(g.site || '').toUpperCase().slice(0, 6);
      if (!p.firstSeen || date < p.firstSeen) p.firstSeen = date;
    }
  });
}
function productsView(doc) {
  return { rev: doc.rev, products: Object.values(doc.products).sort((a, b) => b.bookings - a.bookings || a.name.localeCompare(b.name)) };
}

