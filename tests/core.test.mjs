// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAction, handleView } from '../netlify/lib/ops-core.mjs';

// In-memory stand-in for Netlify Blobs, including conditional writes.
// `delayWrites` lets us interleave two requests to prove they don't clobber each other.
function memStore({ delayReads = 0 } = {}) {
  const m = new Map(); let n = 0;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  return {
    m,
    async getWithMetadata(k) { await sleep(delayReads); const v = m.get(k); return v ? { data: JSON.parse(v.body), etag: v.etag, metadata: {} } : null; },
    async get(k) { const v = m.get(k); return v ? JSON.parse(v.body) : null; },
    async setJSON(k, data, o = {}) {
      const cur = m.get(k);
      if (o.onlyIfNew && cur) return { modified: false };
      if (o.onlyIfMatch && (!cur || cur.etag !== o.onlyIfMatch)) return { modified: false };
      const etag = 'e' + (++n); m.set(k, { body: JSON.stringify(data), etag }); return { modified: true, etag };
    },
    async list({ prefix }) { return { blobs: [...m.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key, etag: m.get(key).etag })), directories: [] }; },
  };
}
const p = o => new URLSearchParams(o);
// What's stored, read straight from the test store (the old all-in-one backup view was retired in v3.1).
async function dump(s) {
  const g = async k => (await s.get(k)) || {};
  const lost = await g('lost-property'), photos = {};
  for (const i of lost.items || []) { const ph = await s.get('lost-photo/' + i.id); if (ph) photos[i.id] = ph.data; }
  return { day: { deletedGroups: [], ...(await g('day')) }, assets: await g('assets'), moves: await g('moves'), mchecks: await g('mchecks'),
    siteChecks: await g('site-checks'), lostProperty: { ...lost, photos } };
}
const manifest = { action: 'loadManifest', manifestDate: '2026-10-06', manifestDateDisplay: '6 Oct 2026',
  groups: [{ id: 'grpA1', name: 'Smith (x2)' }, { id: 'grpB1', name: 'Jones (x3)' }],
  contacts: [{ code: 'R1', name: 'Ann Smith', phone: '+61400000000', totalBikes: 2 }] };

test('manifest load, add bikes, duplicate and view', async () => {
  const s = memStore();
  await handleAction(s, manifest);
  const r = await handleAction(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'bike01', code: 'eb-012', ts: 1 } });
  assert.equal(r.result, 'added');
  assert.equal(r.view.groups[0].bikes[0].code, 'EB-012');
  await assert.rejects(handleAction(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'bike02', code: 'EB-012' } }), e => e.code === 'duplicate');
  // retrying the same request is harmless
  const again = await handleAction(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'bike01', code: 'EB-012' } });
  assert.equal(again.result, 'already-saved');
  const c = await handleView(s, p({ view: 'contacts' }));
  assert.equal(c.contacts.length, 1);
});

test('two phones scanning at once keep both bikes', async () => {
  const s = memStore({ delayReads: 15 });
  await handleAction(s, manifest);
  await Promise.all([
    handleAction(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'bikeA1', code: 'EB-001' } }),
    handleAction(s, { action: 'addBike', groupId: 'grpB1', bike: { id: 'bikeB1', code: 'EB-002' } }),
    handleAction(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'bikeA2', code: 'EB-003' } }),
  ]);
  const v = await handleView(s, p({ view: 'scanner' }));
  const all = v.groups.flatMap(g => g.bikes.map(b => b.code)).sort();
  assert.deepEqual(all, ['EB-001', 'EB-002', 'EB-003']);
});

test('out-of-service bikes are refused; open issues flagged; a bike out with another group is refused', async () => {
  const s = memStore();
  await handleAction(s, manifest);
  await handleAction(s, { action: 'reportIssue', issue: { id: 'iss001', bikeId: 'eb-009', issue: 'Brakes gone', priority: 5, reportedBy: 'so', odometer: '1,200' } });
  await handleAction(s, { action: 'reportIssue', issue: { id: 'iss002', bikeId: 'EB-010', issue: 'Squeak', priority: 2, reportedBy: 'SO', odometer: 800 } });
  await assert.rejects(handleAction(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'bike09', code: 'EB-009' } }), e => e.code === 'oos');
  const r = await handleAction(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'bike10', code: 'EB-010' } });
  assert.equal(r.openIssue, true);
  // v3.8: refused while it's still out with Smith, with the group named
  await assert.rejects(handleAction(s, { action: 'addBike', groupId: 'grpB1', bike: { id: 'bike11', code: 'EB-010' } }),
    e => e.code === 'out-elsewhere' && /Smith \(x2\)/.test(e.message) && e.extra.groupId === 'grpA1');
  await handleAction(s, { action: 'checkIn', groupId: 'grpA1', bikeId: 'bike10' });
  await handleAction(s, { action: 'setGroupStatus', groupId: 'grpA1', status: 'returned' });
  const r3 = await handleAction(s, { action: 'addBike', groupId: 'grpB1', bike: { id: 'bike12', code: 'EB-099' } });
  assert.equal(r3.alsoIn, undefined);
});

test('resolve issue, double resolve refused', async () => {
  const s = memStore();
  await handleAction(s, { action: 'reportIssue', issue: { id: 'iss001', bikeId: 'EB-009', issue: 'x', priority: 5, reportedBy: 'SO', odometerUnreadable: true } });
  const r = await handleAction(s, { action: 'resolveIssue', id: 'iss001', resolution: 'New pads', repairedBy: 'Shayne' });
  assert.equal(r.view.issues[0].status, 'resolved');
  // v3.3: resolving again (a retry, or someone else got there first) isn't an error; it says who did it.
  const again = await handleAction(s, { action: 'resolveIssue', id: 'iss001', resolution: 'y', repairedBy: 'z' });
  assert.equal(again.result, 'already-resolved');
  const v = await handleView(s, p({ view: 'scanner' }));
  assert.deepEqual(v.oos, []);
});

test('new manifest archives the previous day and returns it', async () => {
  const s = memStore();
  await handleAction(s, manifest);
  await handleAction(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'bike01', code: 'EB-001' } });
  const r = await handleAction(s, { ...manifest, manifestDate: '2026-10-07', groups: [{ id: 'grpC1', name: 'Lee (x1)' }] });
  assert.equal(r.previous.groups[0].bikes[0].code, 'EB-001');
  assert.ok(r.archiveKey.startsWith('archive/2026-10-06/'));
  const list = await handleView(s, p({ view: 'archives' }));
  assert.equal(list.archives.length, 1);
  const a = await handleView(s, p({ view: 'archive', key: list.archives[0] }));
  assert.equal(a.day.manifestDate, '2026-10-06');
  // reset keeps contacts, clears groups, archives first
  const reset = await handleAction(s, { action: 'resetDay' });
  assert.equal(reset.view.groups.length, 0);
  assert.equal((await handleView(s, p({ view: 'contacts' }))).contacts.length, 1);
});

test('deleted group gives a clear error', async () => {
  const s = memStore();
  await handleAction(s, manifest);
  await handleAction(s, { action: 'deleteGroup', groupId: 'grpA1' });
  await assert.rejects(handleAction(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'bike01', code: 'EB-001' } }), e => e.code === 'no-group');
});

