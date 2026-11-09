// Backups, restore, retention and preview separation (v3.1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { memStore } from './memstore.mjs';
import { handleAction, handleView } from '../netlify/lib/ops-core.mjs';
import { takeSnapshot, listSnapshots, restoreSnapshot, prune, backupStatus, storeNames, deployContextOf, downloadPart, KEEP, acquireLock, releaseLock, LOCK_LEASE_MS } from '../netlify/lib/backup-core.mjs';

const sha = t => createHash('sha256').update(t).digest('hex');
const p = o => new URLSearchParams(o);
const DAY = 864e5;

// A live store with a bit of everything: a day with a bike out, an issue, a bike in the register,
// an M-check, a lost item with a photo, and two archived days.
async function seeded() {
  const live = memStore();
  await handleAction(live, { action: 'loadManifest', manifestDate: '2026-11-01', manifestDateDisplay: '1 Nov 2026', groups: [{ id: 'grpA1', name: 'Smith (x2)' }], contacts: [{ code: 'R1', name: 'Ann Smith', phone: '+61400000000' }] });
  await handleAction(live, { action: 'saveAsset', isNew: true, asset: { id: 'EB-012', serial: 'S12', brand: 'Gazelle', model: 'T3', purchaseDate: '2024-01-01' } });
  await handleAction(live, { action: 'addBike', groupId: 'grpA1', bike: { id: 'bike01', code: 'EB-012', ts: 1 } });
  await handleAction(live, { action: 'reportIssue', issue: { id: 'iss001', bikeId: 'EB-012', issue: 'Squeak', priority: 2, reportedBy: 'SO', odometer: 10 } });
  await handleAction(live, { action: 'mcheck', check: { id: 'chk001', bike: 'EB-012', failed: [], by: 'SO' } });
  await handleAction(live, { action: 'lostAdd', by: 'SO', photo: 'data:image/jpeg;base64,' + 'A'.repeat(400), item: { id: 'lost01', description: 'Blue hat', foundDate: '2026-11-01', foundSite: 'VIC', storedAt: 'VIC' } });
  await live.setJSON('archive/2026-10-30/1000-manifest', { archivedAt: 1000, reason: 'manifest', day: { manifestDate: '2026-10-30', groups: [{ id: 'g', name: 'Old' }], contacts: [] } });
  await live.setJSON('archive/2026-10-31/2000-manifest', { archivedAt: 2000, reason: 'manifest', day: { manifestDate: '2026-10-31', groups: [{ id: 'h', name: 'Older' }], contacts: [] } });
  return live;
}
const ctxFor = (backups, extra = {}) => ({ backups, liveBackups: backups, isLive: true, deployContext: 'production', ...extra });

test('a snapshot holds every live file, the photos and the archives, each checked', async () => {
  const live = await seeded(), backups = memStore();
  const r = await takeSnapshot(live, backups, { reason: 'manual', by: 'SO' });
  assert.equal(r.files.day.count, 1);
  assert.equal(r.files.issues.count, 1);
  assert.equal(r.files.assets.count, 1);
  assert.equal(r.files.mchecks.count, 1);
  assert.equal(r.files['lost-property'].count, 1);
  assert.equal(r.photos, 1);
  assert.equal(r.archives.copied, 2);
  // Each backed-up file matches its checksum, and matches the live file exactly.
  for (const [key, f] of Object.entries(r.files)) {
    if (f.missing) continue;
    const text = backups.m.get('snap/' + r.id + '/' + key + '.json').body;
    assert.equal(sha(text), f.sha, key);
    assert.equal(text, live.m.get(key).body, key);
  }
  assert.ok(backups.m.has('archive/2026-10-30/1000-manifest'));
  const list = await listSnapshots(backups);
  assert.equal(list.snapshots.length, 1);
  assert.equal(list.snapshots[0].counts.issues, 1);
  const st = await backupStatus(backups);
  assert.equal(st.state, 'green');
  assert.equal(st.offsiteDue, true);
  // A second snapshot doesn't copy the photo or the archives again.
  const before = [...backups.m.keys()].filter(k => k.startsWith('photo/')).length;
  const r2 = await takeSnapshot(live, backups, { reason: 'manual' });
  assert.equal(r2.archives.copied, 0);
  assert.equal([...backups.m.keys()].filter(k => k.startsWith('photo/')).length, before);
});

