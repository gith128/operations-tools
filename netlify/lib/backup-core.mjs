// SA eBikes Operations Tools v3.10 — backups, restore and keeping previews apart from live data.
//
// Snapshots live in their own store, apart from the live data. Each snapshot is one file per
// section under snap/<id>/, plus a manifest written LAST. The manifest holds each section's
// SHA-256, size and record count, and is only written once every file has been read back and
// checked. A snapshot without a manifest never finished, and is ignored (then cleaned up).
//
// Daily archives and lost-property photos never change once written, so they are copied once:
// archives under archive/<same key>, photos under photo/<sha256>. Snapshots point at the photos.
import { TZ } from './tz.mjs';
import { createHash } from 'node:crypto';

export const BACKUP_SCHEMA = 1;
export const PROD_LIVE = 'sa-ebikes-ops';
export const PROD_BACKUPS = 'sa-ebikes-backups';

// Every live file a snapshot holds, with how its records are counted.
export const LIVE_FILES = {
  'day': d => (d.groups || []).length,
  'issues': d => (d.issues || []).length,
  'assets': d => (d.assets || []).length,
  'moves': d => (d.moves || []).length,
  'team': d => (d.members || []).length,
  'mchecks': d => (d.checks || []).length,
  'mcheck-status': d => Object.keys(d.bikes || {}).length,
  'site-checklists': d => Object.keys(d.sites || {}).length,
  'site-checks': d => (d.records || []).length,
  'qr-links': d => (d.links || []).length,
  'daily-stats': d => Object.keys(d.days || {}).length,
  'lost-property': d => (d.items || []).length,
  'message-templates': d => (d.templates || []).length,
  'roster': d => (d.shifts || []).length,
  'rezdy-products': d => Object.keys(d.products || {}).length,
  'asset-history': d => (d.entries || []).length,
  'fleet-days': d => Object.keys(d.days || {}).length,
  'app-settings': d => (d.faultTypes || []).length,
};

// What staff can choose to restore. A section is one or more live files restored together.
export const SECTIONS = [
  { id: 'day', label: "Today's groups and contacts", files: ['day'] },
  { id: 'issues', label: 'Issue log', files: ['issues'] },
  { id: 'assets', label: 'Asset register, locations, move history and change history', files: ['assets', 'moves', 'asset-history'] },
  { id: 'mchecks', label: 'M-checks', files: ['mchecks', 'mcheck-status'] },
  { id: 'sites', label: 'Site checklist sign-offs', files: ['site-checks'] },
  { id: 'lost', label: 'Lost property, with photos', files: ['lost-property'], photos: true },
  { id: 'team', label: 'Team', files: ['team'] },
  { id: 'roster', label: 'Roster', files: ['roster'] },
  // v3.10: everything on Admin's Configuration page, restorable on its own.
  { id: 'config', label: 'Configuration: business, fault types, home screen, QR codes, messages and site checklists', files: ['app-settings', 'qr-links', 'message-templates', 'site-checklists'] },
  { id: 'settings', label: 'Rezdy products seen', files: ['rezdy-products'] },
  { id: 'daily', label: 'Dashboard data and fleet records', files: ['daily-stats', 'fleet-days'] },
  { id: 'archives', label: 'Daily archives (only missing days are added back)', files: [], archives: true },
];

// How long snapshots are kept. The newest three good ones are always kept, whatever their age.
export const KEEP = { nightlyDays: 30, manualDays: 90, monthlyDays: 366, newest: 3, staleHours: 36, offsiteDays: 30 };
// One backup or restore at a time. The lock outlasts Netlify's 60-second limit on any function,
// so a run that was cut off can only hold it for a few minutes.
export const LOCK_LEASE_MS = 5 * 60_000;
// A run that started this long ago and never finished was cut off.
export const UNFINISHED_MS = 10 * 60_000;

const DAY = 864e5;
const sha = text => createHash('sha256').update(text).digest('hex');

export class BackupError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