test('asset register: add, no silent overwrite, rename, import, delete', async () => {
  const s = memStore();
  const a = { id: 'eb-001', serial: 'wtu 001', keyNumber: 'K12', brand: 'Giant', model: 'Explore E+', size: 'M', purchaseDate: '2024-09-15' };
  let r = await handleAction(s, { action: 'saveAsset', asset: a, isNew: true });
  assert.equal(r.view.assets[0].id, 'EB-001');
  // v3.3: the same bike again (a retry) is fine; a different bike with the same ID is still refused.
  assert.equal((await handleAction(s, { action: 'saveAsset', asset: a, isNew: true })).result, 'already-saved');
  await assert.rejects(handleAction(s, { action: 'saveAsset', asset: { ...a, serial: 'DIFFERENT-1' }, isNew: true }), e => e.code === 'exists');
  r = await handleAction(s, { action: 'saveAsset', asset: { ...a, keyNumber: 'K13' }, originalId: 'EB-001' });
  assert.equal(r.result, 'updated'); assert.equal(r.view.assets[0].keyNumber, 'K13');
  await assert.rejects(handleAction(s, { action: 'saveAsset', asset: { ...a, purchaseDate: '2999-01-01' }, originalId: 'EB-001' }), e => e.code === 'invalid');
  r = await handleAction(s, { action: 'importAssets', assets: [{ ...a, id: 'EB-001', brand: 'Giant AU' }, { id: 'EB-010', serial: 'T010', brand: 'Tern', model: 'GSD', size: '20in' }, { id: 'EB-2', serial: 'TR2', brand: 'Trek' }] });
  assert.equal(r.added, 2); assert.equal(r.updated, 1);
  assert.deepEqual(r.view.assets.map(x => x.id), ['EB-001', 'EB-2', 'EB-010']);
  r = await handleAction(s, { action: 'saveAsset', asset: { ...a, id: 'EB-099', serial: 'TR2' }, originalId: 'EB-2' });
  assert.ok(r.view.assets.some(x => x.id === 'EB-099') && !r.view.assets.some(x => x.id === 'EB-2'));
  await assert.rejects(handleAction(s, { action: 'saveAsset', asset: { ...a, id: 'EB-010', serial: 'TR2' }, originalId: 'EB-099' }), e => e.code === 'exists');
  r = await handleAction(s, { action: 'deleteAsset', id: 'EB-099' });
  assert.equal(r.view.assets.length, 2);
});

test('issues carry a snapshot of the bike details and the issues view includes the register', async () => {
  const s = memStore();
  await handleAction(s, { action: 'saveAsset', isNew: true, asset: { id: 'EB-001', serial: 'S1', keyNumber: 'K12', brand: 'Giant', model: 'Explore', size: 'M', purchaseDate: '2024-01-01' } });
  const r = await handleAction(s, { action: 'reportIssue', issue: { id: 'iss001', bikeId: 'eb-001', issue: 'Flat', priority: 2, reportedBy: 'SO', odometer: 800 } });
  assert.equal(r.inRegister, true);
  assert.equal(r.view.issues[0].asset.brand, 'Giant');
  assert.equal(r.view.issues[0].asset.serial, 'S1');
  assert.equal(r.view.assets.length, 1);
  const r2 = await handleAction(s, { action: 'reportIssue', issue: { id: 'iss002', bikeId: 'EB-777', issue: 'Flat', priority: 2, reportedBy: 'SO', odometer: 800 } });
  assert.equal(r2.inRegister, false);
  assert.equal(r2.view.issues[0].asset, undefined);
  const v = await handleView(s, new URLSearchParams({ view: 'issues' }));
  assert.equal(v.assets[0].keyNumber, 'K12');
  const b = await dump(s);
  assert.equal(b.assets.assets.length, 1);
});

test('serial number is required, stored tidily, and unique', async () => {
  const s = memStore();
  const base = { id: 'EB-001', keyNumber: 'K1', brand: 'Giant', model: 'Explore' };
  await assert.rejects(handleAction(s, { action: 'saveAsset', isNew: true, asset: base }), e => e.code === 'invalid' && /Serial/.test(e.message));
  let r = await handleAction(s, { action: 'saveAsset', isNew: true, asset: { ...base, serial: '  wtu  123 ' } });
  assert.equal(r.view.assets[0].serial, 'WTU 123');
  // same serial, different spacing, on another bike
  await assert.rejects(handleAction(s, { action: 'saveAsset', isNew: true, asset: { ...base, id: 'EB-002', serial: 'WTU123' } }), e => e.code === 'serial-exists' && /EB-001/.test(e.message));
  // editing a bike keeps its own serial without tripping the check
  r = await handleAction(s, { action: 'saveAsset', originalId: 'EB-001', asset: { ...base, serial: 'WTU 123', keyNumber: 'K9' } });
  assert.equal(r.result, 'updated');
  // import: missing serial names the row; a clash cancels everything
  await assert.rejects(handleAction(s, { action: 'importAssets', assets: [{ id: 'EB-003', serial: 'A3' }, { id: 'EB-004' }] }), e => /Row 3/.test(e.message));
  await assert.rejects(handleAction(s, { action: 'importAssets', assets: [{ id: 'EB-003', serial: 'A3' }, { id: 'EB-004', serial: 'a3' }] }), e => e.code === 'serial-exists');
  const v = await handleView(s, p({ view: 'fleet' }));
  assert.equal(v.assets.length, 1);
});

test('scanned bikes carry brand and model; scanner view has a lookup', async () => {
  const s = memStore();
  await handleAction(s, manifest);
  await handleAction(s, { action: 'saveAsset', isNew: true, asset: { id: 'EB-012', serial: 'S12', brand: 'Gazelle', model: 'Medeo T9' } });
  const r = await handleAction(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'bike01', code: 'eb-012' } });
  assert.equal(r.inRegister, true);
  assert.equal(r.view.groups[0].bikes[0].model, 'Medeo T9');
  assert.equal(r.view.groups[0].bikes[0].brand, 'Gazelle');
  const r2 = await handleAction(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'bike02', code: 'EB-404' } });
  assert.equal(r2.inRegister, false);
  assert.equal(r2.view.groups[0].bikes[1].model, undefined);
  const v = await handleView(s, p({ view: 'scanner' }));
  assert.deepEqual(v.bikeInfo['EB-012'], { brand: 'Gazelle', model: 'Medeo T9' });
  assert.equal(v.bikeInfo['EB-404'], undefined);
});

test('removing a bike keeps a trail and the bike can be reissued', async () => {
  const s = memStore();
  await handleAction(s, manifest);
  await handleAction(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'bike01', code: 'EB-001', ts: 100 } });
  let r = await handleAction(s, { action: 'removeBike', groupId: 'grpA1', bikeId: 'bike01', reason: 'swap', removedAt: 200 });
  const g = r.view.groups[0];
  assert.equal(g.bikes.length, 0);
  assert.deepEqual([g.removed[0].code, g.removed[0].reason, g.removed[0].ts, g.removed[0].removedAt], ['EB-001', 'swap', 100, 200]);
  // retry is harmless, unknown reason becomes 'other'
  r = await handleAction(s, { action: 'removeBike', groupId: 'grpA1', bikeId: 'bike01', reason: 'swap' });
  assert.equal(r.view.groups[0].removed.length, 1);
  // reissue to another group: no "also in" warning, and back into the same group is allowed too
  const r2 = await handleAction(s, { action: 'addBike', groupId: 'grpB1', bike: { id: 'bike02', code: 'EB-001' } });
  assert.equal(r2.alsoIn, undefined);
  // still out with Jones: refused (v3.8)
  await assert.rejects(handleAction(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'bike09', code: 'EB-001' } }), e => e.code === 'out-elsewhere');
  await handleAction(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'bike03', code: 'EB-005' } });
  await handleAction(s, { action: 'removeBike', groupId: 'grpA1', bikeId: 'bike03', reason: 'nonsense' });
  // clearing a group records every bike; deleting a group keeps it in the day for archives
  await handleAction(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'bike04', code: 'EB-004' } });
  r = await handleAction(s, { action: 'clearGroup', groupId: 'grpA1' });
  assert.deepEqual(r.view.groups[0].removed.map(x => x.reason), ['swap', 'other', 'cleared']);
  await handleAction(s, { action: 'deleteGroup', groupId: 'grpB1' });
  const b = await dump(s);
  assert.equal(b.day.deletedGroups[0].bikes[0].code, 'EB-001');
  const reset = await handleAction(s, { action: 'resetDay' });
  assert.equal(reset.archiveKey.startsWith('archive/'), true);
  assert.deepEqual((await dump(s)).day.deletedGroups, []);
});