test('a snapshot that fails part-way is never treated as a backup, and the status turns red', async () => {
  const live = await seeded(), backups = memStore();
  const good = await takeSnapshot(live, backups, { reason: 'nightly' });
  backups.failWhen = (op, key) => op === 'set' && key.endsWith('/issues.json');
  await assert.rejects(takeSnapshot(live, backups, { reason: 'nightly' }), /simulated/);
  backups.failWhen = null;
  const list = await listSnapshots(backups);
  assert.equal(list.snapshots.length, 1, 'only the good one is listed');
  assert.equal(list.snapshots[0].id, good.id);
  assert.equal(list.unfinished, 1);
  const st = await backupStatus(backups);
  assert.equal(st.state, 'red');
  assert.match(st.lastError.message, /simulated/);
  // The next good run clears it.
  await takeSnapshot(live, backups, { reason: 'nightly' });
  assert.equal((await backupStatus(backups)).state, 'green');
  // The unfinished one is cleared up once it's a day old.
  const r = await prune(backups, { now: Date.now() + 2 * DAY });
  assert.equal(r.unfinished, 1);
  assert.equal((await listSnapshots(backups)).unfinished, 0);
});

test('a backup that doesn\'t read back correctly fails; an unreadable live file is refused', async () => {
  const live = await seeded(), backups = memStore();
  // The store "loses" the assets file between writing and reading back.
  const realGet = backups.get;
  backups.get = async (k, o) => (k.endsWith('/assets.json') ? null : realGet(k, o));
  await assert.rejects(takeSnapshot(live, backups), e => e.code === 'verify-failed');
  backups.get = realGet;
  assert.equal((await listSnapshots(backups)).snapshots.length, 0);
  live.m.get('issues').body = '{"issues": [ broken';
  await assert.rejects(takeSnapshot(live, backups), e => e.code === 'unreadable');
  assert.equal((await backupStatus(backups)).state, 'red');
});

test('nothing goes stale unnoticed: red after 36 hours without a good backup; off-site reminder after 30 days', async () => {
  const live = await seeded(), backups = memStore();
  await takeSnapshot(live, backups);
  const t = Date.now();
  assert.equal((await backupStatus(backups, { now: t + 35 * 36e5 })).state, 'green');
  assert.equal((await backupStatus(backups, { now: t + 37 * 36e5 })).state, 'red');
  await handleAction(live, { action: 'markOffsite', by: 'SO' }, ctxFor(backups));
  assert.equal((await backupStatus(backups, { now: t + 29 * DAY })).offsiteDue, false);
  assert.equal((await backupStatus(backups, { now: t + 31 * DAY })).offsiteDue, true);
});

test('restore: checked first, a safety snapshot taken, only the chosen parts replaced, phones see it as newer', async () => {
  const live = await seeded(), backups = memStore();
  const snap = await takeSnapshot(live, backups, { reason: 'manual' });
  // Things go wrong afterwards: the issue is resolved, the bike is removed, the lost item closed.
  await handleAction(live, { action: 'resolveIssue', id: 'iss001', resolution: 'Oiled', repairedBy: 'JB' });
  await handleAction(live, { action: 'lostClose', id: 'lost01', outcome: 'donated', closedDate: '2026-11-01', by: 'SO' });
  live.m.delete('lost-photo/lost01');
  live.m.delete('archive/2026-10-30/1000-manifest');
  const issuesRevBefore = (await live.get('issues', { type: 'json' })).rev;
  const lostBefore = live.m.get('lost-property').body;

  const r = await restoreSnapshot(live, backups, backups, { id: snap.id, sections: ['issues', 'archives'], by: 'SO' });
  assert.ok(r.preRestore);
  const issues = await live.get('issues', { type: 'json' });
  assert.equal(issues.issues[0].status, 'open', 'issue log back as it was');
  assert.ok(issues.rev > issuesRevBefore, 'restored file has a newer version number');
  assert.equal(issues.restoredFrom.id, snap.id);
  assert.equal(live.m.get('lost-property').body, lostBefore, 'lost property not touched');
  assert.ok(live.m.has('archive/2026-10-30/1000-manifest'), 'missing archive added back');
  assert.equal(r.archives.copied, 1);
  // The safety snapshot holds the resolved issue, so the restore itself can be undone.
  const pre = backups.m.get('snap/' + r.preRestore + '/issues.json').body;
  assert.equal(JSON.parse(pre).issues[0].status, 'resolved');
  // Lost property with its photo.
  await restoreSnapshot(live, backups, backups, { id: snap.id, sections: ['lost'] });
  assert.equal((await live.get('lost-property', { type: 'json' })).items[0].status, 'open');
  assert.ok(live.m.has('lost-photo/lost01'));
  assert.equal((await backupStatus(backups)).lastRestore.sections[0], 'lost');
});