// ── which stores this deploy uses ──────────────────────────────────────────
// Production keeps the store names it has always had. A deploy preview or branch deploy gets
// stores of its own, so trying a new version can never touch live data. It can still READ the
// live backups, to load one into itself for testing.
export function deployContextOf(req, context) {
  let c = (context && context.deploy && context.deploy.context) || 'production';
  // Belt and braces: preview and branch URLs have "--" in the host name.
  try { if (c === 'production' && req && new URL(req.url).hostname.includes('--')) c = 'deploy-preview'; } catch {}
  return String(c);
}
export function storeNames(deployContext) {
  if (!deployContext || deployContext === 'production') return { live: PROD_LIVE, backups: PROD_BACKUPS, liveBackups: PROD_BACKUPS, isLive: true };
  const slug = String(deployContext).toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 30);
  return { live: PROD_LIVE + '-' + slug, backups: PROD_BACKUPS + '-' + slug, liveBackups: PROD_BACKUPS, isLive: false };
}

// ── small helpers ──────────────────────────────────────────────────────────
const getText = (store, key) => store.get(key, { type: 'text' });
async function keysUnder(store, prefix) { const { blobs } = await store.list({ prefix }); return blobs.map(b => b.key); }
function newId(now) {
  const d = new Date(now), p = n => String(n).padStart(2, '0');
  return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + '-' + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) +
    '-' + Math.random().toString(36).slice(2, 6);
}
const adlMonth = t => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).format(new Date(t));

async function readStatus(backups) { try { return (await backups.get('status', { type: 'json' })) || {}; } catch { return {}; } }
// Status changes are read-change-write, but only written if nobody else wrote in between
// (otherwise re-read and try again), so two writers can't lose each other's changes.
async function updateStatus(backups, change) {
  for (let attempt = 0; ; attempt++) {
    const cur = await backups.getWithMetadata('status', { type: 'json' });
    const base = (cur && cur.data) || {};
    const next = typeof change === 'function' ? change(base) : { ...base, ...change };
    const res = await backups.setJSON('status', next, cur && cur.etag ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (!res || res.modified !== false) return next;
    if (attempt >= 8) throw new BackupError(503, 'The backup status kept changing; try again', 'busy');
    await new Promise(r => setTimeout(r, 20 + Math.random() * 80));
  }
}

// ── one at a time ──────────────────────────────────────────────────────────
// The lock is created only if it doesn't exist; an expired one is taken over only if it
// hasn't changed since it was read. Either way, two runs can't both hold it.
export async function acquireLock(backups, { owner, what = 'backup', now = Date.now } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const cur = await backups.getWithMetadata('lock', { type: 'json' });
    const mine = { owner, what, at: now() };
    if (!cur || !cur.data) {
      const r = await backups.setJSON('lock', mine, { onlyIfNew: true });
      if (!r || r.modified !== false) return mine;
      continue;
    }
    if (now() - (cur.data.at || 0) < LOCK_LEASE_MS) {
      throw new BackupError(409, `A ${cur.data.what === 'restore' ? 'restore' : 'backup'} is already running. Try again in a minute.`, 'busy');
    }
    const r = await backups.setJSON('lock', mine, { onlyIfMatch: cur.etag });
    if (!r || r.modified !== false) return mine;
  }
  throw new BackupError(409, 'A backup or restore is already running. Try again in a minute.', 'busy');
}
export async function releaseLock(backups, owner) {
  try { const cur = await backups.get('lock', { type: 'json' }); if (cur && cur.owner === owner) await backups.delete('lock'); } catch {}
}

