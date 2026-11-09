// v3.3: retries never duplicate, half-finished saves heal on retry, "already done" counts as done,
// stale edits are refused instead of overwriting, and late destructive scanner changes are refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import { memStore } from './memstore.mjs';
import { handleAction, handleView } from '../netlify/lib/ops-core.mjs';

const p = o => new URLSearchParams(o);
const act = (s, body) => handleAction(s, { by: 'SO', ...body });
async function dayWithBike() {
  const s = memStore();
  await act(s, { action: 'saveAsset', isNew: true, asset: { id: 'EB-012', serial: 'S12', brand: 'Gazelle', model: 'T3', purchaseDate: '2024-01-01' } });
  await act(s, { action: 'saveAsset', isNew: true, asset: { id: 'EB-013', serial: 'S13', brand: 'Gazelle', model: 'T3', purchaseDate: '2024-01-01' } });
  await act(s, { action: 'loadManifest', manifestDate: '2026-11-02', manifestDateDisplay: '2 Nov', loadId: 'load-a', groups: [{ id: 'grpA1', name: 'Smith (x2)' }, { id: 'grpB1', name: 'Jones (x1)' }], contacts: [] });
  return s;
}
// Makes the first write to `key` fail, as if the function stopped there; later writes work.
function failFirstWrite(store, key) {
  let done = false;
  store.failWhen = (op, k) => { if (!done && op === 'set' && k === key) { done = true; return true; } return false; };
}

test('a scan retried after a half-finished first attempt still records the hire for the M-check rule', async () => {
  const s = await dayWithBike();
  failFirstWrite(s, 'mcheck-status');
  const scan = { action: 'addBike', groupId: 'grpA1', bike: { id: 'scan0001', code: 'EB-012', ts: 1000 } };
  await assert.rejects(act(s, scan));
  assert.ok(!(await s.get('mcheck-status')), 'first attempt saved the scan but not the hire');
  const r = await act(s, scan);
  assert.equal(r.result, 'already-saved');
  assert.equal((await s.get('mcheck-status')).bikes['EB-012'].lastHire.entryId, 'scan0001');
  assert.equal((await s.get('day')).groups[0].bikes.length, 1, 'no duplicate scan');
});

test('a Dandelion drop-off retried after a half-finished first attempt finishes the moves', async () => {
  const s = await dayWithBike();
  await act(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'scan0001', code: 'EB-012', ts: 1000 } });
  await act(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'scan0002', code: 'EB-013', ts: 1001 } });
  failFirstWrite(s, 'assets');
  await act(s, { action: 'dropOff', groupId: 'grpA1', location: 'DLN' }).catch(() => {});
  assert.notEqual((await s.get('assets')).assets.find(a => a.id === 'EB-012').location, 'DLN', 'first attempt stopped before the moves');
  const r = await act(s, { action: 'dropOff', groupId: 'grpA1', location: 'DLN' });
  assert.equal(r.result, 'already-saved');
  const assets = (await s.get('assets')).assets;
  assert.deepEqual(assets.map(a => a.location), ['DLN', 'DLN']);
  // And a third time logs no extra moves.
  const moves = (await s.get('moves')).moves.length;
  await act(s, { action: 'dropOff', groupId: 'grpA1', location: 'DLN' });
  assert.equal((await s.get('moves')).moves.length, moves);
});