test('restore: a damaged snapshot is refused and nothing changes', async () => {
  const live = await seeded(), backups = memStore();
  const snap = await takeSnapshot(live, backups);
  backups.m.get('snap/' + snap.id + '/assets.json').body = '{"assets":[]}';
  const before = live.m.get('assets').body, keys = backups.m.size;
  await assert.rejects(restoreSnapshot(live, backups, backups, { id: snap.id, sections: ['assets', 'issues'] }), e => e.code === 'corrupt');
  assert.equal(live.m.get('assets').body, before);
  assert.equal(backups.m.size, keys, 'no safety snapshot taken for a refused restore');
  await assert.rejects(restoreSnapshot(live, backups, backups, { id: 'nope', sections: ['issues'] }), e => e.code === 'not-found');
  await assert.rejects(restoreSnapshot(live, backups, backups, { id: snap.id, sections: [] }), e => e.code === 'invalid');
});

test('retention: 30 nightly, 12 monthly, 90 days for manual ones, and never fewer than the newest three', async () => {
  const backups = memStore();
  const now = Date.UTC(2026, 10, 1, 16);
  const add = (daysAgo, reason) => {
    const at = now - daysAgo * DAY, d = new Date(at), pad = n => String(n).padStart(2, '0');
    const id = d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + '-160000-' + reason.slice(0, 4) + daysAgo;
    backups.m.set('snap/' + id + '/day.json', { body: '{}', etag: 'x' });
    backups.m.set('snap/' + id + '/manifest.json', { body: JSON.stringify({ id, at, reason, verified: true, files: {}, photos: {} }), etag: 'x' });
    return id;
  };
  const ids = {};
  for (let d = 0; d < 400; d++) ids['n' + d] = add(d, 'nightly');
  ids.m60 = add(60.5, 'manual'); ids.m100 = add(100.5, 'manual');
  await prune(backups, { now });
  const kept = new Set((await listSnapshots(backups)).snapshots.map(s => s.id));
  for (let d = 0; d <= KEEP.nightlyDays; d++) assert.ok(kept.has(ids['n' + d]), 'nightly ' + d);
  assert.ok(!kept.has(ids.n45), 'a 45-day-old nightly that isn\'t the first of its month goes');
  assert.ok(kept.has(ids.m60), 'manual within 90 days stays');
  assert.ok(!kept.has(ids.m100), 'manual over 90 days goes');
  const older = [...kept].filter(id => !Object.values(ids).slice(0, 31).includes(id) && id !== ids.m60);
  assert.ok(older.length >= 11 && older.length <= 13, 'about one a month for a year: ' + older.length);
  // Old as they are, the newest three are always kept.
  const b2 = memStore();
  for (const d of [200, 300, 400, 500]) {
    const id = '2025' + d + '-old' + d;
    b2.m.set('snap/' + id + '/manifest.json', { body: JSON.stringify({ id, at: now - d * DAY, reason: 'manual', verified: true, files: {}, photos: {} }), etag: 'x' });
  }
  await prune(b2, { now });
  assert.equal((await listSnapshots(b2)).snapshots.length, 3);
});