// ── taking a snapshot ──────────────────────────────────────────────────────
// reason: 'nightly', 'manual' or 'pre-restore'. budgetMs limits how long is spent copying
// archives; anything left is copied next time. Throws (and records the failure) if anything
// can't be read, written or checked.
export async function takeSnapshot(live, backups, opts = {}) {
  const now = opts.now || Date.now;
  const owner = 'snap-' + newId(now());
  // A nightly run that finds a manual one running is skipped, not failed: the other one backs up.
  if (!opts.lockHeld) {
    try { await acquireLock(backups, { owner, what: 'backup', now }); }
    catch (e) {
      if (e.code === 'busy' && opts.reason === 'nightly') await updateStatus(backups, { lastSkip: { at: now(), reason: 'another backup or restore was running' } }).catch(() => {});
      throw e;
    }
  }
  try { return await snapshotUnlocked(live, backups, { ...opts, now }); }
  finally { if (!opts.lockHeld) await releaseLock(backups, owner); }
}
async function snapshotUnlocked(live, backups, { reason = 'manual', by = '', appVersion = '', budgetMs = 20000, copyArchives = true, prune: doPrune = true, now = Date.now } = {}) {
  const start = now();
  const id = newId(start), dir = 'snap/' + id + '/';
  // Recorded before anything else: if this run is cut off, the status shows it never finished.
  await updateStatus(backups, s => ({ ...s, current: { id, reason, startedAt: start }, lastAttemptAt: start, lastAttemptReason: reason }));
  try {
    // 1. Every live file, as stored, with its checksum and record count.
    const files = {}, written = {};
    for (const [key, count] of Object.entries(LIVE_FILES)) {
      const text = await getText(live, key);
      if (text == null) { files[key] = { missing: true }; continue; }
      let data;
      try { data = JSON.parse(text); } catch { throw new BackupError(500, `The live file "${key}" can't be read, so it wasn't backed up`, 'unreadable'); }
      await backups.set(dir + key + '.json', text);
      files[key] = { sha: sha(text), bytes: text.length, count: count(data) };
      written[key] = text;
    }
    // 2. Lost-property photos, copied once each (by checksum).
    const photos = {};
    const lost = written['lost-property'] ? JSON.parse(written['lost-property']) : { items: [] };
    const havePhotos = new Set(await keysUnder(backups, 'photo/'));
    for (const item of lost.items || []) {
      if (!item.hasPhoto) continue;
      const text = await getText(live, 'lost-photo/' + item.id);
      if (text == null) continue;
      const h = sha(text);
      if (!havePhotos.has('photo/' + h)) { await backups.set('photo/' + h, text); havePhotos.add('photo/' + h); }
      photos[item.id] = h;
    }
    // 3. Read everything back and check it, before calling it a backup.
    for (const [key, f] of Object.entries(files)) {
      if (f.missing) continue;
      const back = await getText(backups, dir + key + '.json');
      if (back == null || sha(back) !== f.sha) throw new BackupError(500, `The backup of "${key}" didn't read back correctly`, 'verify-failed');
    }
    for (const h of new Set(Object.values(photos))) {
      const back = await getText(backups, 'photo/' + h);
      if (back == null || sha(back) !== h) throw new BackupError(500, 'A lost-property photo didn\'t read back correctly', 'verify-failed');
    }
    // 4. The manifest, last. Its presence is what makes this a finished, checked snapshot.
    const manifest = { schema: BACKUP_SCHEMA, id, at: start, reason, by: String(by || '').slice(0, 10), appVersion, files, photos, verified: true, verifiedAt: now() };
    await backups.setJSON(dir + 'manifest.json', manifest);
    const back = await backups.get(dir + 'manifest.json', { type: 'json' });
    if (!back || back.id !== id || !back.verified) throw new BackupError(500, 'The snapshot record didn\'t save', 'verify-failed');

    // 5. Archives: copy any not yet in the backup store, within the time budget. A problem here
    // doesn't undo the snapshot above, which is complete and checked: it's reported separately.
    let archives = null;
    if (copyArchives) {
      try { archives = await copyMissing(live, backups, 'archive/', start + budgetMs, now); }
      catch (e) { archives = { error: String(e && e.message || e) }; }
    }
    await updateStatus(backups, s => {
      const next = { ...s, lastOk: { id, at: start, reason }, lastError: null, last: { id, reason, startedAt: start, finishedAt: now(), result: 'ok' } };
      if (next.current && next.current.id === id) delete next.current;
      if (archives) next.archives = archives.error
        ? { ...(s.archives || {}), error: archives.error, at: start }
        : { inBackup: archives.have, pending: archives.pending, copiedLast: archives.copied, at: start };
      return next;
    });
    let pruned = null;
    if (doPrune) { try { pruned = await prune(backups, { now: now() }); } catch (e) { console.warn('prune failed', e); } }
    return { ok: true, id, at: start, reason, files, photos: Object.keys(photos).length, archives, pruned };
  } catch (e) {
    const message = String(e && e.message || e);
    await updateStatus(backups, s => {
      const next = { ...s, lastError: { at: now(), reason, message }, last: { id, reason, startedAt: start, finishedAt: now(), result: 'failed', message } };
      if (next.current && next.current.id === id) delete next.current;
      return next;
    }).catch(() => {});
    throw e;
  }
}