test('lost property: the photo is saved before the item, retries never duplicate, close and reopen are safe to repeat', async () => {
  const s = memStore();
  const add = { action: 'lostAdd', photo: 'data:image/jpeg;base64,' + 'A'.repeat(200), item: { id: 'lost0001', description: 'Blue hat', foundDate: '2026-11-02', foundSite: 'VIC', storedAt: 'VIC' } };
  failFirstWrite(s, 'lost-property');
  await assert.rejects(act(s, add));
  assert.ok(s.m.has('lost-photo/lost0001'), 'photo saved first');
  assert.ok(!(await s.get('lost-property')), 'no item yet, so nothing claims a photo that is missing');
  assert.equal((await act(s, add)).result, 'added');
  assert.equal((await act(s, add)).result, 'already-saved');
  const items = (await s.get('lost-property')).items;
  assert.equal(items.length, 1);
  assert.equal(items[0].hasPhoto, true);
  await act(s, { action: 'lostClose', id: 'lost0001', outcome: 'donated', closedDate: '2026-11-02' });
  assert.equal((await act(s, { action: 'lostClose', id: 'lost0001', outcome: 'donated', closedDate: '2026-11-02' })).result, 'already-saved');
  await act(s, { action: 'lostReopen', id: 'lost0001' });
  assert.equal((await act(s, { action: 'lostReopen', id: 'lost0001' })).result, 'already-saved');
  assert.equal((await s.get('lost-property')).items[0].log.filter(l => l.text === 'Reopened').length, 1, 'one "Reopened" note');
});

test('lost property edits: a stale form is refused, not overwritten', async () => {
  const s = memStore();
  await act(s, { action: 'lostAdd', item: { id: 'lost0001', description: 'Blue hat', foundDate: '2026-11-02', foundSite: 'VIC', storedAt: 'VIC' } });
  await act(s, { action: 'lostEdit', id: 'lost0001', baseV: 1, fields: { storedAt: 'HOM' } });
  await assert.rejects(act(s, { action: 'lostEdit', id: 'lost0001', baseV: 1, fields: { description: 'Red hat' } }), e => e.code === 'changed');
  assert.equal((await s.get('lost-property')).items[0].description, 'Blue hat');
});

test('two phones resolving the same issue: both succeed, the second is told who did it', async () => {
  const s = memStore();
  await act(s, { action: 'reportIssue', issue: { id: 'iss00001', bikeId: 'EB-012', issue: 'Squeak', priority: 2, reportedBy: 'SO', odometer: 10 } });
  const [a, b] = await Promise.all([
    act(s, { action: 'resolveIssue', id: 'iss00001', resolution: 'Oiled', repairedBy: 'JB' }),
    act(s, { action: 'resolveIssue', id: 'iss00001', resolution: 'Oiled chain', repairedBy: 'TR' }),
  ]);
  const results = [a.result, b.result].sort();
  assert.deepEqual(results, ['already-resolved', 'resolved']);
  assert.ok([a, b].find(x => x.result === 'already-resolved').resolvedBy);
});

test('bikes: re-adding the same bike is fine; an edit from a form opened before a change or a move is refused', async () => {
  const s = await dayWithBike();
  const a = (await s.get('assets')).assets.find(x => x.id === 'EB-012');
  assert.equal(a.v, 1);
  // Someone moves the bike while another person has its edit form open at version 1.
  await act(s, { action: 'moveAssets', codes: ['EB-012'], location: 'OXB' });
  await assert.rejects(act(s, { action: 'saveAsset', asset: { id: 'EB-012', serial: 'S12', brand: 'Gazelle', model: 'T4', purchaseDate: '2024-01-01', location: 'VIC' }, baseV: 1 }),
    e => e.code === 'changed' && /changed or moved/.test(e.message));
  assert.equal((await s.get('assets')).assets.find(x => x.id === 'EB-012').location, 'OXB', 'the move stands');
  const v = (await s.get('assets')).assets.find(x => x.id === 'EB-012').v;
  const r = await act(s, { action: 'saveAsset', asset: { id: 'EB-012', serial: 'S12', brand: 'Gazelle', model: 'T4', purchaseDate: '2024-01-01' }, baseV: v });
  assert.equal(r.result, 'updated');
});