test('archives are copied within the time budget, and the rest the next night', async () => {
  const live = await seeded(), backups = memStore();
  let t = 1_000_000;
  const clock = () => (t += 1000);
  const r = await takeSnapshot(live, backups, { budgetMs: 0, now: clock, prune: false });
  assert.equal(r.archives.copied, 0);
  assert.equal(r.archives.pending, 2);
  assert.equal((await backupStatus(backups, { now: t })).archives.pending, 2);
  const r2 = await takeSnapshot(live, backups, { budgetMs: 60000, now: clock, prune: false });
  assert.equal(r2.archives.copied, 2);
  assert.equal(r2.archives.pending, 0);
});

test('previews have their own data; only a preview can load a live backup', async () => {
  assert.deepEqual(storeNames('production'), { live: 'sa-ebikes-ops', backups: 'sa-ebikes-backups', liveBackups: 'sa-ebikes-backups', isLive: true });
  const prev = storeNames('deploy-preview');
  assert.equal(prev.live, 'sa-ebikes-ops-deploy-preview');
  assert.equal(prev.backups, 'sa-ebikes-backups-deploy-preview');
  assert.equal(prev.liveBackups, 'sa-ebikes-backups');
  assert.equal(storeNames('branch-deploy').isLive, false);
  assert.equal(deployContextOf(new Request('https://ops.example.com/api/ops'), { deploy: { context: 'production' } }), 'production');
  assert.equal(deployContextOf(new Request('https://ops.example.com/api/ops'), { deploy: { context: 'deploy-preview' } }), 'deploy-preview');
  assert.equal(deployContextOf(new Request('https://deploy-preview-3--ops.netlify.app/api/ops'), {}), 'deploy-preview', 'a preview URL is never treated as live');

  const liveData = await seeded(), liveBackups = memStore();
  const snap = await takeSnapshot(liveData, liveBackups);
  const liveBefore = [...liveData.m.entries()].map(([k, v]) => k + v.etag).join();
  // On the live site, "from live" is refused.
  await assert.rejects(handleAction(liveData, { action: 'restoreSnapshot', from: 'live', id: snap.id, sections: ['day'], confirm: 'RESTORE' }, ctxFor(liveBackups)), e => e.code === 'forbidden');
  // A preview loads it into its own, empty data. The live data and live backups are untouched.
  const previewData = memStore(), previewBackups = memStore();
  const ctx = { backups: previewBackups, liveBackups, isLive: false, deployContext: 'deploy-preview' };
  const v = await handleView(previewData, p({ view: 'backups' }), ctx);
  assert.equal(v.isLive, false);
  assert.equal(v.liveSnapshots[0].id, snap.id);
  await assert.rejects(handleAction(previewData, { action: 'restoreSnapshot', from: 'live', id: snap.id, sections: ['day'] }, ctx), e => e.code === 'invalid', 'needs RESTORE typed');
  const all = v.sections.map(s => s.id);
  await handleAction(previewData, { action: 'restoreSnapshot', from: 'live', id: snap.id, sections: all, confirm: 'RESTORE', by: 'SO' }, ctx);
  assert.equal((await previewData.get('day', { type: 'json' })).groups[0].bikes[0].code, 'EB-012');
  assert.ok(previewData.m.has('lost-photo/lost01'));
  assert.ok(previewData.m.has('archive/2026-10-31/2000-manifest'));
  assert.equal([...liveData.m.entries()].map(([k, v]) => k + v.etag).join(), liveBefore, 'live data untouched');
  assert.equal((await listSnapshots(liveBackups)).snapshots.length, 1, 'no snapshot written to the live backups');
});