// Copies keys under prefix that are in `from` but not in `to`, until the deadline.
async function copyMissing(from, to, prefix, deadline, now) {
  const have = new Set(await keysUnder(to, prefix));
  const want = (await keysUnder(from, prefix)).filter(k => !have.has(k)).sort();
  let copied = 0;
  for (const key of want) {
    if (now() > deadline) break;
    const text = await getText(from, key);
    if (text == null) continue;
    await to.set(key, text);
    const back = await getText(to, key);
    if (back == null || sha(back) !== sha(text)) throw new BackupError(500, `Archive ${key} didn't copy correctly`, 'verify-failed');
    copied++;
  }
  return { copied, pending: want.length - copied, have: have.size + copied };
}

// ── listing ────────────────────────────────────────────────────────────────
// Every finished snapshot, newest first, plus how many are unfinished.
export async function listSnapshots(backups) {
  const keys = await keysUnder(backups, 'snap/');
  const ids = new Set(keys.map(k => k.split('/')[1]));
  const done = new Set(keys.filter(k => k.endsWith('/manifest.json')).map(k => k.split('/')[1]));
  const list = [];
  for (const id of done) {
    const m = await backups.get('snap/' + id + '/manifest.json', { type: 'json' });
    if (m && m.verified) list.push(summary(m));
  }
  list.sort((a, b) => b.at - a.at);
  return { snapshots: list, unfinished: [...ids].filter(i => !done.has(i)).length };
}
function summary(m) {
  const counts = {}; let bytes = 0;
  for (const [k, f] of Object.entries(m.files || {})) { if (!f.missing) { counts[k] = f.count; bytes += f.bytes; } }
  return { id: m.id, at: m.at, reason: m.reason, by: m.by || '', appVersion: m.appVersion || '', counts, bytes, photos: Object.keys(m.photos || {}).length };
}

// What the home screen and Admin show: the last good backup, problems, and the off-site reminder.
export async function backupStatus(backups, { now = Date.now() } = {}) {
  const s = await readStatus(backups);
  const lastOkAt = s.lastOk ? s.lastOk.at : 0;
  const stale = !lastOkAt || now - lastOkAt > KEEP.staleHours * 36e5;
  // The last finished attempt decides, by its result. (A status written by v3.1 has no "last":
  // its failure counted only if it came after the last success.)
  const failing = s.last ? s.last.result === 'failed' : !!(s.lastError && s.lastError.at > lastOkAt);
  const unfinished = s.current && now - s.current.startedAt > UNFINISHED_MS ? s.current : null;
  const archivesProblem = !!(s.archives && s.archives.error);
  return {
    lastOk: s.lastOk || null, lastAttemptAt: s.lastAttemptAt || 0,
    lastError: failing ? (s.last ? { at: s.last.finishedAt, reason: s.last.reason, message: s.last.message } : s.lastError) : null,
    unfinished: unfinished ? { startedAt: unfinished.startedAt, reason: unfinished.reason } : null,
    archives: s.archives || null, archivesProblem, lastSkip: s.lastSkip || null,
    offsiteAt: s.offsiteAt || 0, offsiteBy: s.offsiteBy || '', lastRestore: s.lastRestore || null,
    state: stale || failing || unfinished ? 'red' : archivesProblem ? 'amber' : 'green',
    offsiteDue: !s.offsiteAt || now - s.offsiteAt > KEEP.offsiteDays * DAY,
  };
}
export async function markOffsite(backups, by, now = Date.now()) {
  await updateStatus(backups, { offsiteAt: now, offsiteBy: String(by || '').slice(0, 10) });
  return { ok: true, offsiteAt: now };
}