test('issues need an odometer reading and can take updates', async () => {
  const s = memStore();
  const base = { id: 'iss100', bikeId: 'EB-001', issue: 'Brake rub', priority: 2, reportedBy: 'SO' };
  await assert.rejects(handleAction(s, { action: 'reportIssue', issue: base }), e => /Odometer/.test(e.message));
  let r = await handleAction(s, { action: 'reportIssue', issue: { ...base, odometer: '1,234 km' } });
  assert.equal(r.view.issues[0].odometer, 1234);
  // an update that raises the priority takes the bike out of service
  r = await handleAction(s, { action: 'updateIssue', id: 'iss100', update: { id: 'upd001', by: 'jb', text: 'Worse now, pads gone', priority: 5, odometer: 1250 } });
  const i = r.view.issues[0];
  assert.equal(i.priority, 5);
  assert.deepEqual([i.updates[0].by, i.updates[0].priorityFrom, i.updates[0].priorityTo, i.updates[0].odometer], ['JB', 2, 5, 1250]);
  const sc = await handleView(s, p({ view: 'scanner' }));
  assert.ok(sc.oos.includes('EB-001'));
  // retry is idempotent; text and initials are required
  r = await handleAction(s, { action: 'updateIssue', id: 'iss100', update: { id: 'upd001', by: 'jb', text: 'again' } });
  assert.equal(r.view.issues[0].updates.length, 1);
  await assert.rejects(handleAction(s, { action: 'updateIssue', id: 'iss100', update: { id: 'upd002', by: 'jb', text: '' } }), e => e.code === 'invalid');
  // resolved issues still take notes, but not priority changes
  await handleAction(s, { action: 'resolveIssue', id: 'iss100', resolution: 'New pads', repairedBy: 'Jo' });
  r = await handleAction(s, { action: 'updateIssue', id: 'iss100', update: { id: 'upd003', by: 'so', text: 'Rode it, all good' } });
  assert.equal(r.view.issues[0].updates.length, 2);
  await assert.rejects(handleAction(s, { action: 'updateIssue', id: 'iss100', update: { id: 'upd004', by: 'so', text: 'x', priority: 3 } }), e => e.code === 'resolved');
});

test('purchase price, disposal date and sale price', async () => {
  const s = memStore();
  const a = { id: 'EB-001', serial: 'S1', purchaseDate: '2023-09-01', purchasePrice: '$3,499.95' };
  let r = await handleAction(s, { action: 'saveAsset', isNew: true, asset: a });
  assert.equal(r.view.assets[0].purchasePrice, 3499.95);
  assert.equal(r.view.assets[0].salePrice, null);
  await assert.rejects(handleAction(s, { action: 'saveAsset', asset: { ...a, salePrice: 900 } }), e => /disposal date/.test(e.message));
  await assert.rejects(handleAction(s, { action: 'saveAsset', asset: { ...a, disposalDate: '2022-01-01' } }), e => /before the purchase/.test(e.message));
  r = await handleAction(s, { action: 'saveAsset', asset: { ...a, disposalDate: '2026-03-12', salePrice: '900', disposalNote: 'Sold to staff' } });
  assert.deepEqual([r.view.assets[0].disposalDate, r.view.assets[0].salePrice, r.view.assets[0].disposalNote], ['2026-03-12', 900, 'Sold to staff']);
  // a spreadsheet without the money columns leaves them alone
  r = await handleAction(s, { action: 'importAssets', assets: [{ id: 'EB-001', serial: 'S1', brand: 'Giant' }] });
  assert.deepEqual([r.view.assets[0].brand, r.view.assets[0].purchasePrice, r.view.assets[0].salePrice], ['Giant', 3499.95, 900]);
  // scanner learns the bike is disposed
  await handleAction(s, manifest);
  const add = await handleAction(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'bike01', code: 'EB-001' } });
  assert.equal(add.disposed, '2026-03-12');
  assert.equal(add.view.bikeInfo['EB-001'].disposed, '2026-03-12');
});

test('check-in: Returned needs every bike in, or a reason for each one that isn\'t', async () => {
  const s = memStore();
  await handleAction(s, manifest);
  for (const [bid, code] of [['bike01', 'EB-001'], ['bike02', 'EB-002'], ['bike03', 'EB-003']])
    await handleAction(s, { action: 'addBike', groupId: 'grpB1', bike: { id: bid, code } });
  await handleAction(s, { action: 'checkIn', groupId: 'grpB1', bikeId: 'bike01', at: 500 });
  await assert.rejects(handleAction(s, { action: 'setGroupStatus', groupId: 'grpB1', status: 'returned' }), e => e.code === 'not-checked-in');
  // a checked-in bike can go straight to another group without the "also in" warning; one still out can't
  let r = await handleAction(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'bike04', code: 'EB-001' } });
  assert.equal(r.alsoIn, undefined);
  await assert.rejects(handleAction(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'bike05', code: 'EB-002' } }), e => e.code === 'out-elsewhere');
  // untick and tick again
  await handleAction(s, { action: 'checkIn', groupId: 'grpB1', bikeId: 'bike02', in: true });
  r = await handleAction(s, { action: 'checkIn', groupId: 'grpB1', bikeId: 'bike02', in: false });
  assert.equal(r.view.groups[1].bikes[1].inAt, undefined);
  // 'other' needs a note
  await assert.rejects(handleAction(s, { action: 'setGroupStatus', groupId: 'grpB1', status: 'returned',
    exceptions: [{ bikeId: 'bike02', reason: 'collect' }, { bikeId: 'bike03', reason: 'other' }] }), e => /note/.test(e.message));
  r = await handleAction(s, { action: 'setGroupStatus', groupId: 'grpB1', status: 'returned', at: 900,
    exceptions: [{ bikeId: 'bike02', reason: 'collect', note: 'At Serafino' }, { bikeId: 'bike03', reason: 'damaged' }] });
  const g = r.view.groups[1];
  assert.equal(g.status, 'returned');
  assert.deepEqual(g.exceptions.map(e => [e.code, e.reason, e.note]), [['EB-002', 'collect', 'At Serafino'], ['EB-003', 'damaged', '']]);
  assert.equal(g.bikes[0].inAt, 500);
  // undo clears the exceptions
  r = await handleAction(s, { action: 'setGroupStatus', groupId: 'grpB1', status: '' });
  assert.deepEqual(r.view.groups[1].exceptions, []);
});