test('Admin: back up now, list, download parts with checksums; backups need the backup store', async () => {
  const live = await seeded(), backups = memStore();
  const r = await handleAction(live, { action: 'backupNow', by: 'so' }, ctxFor(backups));
  assert.equal(r.reason, 'manual');
  const v = await handleView(live, p({ view: 'backups' }), ctxFor(backups));
  assert.equal(v.snapshots[0].by, 'SO');
  assert.equal(v.current.assets, 1);
  assert.equal(v.status.state, 'green');
  assert.equal(v.liveSnapshots, undefined);
  const part = await handleView(live, p({ view: 'backupPart', key: 'issues' }), ctxFor(backups));
  assert.equal(sha(part.text), part.sha);
  assert.equal(JSON.parse(part.text).issues.length, 1);
  await assert.rejects(handleView(live, p({ view: 'backupPart', key: 'archive/x' }), ctxFor(backups)), e => e.code === 'invalid');
  assert.equal((await downloadPart(memStore(), 'team')).missing, true);
  const st = await handleView(live, p({ view: 'backupStatus' }), ctxFor(backups));
  assert.equal(st.state, 'green');
  await assert.rejects(handleView(live, p({ view: 'backupStatus' })), e => e.code === 'no-backups');
  // The old all-in-one download and the JSONBin move are gone.
  await assert.rejects(handleView(live, p({ view: 'backup' })), e => e.code === 'invalid');
  await assert.rejects(handleAction(live, { action: 'migrateFromJsonbin' }), e => e.code === 'invalid');
});

test('VIC\'s default opening list includes the backup check; other sites don\'t', async () => {
  const live = await seeded();
  await handleAction(live, { action: 'addLocation', location: { code: 'OXB', name: 'Oxenberry Farm' } }).catch(() => {});
  const v = await handleView(live, p({ view: 'sitechecks', date: '2026-11-01' }));
  assert.ok(v.sites.VIC.lists.open.some(i => /Backup status/.test(i.label)));
  assert.ok(!v.sites.OXB.lists.open.some(i => /Backup status/.test(i.label)));
  assert.ok(!v.sites.VIC.lists.close.some(i => /Backup status/.test(i.label)));
});

// ── v3.2: status by result, one run at a time ──────────────────────────────
const failOn = (store, suffix) => { store.failWhen = (op, key) => op === 'set' && key.endsWith(suffix); };

test('a failure recorded in the same millisecond as the last success still shows red', async () => {
  const live = await seeded(), backups = memStore();
  const frozen = () => 1_700_000_000_000;
  await takeSnapshot(live, backups, { reason: 'nightly', now: frozen, prune: false });
  failOn(backups, '/issues.json');
  await assert.rejects(takeSnapshot(live, backups, { reason: 'nightly', now: frozen, prune: false }));
  backups.failWhen = null;
  const st = await backupStatus(backups, { now: frozen() });
  assert.equal(st.state, 'red');
  assert.match(st.lastError.message, /simulated/);
  // And a success afterwards, still in the same millisecond, turns it green again.
  await takeSnapshot(live, backups, { reason: 'manual', now: frozen, prune: false });
  assert.equal((await backupStatus(backups, { now: frozen() })).state, 'green');
});