// ── retention ──────────────────────────────────────────────────────────────
export async function prune(backups, { now = Date.now() } = {}) {
  const keys = await keysUnder(backups, 'snap/');
  const byId = new Map();
  for (const k of keys) { const id = k.split('/')[1]; if (!byId.has(id)) byId.set(id, []); byId.get(id).push(k); }
  const manifests = [];
  for (const [id, ks] of byId) {
    if (!ks.some(k => k.endsWith('/manifest.json'))) continue;
    const m = await backups.get('snap/' + id + '/manifest.json', { type: 'json' });
    if (m && m.verified) manifests.push(m);
  }
  manifests.sort((a, b) => b.at - a.at);
  const keep = new Set(manifests.slice(0, KEEP.newest).map(m => m.id));
  const firstOfMonth = new Map();
  for (const m of [...manifests].reverse()) { const mo = adlMonth(m.at); if (!firstOfMonth.has(mo)) firstOfMonth.set(mo, m.id); }
  for (const m of manifests) {
    const age = now - m.at;
    if (m.reason === 'nightly' && age <= KEEP.nightlyDays * DAY) keep.add(m.id);
    if (m.reason !== 'nightly' && age <= KEEP.manualDays * DAY) keep.add(m.id);
    if (firstOfMonth.get(adlMonth(m.at)) === m.id && age <= KEEP.monthlyDays * DAY) keep.add(m.id);
  }
  let removed = 0, unfinished = 0;
  for (const [id, ks] of byId) {
    if (keep.has(id)) continue;
    const finished = ks.some(k => k.endsWith('/manifest.json'));
    // An unfinished snapshot may still be being written: leave it a day before clearing it up.
    if (!finished && now - idTime(id) < DAY) continue;
    if (finished && !manifests.some(m => m.id === id)) continue; // unreadable record: leave it for a person to look at
    for (const k of ks) await backups.delete(k);
    finished ? removed++ : unfinished++;
  }
  // Photos no kept snapshot points at.
  const used = new Set();
  for (const m of manifests) if (keep.has(m.id)) for (const h of Object.values(m.photos || {})) used.add(h);
  let photos = 0;
  for (const k of await keysUnder(backups, 'photo/')) if (!used.has(k.slice(6))) { await backups.delete(k); photos++; }
  return { kept: keep.size, removed, unfinished, photos };
}
function idTime(id) {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(id);
  return m ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : 0;
}