test('locations, contacts and checklists: stale edits refused', async () => {
  const s = await dayWithBike();
  await act(s, { action: 'updateLocation', code: 'OXB', baseV: 0, match: ['oxenberry', 'oxenberry farm'] });
  await assert.rejects(act(s, { action: 'updateLocation', code: 'OXB', baseV: 0, match: ['oxen'] }), e => e.code === 'changed');
  await act(s, { action: 'setGroupContact', groupId: 'grpB1', contact: { name: 'Pat Jones', phone: '0400000001' } });
  await act(s, { action: 'setGroupContact', groupId: 'grpB1', baseV: 1, contact: { name: 'Pat Jones', phone: '0400000002' } });
  await assert.rejects(act(s, { action: 'setGroupContact', groupId: 'grpB1', baseV: 1, contact: { name: 'P Jones', phone: '0400000003' } }), e => e.code === 'changed');
  const items = [{ label: 'Unlock the shed' }, { label: 'Count helmets', mandatory: true }];
  await act(s, { action: 'saveChecklist', site: 'OXB', kind: 'open', items, baseV: 0 });
  assert.equal((await act(s, { action: 'saveChecklist', site: 'OXB', kind: 'open', items, baseV: 0 })).result, 'already-saved', 'a retry');
  await assert.rejects(act(s, { action: 'saveChecklist', site: 'OXB', kind: 'open', items: [{ label: 'Different' }], baseV: 0 }), e => e.code === 'changed');
});

test('loading a manifest: a retried load changes nothing; under contention the previous day is archived once', async () => {
  const s = await dayWithBike();
  await act(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'scan0001', code: 'EB-012', ts: 1000 } });
  const load = { action: 'loadManifest', manifestDate: '2026-11-03', manifestDateDisplay: '3 Nov', loadId: 'load-b', groups: [{ id: 'grpC1', name: 'Brown (x2)' }], contacts: [] };
  // The first write of the day file is beaten by another phone: the load is retried internally.
  const realSet = s.setJSON;
  let beaten = false;
  s.setJSON = async (k, d, o) => { if (k === 'day' && !beaten) { beaten = true; return { modified: false }; } return realSet(k, d, o); };
  await act(s, load);
  s.setJSON = realSet;
  const archives = [...s.m.keys()].filter(k => k.startsWith('archive/2026-11-02/'));
  assert.equal(archives.length, 1, 'one archive of the previous day, not two');
  await act(s, { action: 'addBike', groupId: 'grpC1', bike: { id: 'scan0002', code: 'EB-013', ts: 2000 } });
  assert.equal((await act(s, load)).result, 'already-saved');
  assert.equal((await s.get('day')).groups[0].bikes.length, 1, 'the scan made after the load is kept');
});

test('Delete group, Clear all and Reset day are refused if a new day has been loaded since', async () => {
  const s = await dayWithBike();
  await act(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'scan0001', code: 'EB-012', ts: 1000 } });
  for (const a of [{ action: 'deleteGroup', groupId: 'grpA1' }, { action: 'clearGroup', groupId: 'grpA1' }, { action: 'resetDay' }]) {
    await assert.rejects(act(s, { ...a, dayOf: '2026-11-01' }), e => e.code === 'day-changed', a.action);
  }
  assert.equal((await s.get('day')).groups.length, 2, 'nothing changed');
  await act(s, { action: 'clearGroup', groupId: 'grpA1', dayOf: '2026-11-02' });
  assert.equal((await s.get('day')).groups[0].bikes.length, 0, 'same day: applied');
  await act(s, { action: 'clearGroup', groupId: 'grpB1' }); // no dayOf (an older phone): applied as before
});

test('v3.5: each group keeps its booked bike count and equipment, for issuing', async () => {
  const s = memStore();
  await act(s, { action: 'loadManifest', manifestDate: '2026-11-04', manifestDateDisplay: '4 Nov', loadId: 'load-q', contacts: [],
    groups: [{ id: 'grpQ1', name: 'Smith (x2)', qty: 2, equip: ['1× Child Seat'] }, { id: 'grpQ2', name: 'Walk-in Lee' }] });
  const [a, b] = (await s.get('day')).groups;
  assert.equal(a.qty, 2);
  assert.deepEqual(a.equip, ['1× Child Seat']);
  assert.equal(b.qty, 0);
  assert.deepEqual(b.equip, []);
});