test('only one backup or restore runs at a time; a nightly that finds one running is skipped, not failed', async () => {
  const live = await seeded(), backups = memStore();
  await takeSnapshot(live, backups, { reason: 'nightly' });
  await acquireLock(backups, { owner: 'someone-else', what: 'restore' });
  await assert.rejects(takeSnapshot(live, backups, { reason: 'manual' }), e => e.code === 'busy' && /restore is already running/.test(e.message));
  await assert.rejects(takeSnapshot(live, backups, { reason: 'nightly' }), e => e.code === 'busy');
  const st = await backupStatus(backups);
  assert.equal(st.state, 'green', 'a skipped nightly is not a failure');
  assert.ok(st.lastSkip);
  await assert.rejects(restoreSnapshot(live, backups, backups, { id: (await listSnapshots(backups)).snapshots[0].id, sections: ['issues'] }), e => e.code === 'busy');
  await releaseLock(backups, 'someone-else');
  await takeSnapshot(live, backups, { reason: 'manual' });
  assert.ok(!backups.m.has('lock'), 'the lock is released after a run');
  // Two runs started together: exactly one gets to run.
  const results = await Promise.allSettled([takeSnapshot(live, backups, { reason: 'manual', prune: false }), takeSnapshot(live, backups, { reason: 'manual', prune: false })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected' && r.reason.code === 'busy').length, 1);
});

test('a lock left by a run that was cut off expires', async () => {
  const live = await seeded(), backups = memStore();
  let t = 1_800_000_000_000; const clock = () => t;
  await acquireLock(backups, { owner: 'cut-off', now: clock });
  await assert.rejects(takeSnapshot(live, backups, { now: clock, prune: false }), e => e.code === 'busy');
  t += LOCK_LEASE_MS + 1000;
  const r = await takeSnapshot(live, backups, { now: clock, prune: false });
  assert.ok(r.ok);
});

test('a run that was cut off part-way shows red once it is clearly not going to finish', async () => {
  const live = await seeded(), backups = memStore();
  let t = 1_800_000_000_000; const clock = () => t;
  await takeSnapshot(live, backups, { reason: 'nightly', now: clock, prune: false });
  t += 86_400_000;
  // The function is stopped while writing: no failure is ever recorded, and the lock stays behind.
  backups.failWhen = (op, key) => op === 'set' && key.endsWith('/assets.json');
  const realSetJSON = backups.setJSON;
  backups.setJSON = async (k, d, o) => { if (k === 'status' && d.last && d.last.result === 'failed') return { modified: true }; return realSetJSON(k, d, o); };
  backups.delete = async () => {}; // the lock isn't released either
  await assert.rejects(takeSnapshot(live, backups, { reason: 'nightly', now: clock, prune: false }));
  assert.equal((await backupStatus(backups, { now: t + 60_000 })).state, 'green', 'still running for all we know');
  const st = await backupStatus(backups, { now: t + 11 * 60_000 });
  assert.equal(st.state, 'red');
  assert.equal(st.unfinished.reason, 'nightly');
});

test('status writes from two runs at once are never lost', async () => {
  const backups = memStore();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const g = backups.getWithMetadata;
  backups.getWithMetadata = async (k, o) => { const r = await g(k, o); await sleep(Math.random() * 5); return r; };
  await Promise.all(Array.from({ length: 20 }, (_, i) => handleAction(memStore(), { action: 'markOffsite', by: 'S' + i }, ctxFor(backups)).catch(() => {}) ));
  // Twenty writers each adding their own field: all twenty are there.
  const { updateStatusForTest } = await import('../netlify/lib/backup-core.mjs').then(m => ({ updateStatusForTest: m.__test.updateStatus }));
  await Promise.all(Array.from({ length: 20 }, (_, i) => updateStatusForTest(backups, s => ({ ...s, ['w' + i]: true }))));
  const st = await backups.get('status', { type: 'json' });
  for (let i = 0; i < 20; i++) assert.ok(st['w' + i], 'writer ' + i);
});

test('an archive that fails to copy shows amber, and the good snapshot still counts', async () => {
  const live = await seeded(), backups = memStore();
  failOn(backups, 'archive/2026-10-31/2000-manifest');
  const r = await takeSnapshot(live, backups, { reason: 'nightly' });
  backups.failWhen = null;
  assert.ok(r.ok);
  assert.equal((await listSnapshots(backups)).snapshots.length, 1);
  const st = await backupStatus(backups);
  assert.equal(st.state, 'amber');
  assert.ok(st.archivesProblem);
  await takeSnapshot(live, backups, { reason: 'manual' });
  assert.equal((await backupStatus(backups)).state, 'green', 'the next run copies it and clears the warning');
});

test('a status written by v3.1 is read correctly', async () => {
  const backups = memStore();
  const t = Date.now();
  await backups.setJSON('status', { lastOk: { id: 'x', at: t - 1000, reason: 'nightly' }, lastError: { at: t, reason: 'manual', message: 'old failure' } });
  assert.equal((await backupStatus(backups, { now: t })).state, 'red');
  await backups.setJSON('status', { lastOk: { id: 'x', at: t, reason: 'nightly' }, lastError: null });
  assert.equal((await backupStatus(backups, { now: t })).state, 'green');
});