test('multi-day hires carry over with their bikes until the last day', async () => {
  const s = memStore();
  const day1 = { action: 'loadManifest', manifestDate: '2026-10-05', groups: [
    { id: 'grpMD1', name: 'Dare (x2)', code: 'RGXWM1C', hireDays: 2, special: 'Room 29' },
    { id: 'grpSD1', name: 'Weir (x2)', code: 'R0AUBPM' }],
    contacts: [{ code: 'RGXWM1C', name: 'S Dare', hireDays: 2 }, { code: 'R0AUBPM', name: 'R Weir' }] };
  let r = await handleAction(s, day1);
  assert.equal(r.carried, 0);
  assert.equal(r.view.groups[0].hireDays, 2);
  assert.equal(r.view.groups[0].special, 'Room 29');
  await handleAction(s, { action: 'addBike', groupId: 'grpMD1', bike: { id: 'bike01', code: 'EB-001' } });
  await handleAction(s, { action: 'addBike', groupId: 'grpMD1', bike: { id: 'bike02', code: 'EB-002' } });
  r = await handleAction(s, { action: 'setGroupStatus', groupId: 'grpMD1', status: 'overnight' });
  assert.equal(r.view.groups[0].status, 'overnight');
  // day 2: Rezdy doesn't list it, but it comes across with its bikes
  const day2 = { action: 'loadManifest', manifestDate: '2026-10-06', groups: [{ id: 'grpX1', name: 'Ferguson (x2)', code: 'RWW04GQ' }], contacts: [{ code: 'RWW04GQ', name: 'C F' }] };
  r = await handleAction(s, day2);
  assert.equal(r.carried, 1);
  assert.deepEqual(r.view.groups.map(g => g.name), ['Dare (x2)', 'Ferguson (x2)']);
  assert.equal(r.view.groups[0].bikes.length, 2);
  assert.equal(r.view.groups[0].status, 'out');
  const c = await handleView(s, p({ view: 'contacts' }));
  assert.deepEqual(c.contacts.map(x => [x.code, x.startDate]), [['RGXWM1C', '2026-10-05'], ['RWW04GQ', '2026-10-06']]);
  // last day: overnight refused; reloading the same day keeps it; the day after, it's overdue
  await assert.rejects(handleAction(s, { action: 'setGroupStatus', groupId: 'grpMD1', status: 'overnight' }), e => e.code === 'last-day');
  r = await handleAction(s, day2);
  assert.equal(r.carried, 1);
  assert.equal(r.overdue, 0);
  r = await handleAction(s, { ...day2, manifestDate: '2026-10-07' });
  assert.deepEqual([r.carried, r.overdue], [1, 1]);
  // hire length can be set by hand, not below the current day
  await handleAction(s, { ...day1, groups: [{ id: 'grpSD1', name: 'Weir (x2)', code: 'R0AUBPM' }] });
  r = await handleAction(s, { action: 'setHireDays', groupId: 'grpSD1', hireDays: 3 });
  assert.equal(r.view.groups[0].hireDays, 3);
  // a returned multi-day group isn't carried
  await handleAction(s, { action: 'setGroupStatus', groupId: 'grpSD1', status: 'returned' });
  r = await handleAction(s, { ...day2, manifestDate: '2026-10-06' });
  assert.equal(r.carried, 0);
});

test('locations: hand moves, scan-to-move, check-in moves, history, managing the list', async () => {
  const s = memStore();
  let r = await handleAction(s, { action: 'importAssets', assets: [{ id: 'EB-001', serial: 'S1', location: 'vic' }, { id: 'EB-002', serial: 'S2', location: 'Oxenberry Farm' }, { id: 'EB-003', serial: 'S3' }] });
  assert.deepEqual(r.view.assets.map(a => a.location), ['VIC', 'OXB', undefined]);
  assert.deepEqual(r.view.locations.map(l => l.code), ['VIC', 'OXB', 'BER', 'DOG', 'SRV', 'HUG', 'HAZ', 'HMD', 'DLN', 'HOM', 'TRA']);
  await assert.rejects(handleAction(s, { action: 'importAssets', assets: [{ id: 'EB-004', serial: 'S4', location: 'Mars' }] }), e => /Row 2/.test(e.message));
  // hand move needs initials; a new bike's first location doesn't
  await assert.rejects(handleAction(s, { action: 'saveAsset', originalId: 'EB-001', asset: { id: 'EB-001', serial: 'S1', location: 'HOM' } }), e => /initials/.test(e.message));
  r = await handleAction(s, { action: 'saveAsset', originalId: 'EB-001', asset: { id: 'EB-001', serial: 'S1', location: 'HOM' }, by: 'so' });
  assert.equal(r.view.assets[0].location, 'HOM');
  await handleAction(s, { action: 'saveAsset', isNew: true, asset: { id: 'EB-005', serial: 'S5', location: 'TRA' } });
  // a plain edit without location leaves it alone
  r = await handleAction(s, { action: 'saveAsset', originalId: 'EB-001', asset: { id: 'EB-001', serial: 'S1', brand: 'Giant' } });
  assert.equal(r.view.assets[0].location, 'HOM');
  // scan-to-move
  r = await handleAction(s, { action: 'moveAssets', location: 'TRA', by: 'jb', codes: ['eb-001', 'EB-005', 'EB-999'] });
  assert.deepEqual(r.results.map(x => x.result), ['moved', 'already-there', 'not-registered']);
  await assert.rejects(handleAction(s, { action: 'moveAssets', location: 'TRA', codes: ['EB-001'] }), e => /Initials/.test(e.message));
  // check-in moves the bike to the phone's location; out-with-group shows on the register meanwhile
  await handleAction(s, manifest);
  await handleAction(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'bike01', code: 'EB-002' } });
  let f = await handleView(s, p({ view: 'fleet' }));
  assert.equal(f.out['EB-002'], 'Smith (x2)');
  await handleAction(s, { action: 'checkIn', groupId: 'grpA1', bikeId: 'bike01', location: 'VIC' });
  f = await handleView(s, p({ view: 'fleet' }));
  assert.equal(f.assets.find(a => a.id === 'EB-002').location, 'VIC');
  assert.equal(f.out['EB-002'], undefined);
  // history, newest first
  const h = await handleView(s, p({ view: 'moves', bike: 'EB-002' }));
  assert.deepEqual(h.moves.map(m => [m.from, m.to, m.how, m.note]), [['OXB', 'VIC', 'check-in', 'Smith (x2)'], ['', 'OXB', 'import', '']]);
  const all = await handleView(s, p({ view: 'moves' }));
  assert.equal(all.moves.length, 6);
  assert.deepEqual(all.moves.find(m => m.how === 'scan').by, 'JB');
  // locations: add, rename, retire only when empty, restore
  r = await handleAction(s, { action: 'addLocation', code: 'mcl', name: 'McLaren Flat depot' });
  assert.equal(r.view.locations[11].code, 'MCL');
  await assert.rejects(handleAction(s, { action: 'addLocation', code: 'VIC', name: 'x' }), e => e.code === 'exists');
  await handleAction(s, { action: 'renameLocation', code: 'MCL', name: 'Flat depot' });
  await assert.rejects(handleAction(s, { action: 'retireLocation', code: 'TRA' }), e => e.code === 'in-use');
  r = await handleAction(s, { action: 'retireLocation', code: 'MCL' });
  assert.equal(r.view.locations[11].retired, true);
  await assert.rejects(handleAction(s, { action: 'moveAssets', location: 'MCL', by: 'so', codes: ['EB-001'] }), e => /retired/.test(e.message));
  const sc = await handleView(s, p({ view: 'scanner' }));
  assert.deepEqual(sc.locations.map(l => l.code), ['VIC', 'OXB', 'BER', 'DOG', 'SRV', 'HUG', 'HAZ', 'HMD', 'DLN', 'HOM', 'TRA']);
  await handleAction(s, { action: 'retireLocation', code: 'MCL', retired: false });
  const b = await dump(s);
  assert.equal(b.moves.moves.length, 6);
});