// ── restoring ──────────────────────────────────────────────────────────────
// Restores the chosen sections of snapshot `id` from `source` into `live`. Before anything is
// written: every chosen file is checked against its checksum (any failure → nothing restored),
// then a "pre-restore" snapshot of the live data is taken into `ownBackups`, so the restore can
// itself be undone. Restored files get a newer version number than the live ones, so phones
// accept them.
export async function restoreSnapshot(live, source, ownBackups, opts = {}) {
  const now = opts.now || Date.now;
  const owner = 'restore-' + newId(now());
  await acquireLock(ownBackups, { owner, what: 'restore', now });
  try { return await restoreUnlocked(live, source, ownBackups, { ...opts, now }); }
  finally { await releaseLock(ownBackups, owner); }
}
async function restoreUnlocked(live, source, ownBackups, { id, sections, by = '', appVersion = '', budgetMs = 30000, now = Date.now } = {}) {
  if (!/^[\w-]+$/.test(String(id || ''))) throw new BackupError(400, 'Choose a snapshot', 'invalid');
  const chosen = SECTIONS.filter(s => (sections || []).includes(s.id));
  if (!chosen.length) throw new BackupError(400, 'Choose at least one part to restore', 'invalid');
  const m = await source.get('snap/' + id + '/manifest.json', { type: 'json' });
  if (!m || !m.verified) throw new BackupError(404, 'That snapshot is missing or unfinished', 'not-found');
  if (m.schema > BACKUP_SCHEMA) throw new BackupError(409, 'That snapshot was made by a newer version of these tools', 'too-new');

  // 1. Check everything first.
  const texts = {};
  for (const s of chosen) for (const key of s.files) {
    const f = m.files[key];
    if (!f || f.missing) continue;
    const text = await getText(source, 'snap/' + id + '/' + key + '.json');
    if (text == null || sha(text) !== f.sha) throw new BackupError(409, `The "${key}" file in that snapshot failed its check. Nothing was restored.`, 'corrupt');
    try { JSON.parse(text); } catch { throw new BackupError(409, `The "${key}" file in that snapshot can't be read. Nothing was restored.`, 'corrupt'); }
    texts[key] = text;
  }
  const photoTexts = {};
  if (chosen.some(s => s.photos)) {
    for (const [itemId, h] of Object.entries(m.photos || {})) {
      const text = await getText(source, 'photo/' + h);
      if (text == null || sha(text) !== h) throw new BackupError(409, 'A lost-property photo in that snapshot failed its check. Nothing was restored.', 'corrupt');
      photoTexts[itemId] = text;
    }
  }

  // 2. A snapshot of the live data as it is now.
  const pre = await takeSnapshot(live, ownBackups, { reason: 'pre-restore', by, appVersion, copyArchives: false, prune: false, now, lockHeld: true });

  // 3. Write, each file with a version number above the live one.
  const restored = [];
  for (const [key, text] of Object.entries(texts)) {
    const data = JSON.parse(text);
    for (let attempt = 0; ; attempt++) {
      const cur = await live.getWithMetadata(key, { type: 'json' });
      const out = { ...data, rev: Math.max((cur && cur.data && cur.data.rev) || 0, data.rev || 0) + 1, updatedAt: now(), restoredFrom: { id, at: m.at } };
      const res = await live.setJSON(key, out, cur && cur.data != null && cur.etag ? { onlyIfMatch: cur.etag } : {});
      if (!res || res.modified !== false) break;
      if (attempt >= 5) throw new BackupError(503, `Couldn't restore "${key}": it kept changing. Restored so far: ${restored.map(r => r.key).join(', ') || 'nothing'}.`, 'busy');
      await new Promise(r => setTimeout(r, 60 + Math.random() * 150));
    }
    restored.push({ key, count: LIVE_FILES[key](data) });
  }
  let photos = 0;
  for (const [itemId, text] of Object.entries(photoTexts)) { await live.set('lost-photo/' + itemId, text); photos++; }
  let archives = null;
  if (chosen.some(s => s.archives)) archives = await copyMissing(source, live, 'archive/', now() + budgetMs, now);

  // 4. Read back and compare counts.
  for (const r of restored) {
    const back = await live.get(r.key, { type: 'json' });
    if (!back || LIVE_FILES[r.key](back) !== r.count) throw new BackupError(500, `"${r.key}" didn't read back as restored`, 'verify-failed');
  }
  const record = { at: now(), id, snapshotAt: m.at, by: String(by || '').slice(0, 10), sections: chosen.map(s => s.id), preRestore: pre.id };
  await updateStatus(ownBackups, { lastRestore: record });
  return { ok: true, restored, photos, archives, preRestore: pre.id, snapshotAt: m.at };
}

// ── the off-site download, one part at a time ──────────────────────────────
// Each part is returned as its stored text with its checksum, so the browser can check it.
export async function downloadPart(live, key) {
  if (!Object.hasOwn(LIVE_FILES, key)) throw new BackupError(400, 'Unknown part', 'invalid');
  const text = await getText(live, key);
  return text == null ? { key, missing: true } : { key, sha: sha(text), text };
}
export async function currentCounts(live) {
  const out = {};
  for (const [key, count] of Object.entries(LIVE_FILES)) {
    const d = await live.get(key, { type: 'json' });
    out[key] = d ? count(d) : null;
  }
  return out;
}

// For the tests only.
export const __test = { updateStatus };