test('overdue groups carry over; checked-in bikes stay ticked; returned and empty groups do not', async () => {
  const s = memStore();
  await handleAction(s, { action: 'loadManifest', manifestDate: '2026-10-05', groups: [
    { id: 'grpL1', name: 'Late (x2)', code: 'RLATE' }, { id: 'grpD1', name: 'Done (x1)', code: 'RDONE' }, { id: 'grpN1', name: 'NoShow (x1)', code: 'RNONE' }],
    contacts: [{ code: 'RLATE', name: 'L' }, { code: 'RDONE', name: 'D' }, { code: 'RNONE', name: 'N' }] });
  await handleAction(s, { action: 'addBike', groupId: 'grpL1', bike: { id: 'bike01', code: 'EB-001' }, by: 'so' });
  await handleAction(s, { action: 'addBike', groupId: 'grpL1', bike: { id: 'bike02', code: 'EB-002' } });
  await handleAction(s, { action: 'checkIn', groupId: 'grpL1', bikeId: 'bike01', by: 'jb' });
  await handleAction(s, { action: 'addBike', groupId: 'grpD1', bike: { id: 'bike03', code: 'EB-003' } });
  await handleAction(s, { action: 'checkIn', groupId: 'grpD1', bikeId: 'bike03' });
  await handleAction(s, { action: 'setGroupStatus', groupId: 'grpD1', status: 'returned', by: 'jb' });
  let r = await handleAction(s, { action: 'loadManifest', manifestDate: '2026-10-06', groups: [{ id: 'grpT1', name: 'Today (x1)', code: 'RTODAY' }], contacts: [{ code: 'RTODAY', name: 'T' }] });
  assert.deepEqual([r.carried, r.overdue], [1, 1]);
  const g = r.view.groups[0];
  assert.equal(g.name, 'Late (x2)');
  assert.equal(g.startDate, '2026-10-05');
  assert.deepEqual(g.bikes.map(b => [b.code, !!b.inAt, b.by || '', b.inBy || '']), [['EB-001', true, 'SO', 'JB'], ['EB-002', false, '', '']]);
  const c = await handleView(s, p({ view: 'contacts' }));
  assert.deepEqual(c.contacts.map(x => x.code), ['RLATE', 'RTODAY']);
  // the previous day is readable, read-only, with its contacts and groups as they were
  let prev = await handleView(s, p({ view: 'previous' }));
  assert.equal(prev.found, true);
  assert.equal(prev.manifestDate, '2026-10-05');
  assert.deepEqual(prev.groups.map(x => [x.name, x.status, x.returnedBy || '']), [['Late (x2)', '', ''], ['Done (x1)', 'returned', 'JB'], ['NoShow (x1)', '', '']]);
  assert.equal(prev.contacts.length, 3);
  // reloading the same date doesn't make today the "previous" day
  await handleAction(s, { action: 'loadManifest', manifestDate: '2026-10-06', groups: [{ id: 'grpT1', name: 'Today (x1)', code: 'RTODAY' }], contacts: [] });
  prev = await handleView(s, p({ view: 'previous' }));
  assert.equal(prev.manifestDate, '2026-10-05');
});

test('names travel with scanner actions; the team list', async () => {
  const s = memStore();
  await handleAction(s, manifest);
  await handleAction(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'bike01', code: 'EB-001' }, by: 'so' });
  await handleAction(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'bike02', code: 'EB-002' }, by: 'so' });
  await handleAction(s, { action: 'removeBike', groupId: 'grpA1', bikeId: 'bike02', reason: 'swap', by: 'jb' });
  await handleAction(s, { action: 'saveAsset', isNew: true, asset: { id: 'EB-001', serial: 'S1', location: 'VIC' } });
  await handleAction(s, { action: 'checkIn', groupId: 'grpA1', bikeId: 'bike01', by: 'jb', location: 'OXB' });
  let r = await handleAction(s, { action: 'setGroupStatus', groupId: 'grpA1', status: 'returned', by: 'jb' });
  const g = r.view.groups[0];
  assert.deepEqual([g.bikes[0].by, g.bikes[0].inBy, g.removed[0].removedBy, g.returnedBy, g.statusBy], ['SO', 'JB', 'JB', 'JB', 'JB']);
  const h = await handleView(s, p({ view: 'moves', bike: 'EB-001' }));
  assert.equal(h.moves[0].by, 'JB');
  // team
  r = await handleAction(s, { action: 'addMember', member: { id: 'mem001', name: 'Shayne O\'Brien', initials: 'so' } });
  assert.deepEqual(r.view.members[0], { id: 'mem001', name: "Shayne O'Brien", initials: 'SO' });
  await assert.rejects(handleAction(s, { action: 'addMember', member: { id: 'mem002', name: 'Sam Ong', initials: 'SO' } }), e => e.code === 'exists');
  await assert.rejects(handleAction(s, { action: 'addMember', member: { id: 'mem002', name: 'Jo', initials: 'J2' } }), e => /letters/.test(e.message));
  await handleAction(s, { action: 'addMember', member: { id: 'mem002', name: 'Jo Bell', initials: 'JB' } });
  r = await handleAction(s, { action: 'updateMember', id: 'mem002', member: { name: 'Jo Bell', initials: 'JOB' } });
  assert.equal(r.view.members[0].initials, 'JOB');
  r = await handleAction(s, { action: 'retireMember', id: 'mem002' });
  assert.equal(r.view.members[0].retired, true);
  const t = await handleView(s, p({ view: 'team' }));
  assert.equal(t.members.length, 2);
});

test('M-checks: pass signs off, a hire makes the next one due, a fail logs an issue, history is kept', async () => {
  const s = memStore();
  await handleAction(s, { action: 'importAssets', assets: [{ id: 'EB-001', serial: 'S1', brand: 'Giant' }, { id: 'EB-002', serial: 'S2' }] });
  let sc = await handleView(s, p({ view: 'scanner' }));
  assert.deepEqual(sc.mcheckDue, ['EB-001', 'EB-002']);
  // sign-off needs initials
  await assert.rejects(handleAction(s, { action: 'mcheck', check: { id: 'chk001', bike: 'EB-001' } }), e => /Initials/.test(e.message));
  let r = await handleAction(s, { action: 'mcheck', check: { id: 'chk001', bike: 'eb-001', failed: [] }, by: 'jb' });
  assert.equal(r.result, 'pass');
  assert.deepEqual(r.view.mcheckDue, ['EB-002']);
  r = await handleAction(s, { action: 'mcheck', check: { id: 'chk001', bike: 'EB-001' }, by: 'jb' });
  assert.equal(r.result, 'already-saved');
  // issuing: a checked bike carries its check; an unchecked one is allowed but flagged
  await handleAction(s, manifest);
  r = await handleAction(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'bike01', code: 'EB-001' }, by: 'so' });
  assert.equal(r.mcheckDue, undefined);
  assert.equal(r.view.groups[0].bikes[0].mcheck.by, 'JB');
  assert.deepEqual(r.view.mcheckDue, ['EB-001', 'EB-002']); // now due again: it has been out since
  r = await handleAction(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'bike02', code: 'EB-002' } });
  assert.equal(r.mcheckDue, true);
  assert.equal(r.view.groups[0].bikes[1].mcheckDue, true);
  // scanned by mistake: the hire is undone, so EB-001's check stands again
  // (checked in first: since v3.8 a bike still out with one group is refused for another)
  await handleAction(s, { action: 'checkIn', groupId: 'grpA1', bikeId: 'bike01' });
  await handleAction(s, { action: 'addBike', groupId: 'grpB1', bike: { id: 'bike03', code: 'EB-001' } });
  sc = await handleView(s, p({ view: 'scanner' }));
  r = await handleAction(s, { action: 'removeBike', groupId: 'grpB1', bikeId: 'bike03', reason: 'mistake' });
  assert.ok(r.view.mcheckDue.includes('EB-001')); // still due from bike01's hire
  r = await handleAction(s, { action: 'removeBike', groupId: 'grpA1', bikeId: 'bike01', reason: 'mistake' });
  assert.ok(!r.view.mcheckDue.includes('EB-001')); // the only hire since its check was a mistake
  // a fail logs an issue, critical items default to P5 and take the bike out of service
  r = await handleAction(s, { action: 'mcheck', check: { id: 'chk002', bike: 'EB-002', failed: ['brakes', 'lights', 'nonsense'], note: 'Rear pads worn', odometer: '1,520', issueId: 'iss900' }, by: 'so' });
  assert.equal(r.result, 'fail');
  assert.ok(r.view.oos.includes('EB-002'));
  const iv = await handleView(s, p({ view: 'issues' }));
  const i = iv.issues.find(x => x.id === 'iss900');
  assert.deepEqual([i.priority, i.source, i.checkId, i.reportedBy, i.odometer], [5, 'mcheck', 'chk002', 'SO', 1520]);
  assert.match(i.issue, /Brakes, front and rear; Lights, bell and kickstand\. Rear pads worn/);
  // history: newest first, per bike and all; register summary
  let h = await handleView(s, p({ view: 'mchecks', bike: 'EB-002' }));
  assert.deepEqual(h.checks.map(c => [c.result, c.by, c.failed.join(','), c.issueId]), [['fail', 'SO', 'brakes,lights', 'iss900']]);
  h = await handleView(s, p({ view: 'mchecks' }));
  assert.equal(h.checks.length, 2);
  assert.equal(h.items.length, 10);
  const f = await handleView(s, p({ view: 'fleet' }));
  assert.deepEqual([f.mcheck['EB-001'].due, f.mcheck['EB-002'].due, f.mcheck['EB-002'].last.result], [false, true, 'fail']);
  const b = await dump(s);
  assert.equal(b.mchecks.checks.length, 2);
});

test('pickup manifest: hire location, product, agent and start time are kept on groups and contacts', async () => {
  const s = memStore();
  let r = await handleAction(s, { action: 'loadManifest', manifestDate: '2026-10-16', groups: [
    { id: 'grpV1', name: 'A (x2)', code: 'R1', site: 'vic', product: 'Full Day Hire - McLaren Vale Visitor Centre', ptime: '9:00 AM' },
    { id: 'grpD1', name: 'B (x2)', code: 'R2', site: 'DEL', product: 'Customised Deliver/Collection - One Day', agent: 'Karawathacottages' },
    { id: 'grpX1', name: 'C (x1)', code: 'R3', site: 'MARS' }],
    contacts: [{ code: 'R1', name: 'A', site: 'VIC', agent: 'GetYourGuide' }, { code: 'R2', name: 'B', site: 'DEL' }] });
  assert.deepEqual(r.view.groups.map(g => [g.site, g.ptime || '']), [['VIC', '9:00 AM'], ['HMD', ''], ['', '']]);
  assert.equal(r.view.groups[1].agent, 'Karawathacottages');
  const c = await handleView(s, p({ view: 'contacts' }));
  assert.deepEqual(c.contacts.map(x => [x.site, x.agent]), [['VIC', 'GetYourGuide'], ['HMD', '']]);
});

test('site checklists: default lists, every item answered, mandatory items, records by day, editing', async () => {
  const s = memStore();
  let v = await handleView(s, p({ view: 'sitechecks', date: '2026-10-22' }));
  assert.deepEqual(Object.keys(v.sites), ['VIC', 'OXB', 'BER', 'DOG', 'SRV', 'HUG', 'HAZ', 'HMD', 'DLN', 'HOM', 'TRA']);
  const close = v.sites.VIC.lists.close;
  assert.equal(close.length, 9);
  assert.deepEqual(close.filter(i => i.mandatory).map(i => i.key), ['i5', 'i9']);
  assert.equal(v.sites.VIC.close, null);
  const all = (done = true) => close.map(i => ({ key: i.key, done }));
  const rec = (items, id = 'chk001') => ({ action: 'siteCheck', record: { id, site: 'vic', kind: 'close', date: '2026-10-22', items }, by: 'jb' });
  await assert.rejects(handleAction(s, rec(all().slice(1))), e => /Answer every item/.test(e.message));
  await assert.rejects(handleAction(s, rec(all().map(a => a.key === 'i9' ? { ...a, done: false } : a))), e => e.code === 'mandatory');
  await assert.rejects(handleAction(s, { ...rec(all()), by: '' }), e => /Initials/.test(e.message));
  let r = await handleAction(s, rec(all().map(a => a.key === 'i8' ? { ...a, done: false, note: 'Jacket left, owner unknown' } : a)));
  assert.equal(r.result, 'signed-off');
  assert.deepEqual([r.record.by, r.record.problems, r.record.items[7].note], ['JB', 1, 'Jacket left, owner unknown']);
  r = await handleAction(s, rec(all()));
  assert.equal(r.result, 'already-saved');
  v = await handleView(s, p({ view: 'sitechecks', date: '2026-10-22' }));
  assert.equal(v.sites.VIC.close.by, 'JB');
  assert.equal(v.sites.VIC.open, null);
  assert.equal(v.sites.OXB.close, null);
  // edit OXB's opening list: new wording gets a new key, kept wording keeps its key
  const oxbOpen = v.sites.OXB.lists.open;
  r = await handleAction(s, { action: 'saveChecklist', site: 'OXB', kind: 'open', items: [{ label: oxbOpen[0].label }, { label: 'Gate unlocked at the farm entrance', mandatory: true }] });
  assert.deepEqual(r.lists.open.map(i => [i.key, i.mandatory]), [['i1', false], ['i12', true]]);
  assert.equal(r.lists.close.length, 9);
  v = await handleView(s, p({ view: 'sitechecks', date: '2026-10-22' }));
  assert.equal(v.sites.OXB.lists.open.length, 2);
  assert.equal(v.sites.VIC.lists.open.length, 12); // v3.1: VIC also checks the backup status
  const log = await handleView(s, p({ view: 'sitechecklog', site: 'VIC' }));
  assert.equal(log.records.length, 1);
  const b = await dump(s);
  assert.equal(b.siteChecks.records.length, 1);
});

test('walk-ins: location, start, 4 hours, contact now or later; site set later; "not required today"', async () => {
  const s = memStore();
  await handleAction(s, manifest);
  let r = await handleAction(s, { action: 'createGroup', groupId: 'grpW1', name: 'Walk-in Lee (x2)', site: 'oxb', startAt: 1000, ptime: '2:15 PM', hireLength: '4h' });
  let g = r.view.groups.find(x => x.id === 'grpW1');
  assert.deepEqual([g.site, g.ptime, g.hireLength, g.startAt, g.walkin, g.code], ['OXB', '2:15 PM', '4h', 1000, true, undefined]);
  let c = await handleView(s, p({ view: 'contacts' }));
  assert.equal(c.contacts.length, 1); // no contact yet
  // contact added later, with the phone check's findings
  r = await handleAction(s, { action: 'setGroupContact', groupId: 'grpW1', contact: { name: 'Sam Lee', phone: '+61411382221', phoneDisplay: '+61 411 382 221', phoneFrom: '0411 382 221', phoneNote: '+61 added' } });
  g = r.view.groups.find(x => x.id === 'grpW1');
  assert.deepEqual([g.contactName, g.contactPhone, g.code], ['Sam Lee', '+61 411 382 221', 'WALK-GRPW1']);
  c = await handleView(s, p({ view: 'contacts' }));
  const w = c.contacts.find(x => x.code === 'WALK-GRPW1');
  assert.deepEqual([w.site, w.ptime, w.phoneFrom, w.walkin, w.groupId], ['OXB', '2:15 PM', '0411 382 221', true, 'grpW1']);
  // created with a contact straight away; location set afterwards
  await handleAction(s, { action: 'createGroup', groupId: 'grpW2', name: 'Kim (x1)', contact: { name: 'Kim Park' } });
  r = await handleAction(s, { action: 'setGroupSite', groupId: 'grpW2', site: 'DEL' });
  assert.equal(r.view.groups.find(x => x.id === 'grpW2').site, 'HMD');
  c = await handleView(s, p({ view: 'contacts' }));
  assert.deepEqual(c.contacts.filter(x => x.walkin).map(x => [x.name, x.phone, x.site]), [['Sam Lee', '+61411382221', 'OXB'], ['Kim Park', '', 'HMD']]);
  await assert.rejects(handleAction(s, { action: 'setGroupSite', groupId: 'grpW2', site: 'HOM' }), e => e.code === 'invalid');
  // a walk-in with bikes still out carries over (overdue) with its contact
  await handleAction(s, { action: 'addBike', groupId: 'grpW1', bike: { id: 'bike01', code: 'EB-001' } });
  r = await handleAction(s, { ...manifest, manifestDate: '2026-10-07' });
  assert.ok(r.view.groups.some(x => x.id === 'grpW1'));
  c = await handleView(s, p({ view: 'contacts' }));
  assert.ok(c.contacts.some(x => x.code === 'WALK-GRPW1'));
  // site checklists: not required today
  await assert.rejects(handleAction(s, { action: 'siteCheck', record: { id: 'skp001', site: 'OXB', kind: 'skip', date: '2026-10-22' } }), e => /Initials/.test(e.message));
  r = await handleAction(s, { action: 'siteCheck', record: { id: 'skp001', site: 'oxb', kind: 'skip', date: '2026-10-22', note: 'No bookings' }, by: 'so' });
  assert.equal(r.result, 'not-required');
  const v = await handleView(s, p({ view: 'sitechecks', date: '2026-10-22' }));
  assert.deepEqual([v.sites.OXB.skip.by, v.sites.OXB.skip.note, v.sites.OXB.open, v.sites.VIC.skip], ['SO', 'No bookings', null, null]);
});

test('locations: an older list and day are upgraded; kinds and matching words; DEL becomes HMD', async () => {
  const s = memStore();
  // as stored by v2.8
  s.m.set('assets', { etag: 'x1', body: JSON.stringify({ rev: 3, assets: [], locations: [{ code: 'VIC', name: 'Visitor Centre' }, { code: 'OXB', name: 'Oxenberry' }, { code: 'HOM', name: 'Home' }, { code: 'TRA', name: 'Trailer' }, { code: 'MCL', name: 'Flat depot' }] }) });
  s.m.set('day', { etag: 'x2', body: JSON.stringify({ rev: 1, manifestDate: '2026-10-26', groups: [{ id: 'grpD1', name: 'Del (x1)', site: 'DEL', status: '', bikes: [] }], contacts: [{ code: 'R1', name: 'D', site: 'DEL' }] }) });
  const f = await handleView(s, p({ view: 'fleet' }));
  const byCode = Object.fromEntries(f.locations.map(l => [l.code, l]));
  assert.deepEqual([byCode.OXB.name, byCode.OXB.kind, byCode.OXB.match], ['Oxenberry', 'hire', ['oxenberry']]); // the name edit is kept
  assert.deepEqual([byCode.BER.kind, byCode.HMD.kind, byCode.DLN.kind, byCode.HOM.kind, byCode.MCL.kind], ['hire', 'delivery', 'collection', 'storage', 'storage']);
  const sc = await handleView(s, p({ view: 'scanner' }));
  assert.equal(sc.groups[0].site, 'HMD');
  const c = await handleView(s, p({ view: 'contacts' }));
  assert.equal(c.contacts[0].site, 'HMD');
  assert.ok(c.locations.some(l => l.code === 'BER' && l.kind === 'hire'));
  // edit words and kind; add a new hire site with words
  let r = await handleAction(s, { action: 'updateLocation', code: 'BER', name: 'Beresford Estate', match: 'Beresford, beresford estate,  x' });
  const ber = r.view.locations.find(l => l.code === 'BER');
  assert.deepEqual([ber.name, ber.match], ['Beresford Estate', ['beresford', 'beresford estate']]);
  r = await handleAction(s, { action: 'addLocation', code: 'kay', name: 'Kay Brothers', kind: 'hire', match: ['kay brothers'] });
  assert.deepEqual(r.view.locations.find(l => l.code === 'KAY').kind, 'hire');
  r = await handleAction(s, { action: 'updateLocation', code: 'MCL', kind: 'nonsense' });
  assert.equal(r.view.locations.find(l => l.code === 'MCL').kind, 'storage');
  // a manifest site must be on the list and be a hire site or delivery
  await handleAction(s, { action: 'loadManifest', manifestDate: '2026-10-27', groups: [{ id: 'grpB1', name: 'Fitz (x2)', site: 'BER' }, { id: 'grpX1', name: 'X (x1)', site: 'DLN' }], contacts: [] });
  const v = await handleView(s, p({ view: 'scanner' }));
  assert.deepEqual(v.groups.filter(g => g.id !== 'grpD1').map(g => g.site), ['BER', '']);
  await assert.rejects(handleAction(s, { action: 'setGroupSite', groupId: 'grpX1', site: 'TRA' }), e => e.code === 'invalid');
  await handleAction(s, { action: 'setGroupSite', groupId: 'grpX1', site: 'KAY' });
});

test('dropped at Dandelion: bikes checked in there, group closed, bikes moved', async () => {
  const s = memStore();
  await handleAction(s, { action: 'importAssets', assets: [{ id: 'EB-001', serial: 'S1', location: 'VIC' }, { id: 'EB-002', serial: 'S2', location: 'VIC' }] });
  await handleAction(s, manifest);
  await handleAction(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'bike01', code: 'EB-001' } });
  await handleAction(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'bike02', code: 'EB-002' } });
  await handleAction(s, { action: 'checkIn', groupId: 'grpA1', bikeId: 'bike01', location: 'VIC' });
  await assert.rejects(handleAction(s, { action: 'dropOff', groupId: 'grpA1', location: 'VIC' }), e => /collection point/.test(e.message));
  const r = await handleAction(s, { action: 'dropOff', groupId: 'grpA1', location: 'DLN', by: 'jb' });
  const g = r.view.groups[0];
  assert.deepEqual([g.status, g.droppedAt, g.returnedBy, g.bikes[1].droppedAt, !!g.bikes[1].inAt, g.bikes[0].droppedAt], ['returned', 'DLN', 'JB', 'DLN', true, undefined]);
  const f = await handleView(s, p({ view: 'fleet' }));
  assert.deepEqual(f.assets.map(a => a.location), ['VIC', 'DLN']);
  const h = await handleView(s, p({ view: 'moves', bike: 'EB-002' }));
  assert.deepEqual([h.moves[0].to, h.moves[0].how, h.moves[0].by], ['DLN', 'drop-off', 'JB']);
});

test('QR links: starting list, editing, https only', async () => {
  const s = memStore();
  let v = await handleView(s, p({ view: 'qr' }));
  assert.deepEqual(v.links.map(l => l.label), ['SA eBikes Ride Guide', 'SA eBikes Online Waiver', 'SA eBikes Google Review']);
  await assert.rejects(handleAction(s, { action: 'saveQrLinks', links: [{ label: 'Bad', url: 'http://x.com' }] }), e => /https/.test(e.message));
  await assert.rejects(handleAction(s, { action: 'saveQrLinks', links: [] }), e => /at least one/.test(e.message));
  const r = await handleAction(s, { action: 'saveQrLinks', links: [...v.links, { label: 'Wine trail map', url: 'https://example.com/map' }] });
  assert.equal(r.links.length, 4);
  v = await handleView(s, p({ view: 'qr' }));
  assert.equal(v.links[3].id, 'q4');
});

test('daily summary saved when the next day is loaded; rebuild from archives; dashboard data', async () => {
  const s = memStore();
  await handleAction(s, { action: 'importAssets', assets: [
    { id: 'EB-001', serial: 'S1', model: 'T3' }, { id: 'EB-002', serial: 'S2', model: 'T3' }, { id: 'EB-003', serial: 'S3', model: 'Brando' }, { id: 'EB-004', serial: 'S4', model: 'Trike' }] });
  await handleAction(s, { action: 'reportIssue', issue: { id: 'iss001', bikeId: 'EB-004', issue: 'Brakes', priority: 5, reportedBy: 'SO', odometerUnreadable: true } });
  await handleAction(s, { action: 'loadManifest', manifestDate: '2026-10-25', groups: [{ id: 'grpA1', name: 'A (x2)', code: 'R1', site: 'VIC' }, { id: 'grpB1', name: 'B (x1)', code: 'R2', site: 'BER' }, { id: 'grpN1', name: 'No show (x1)', code: 'R3', site: 'VIC' }], contacts: [] });
  await handleAction(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'bike01', code: 'EB-001' } });
  await handleAction(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'bike02', code: 'EB-002' } });
  await handleAction(s, { action: 'addBike', groupId: 'grpB1', bike: { id: 'bike03', code: 'EB-003' } });
  await handleAction(s, { action: 'createGroup', groupId: 'grpW1', name: 'Walk (x1)', site: 'OXB' });
  // dashboard shows today live before anything is saved
  let d = await handleView(s, p({ view: 'dashboard' }));
  assert.equal(d.days['2026-10-25'].live, true);
  assert.equal(d.days['2026-10-25'].bikes, 3);
  await handleAction(s, { action: 'loadManifest', manifestDate: '2026-10-26', groups: [{ id: 'grpC1', name: 'C (x1)', code: 'R9', site: 'VIC' }], contacts: [] });
  d = await handleView(s, p({ view: 'dashboard' }));
  const y = d.days['2026-10-25'];
  assert.deepEqual([y.bookings, y.walkins, y.bikes, y.bySite, y.hired.sort(), y.oos], [2, 0, 3, { VIC: 2, BER: 1 }, ['EB-001', 'EB-002', 'EB-003'], 1]);
  assert.deepEqual(y.models.T3, { fleet: 2, available: 2, out: 2 });
  // v3.6: capacity comes from the fleet record. The trike's P5 was logged after 8 am that day
  // (the test runs later than 25 Oct), so it was available then, whatever its state is now.
  assert.deepEqual(y.models.Trike, { fleet: 1, available: 1, out: 0 });
  assert.equal(y.fleetRecords, true);
  assert.equal(y.live, undefined);
  // today: the overdue groups carried over are still out, but nothing new has been hired
  assert.deepEqual([d.days['2026-10-26'].bikes, d.days['2026-10-26'].bikesOut, d.days['2026-10-26'].live], [0, 3, true]);
  assert.equal(d.workshop['EB-004'].length, 1);
  assert.equal(d.assets.length, 4);
  // reloading the same date doesn't save over the previous day's summary
  await handleAction(s, { action: 'loadManifest', manifestDate: '2026-10-26', groups: [{ id: 'grpC1', name: 'C (x1)', code: 'R9' }], contacts: [] });
  // rebuild from archives
  s.m.delete('daily-stats');
  const r = await handleAction(s, { action: 'rebuildDaily' });
  assert.equal(r.days, 2); // the 25th, and the 26th as archived when it was reloaded
  d = await handleView(s, p({ view: 'dashboard' }));
  assert.equal(d.days['2026-10-25'].bikes, 3);
  assert.equal(d.days['2026-10-25'].rebuilt, true);
});

test('no bookings today: an empty manifest loads only when asked for, and still archives and carries over', async () => {
  const s = memStore();
  await handleAction(s, manifest);
  await assert.rejects(handleAction(s, { action: 'loadManifest', manifestDate: '2026-10-07', groups: [], contacts: [] }), e => /no groups/.test(e.message));
  await handleAction(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'bike01', code: 'EB-001' } });
  const r = await handleAction(s, { action: 'loadManifest', manifestDate: '2026-10-07', manifestDateDisplay: 'Wed 7 Oct', groups: [], contacts: [], empty: true });
  assert.ok(r.archiveKey);
  assert.equal(r.view.manifestDate, '2026-10-07');
  assert.deepEqual(r.view.groups.map(g => g.id), ['grpA1']); // overdue, carried over
  const d = await handleView(s, p({ view: 'dashboard' }));
  assert.equal(d.days['2026-10-06'].bikes, 1); // yesterday's summary saved
});

test('lost property: add with photo, notes, edit, close, reopen; photos kept apart', async () => {
  const s = memStore();
  const photo = 'data:image/jpeg;base64,' + 'A'.repeat(1000);
  await assert.rejects(handleAction(s, { action: 'lostAdd', item: { id: 'lost01', foundDate: '2026-10-31' }, by: 'jb' }), e => /Description/.test(e.message));
  await assert.rejects(handleAction(s, { action: 'lostAdd', item: { id: 'lost01', description: 'Hat', foundDate: '2026-10-31' }, photo: 'data:text/html;base64,AAAA' }), e => /photo/.test(e.message));
  let r = await handleAction(s, { action: 'lostAdd', by: 'jb', photo, item: { id: 'lost01', description: 'Black jacket, size M', foundDate: '2026-10-31', foundSite: 'dln',
    foundNote: 'Tasting room', storedAt: 'VIC', storedNote: 'Lost property box', groupName: 'Smith (x2)', orderCode: 'R1', guestName: 'Ann Smith',
    guestPhone: '+61411382221', phoneDisplay: '+61 411 382 221' } });
  let i = r.view.items[0];
  assert.deepEqual([i.foundSite, i.foundBy, i.status, i.hasPhoto, i.phoneDisplay, i.photo], ['DLN', 'JB', 'open', true, '+61 411 382 221', undefined]);
  const ph = await handleView(s, p({ view: 'lostphoto', id: 'lost01' }));
  assert.equal(ph.photo, photo);
  r = await handleAction(s, { action: 'lostNote', id: 'lost01', noteId: 'note01', text: 'Called, no answer', by: 'so' });
  r = await handleAction(s, { action: 'lostNote', id: 'lost01', noteId: 'note01', text: 'Called, no answer', by: 'so' });
  assert.equal(r.view.items[0].log.length, 1);
  r = await handleAction(s, { action: 'lostEdit', id: 'lost01', fields: { storedAt: 'hom', storedNote: 'Office shelf' } });
  assert.deepEqual([r.view.items[0].storedAt, r.view.items[0].storedNote], ['HOM', 'Office shelf']);
  await assert.rejects(handleAction(s, { action: 'lostClose', id: 'lost01', outcome: 'other', closedDate: '2026-11-03' }), e => /note/.test(e.message));
  await assert.rejects(handleAction(s, { action: 'lostClose', id: 'lost01', outcome: 'lost', closedDate: '2026-11-03' }), e => e.code === 'invalid');
  r = await handleAction(s, { action: 'lostClose', id: 'lost01', outcome: 'returned', closedDate: '2026-11-03', note: 'Collected by owner', by: 'jb' });
  i = r.view.items[0];
  assert.deepEqual([i.status, i.outcome, i.closedDate, i.closedBy], ['closed', 'returned', '2026-11-03', 'JB']);
  r = await handleAction(s, { action: 'lostReopen', id: 'lost01', by: 'so' });
  assert.equal(r.view.items[0].status, 'open');
  assert.equal(r.view.items[0].log.slice(-1)[0].text, 'Reopened');
  const b = await dump(s);
  assert.equal(b.lostProperty.photos.lost01, photo);
});

test('guest messages: templates, logged as opened then sent or not sent; latest shown on the group', async () => {
  const s = memStore();
  let v = await handleView(s, p({ view: 'messages' }));
  assert.deepEqual(v.templates.map(t => t.id), ['late-pickup', 'late-return', 'weather']);
  assert.ok(!/battery/.test(v.templates[1].text));
  assert.ok(v.templates[2].text.includes('{weather}'));
  const r0 = await handleAction(s, { action: 'saveMessages', templates: [...v.templates, { label: 'Thanks for riding', text: 'Thanks {first}!' }] });
  assert.equal(r0.templates[3].id, 'm4');
  await handleAction(s, manifest);
  await assert.rejects(handleAction(s, { action: 'logMessage', code: 'NOPE', entry: { id: 'msg001', label: 'Late returning' } }), e => e.code === 'not-found');
  let r = await handleAction(s, { action: 'logMessage', code: 'R1', entry: { id: 'msg001', template: 'late-return', label: 'Late returning', channel: 'whatsapp', at: 1000 }, by: 'jb' });
  assert.deepEqual(r.view.contactInfo.R1.last, { label: 'Late returning', status: 'opened', at: 1000, by: 'JB' });
  await assert.rejects(handleAction(s, { action: 'updateMessage', code: 'R1', id: 'msg001', status: 'maybe' }), e => e.code === 'invalid');
  r = await handleAction(s, { action: 'updateMessage', code: 'R1', id: 'msg001', status: 'not-sent', reason: 'No signal', by: 'jb' });
  assert.equal(r.view.contactInfo.R1.last.status, 'not-sent');
  const c = await handleView(s, p({ view: 'contacts' }));
  const m = c.contacts[0].messages[0];
  assert.deepEqual([m.channel, m.status, m.reason, m.by], ['whatsapp', 'not-sent', 'No signal', 'JB']);
});
