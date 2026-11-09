// v3.9: Undo (within 10 seconds, no reason) and corrections (initials and a reason, original kept).
import test from 'node:test';
import assert from 'node:assert/strict';
import { memStore } from './memstore.mjs';
import { handleAction, handleView } from '../netlify/lib/ops-core.mjs';
import { repeatFaults } from '../netlify/lib/maint-core.mjs';

const p = o => new URLSearchParams(o);
const act = (s, body) => handleAction(s, { by: 'SO', ...body });
async function setup() {
  const s = memStore();
  await act(s, { action: 'importAssets', assets: ['EB-001', 'EB-002', 'EB-003'].map(id => ({ id, serial: 'S' + id, brand: 'Gazelle', model: 'T3', location: 'VIC' })) });
  await act(s, { action: 'loadManifest', manifestDate: '2026-11-01', manifestDateDisplay: '1 Nov', loadId: 'load0001', groups: [{ id: 'grpA1', name: 'Smith (x2)', site: 'VIC' }, { id: 'grpB1', name: 'Jones (x1)', site: 'VIC' }], contacts: [] });
  await act(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'bike01', code: 'EB-001' } });
  await act(s, { action: 'addBike', groupId: 'grpA1', bike: { id: 'bike02', code: 'EB-002' } });
  return s;
}
const day = async s => s.get('day');
const loc = async (s, id) => (await s.get('assets')).assets.find(a => a.id === id).location;

test('undo a bike added: taken off as "undone", and its M-check still stands', async () => {
  const s = await setup();
  await act(s, { action: 'mcheck', check: { id: 'chk0001', bike: 'EB-003', failed: [] } });
  await act(s, { action: 'addBike', groupId: 'grpB1', bike: { id: 'bike03', code: 'EB-003', ts: Date.now() + 1000 } });
  let v = await handleView(s, p({ view: 'scanner' }));
  assert.ok(v.mcheckDue.includes('EB-003'), 'hired: due again');
  await act(s, { action: 'removeBike', groupId: 'grpB1', bikeId: 'bike03', reason: 'undone' });
  v = await handleView(s, p({ view: 'scanner' }));
  assert.ok(!v.mcheckDue.includes('EB-003'), 'undone: the check stands');
  assert.equal((await day(s)).groups.find(g => g.id === 'grpB1').removed[0].reason, 'undone');
});

test('a check-in undone or corrected: unticked, in the trail, and the bike moved back', async () => {
  const s = await setup();
  await act(s, { action: 'checkIn', groupId: 'grpA1', bikeId: 'bike01', location: 'OXB' });
  assert.equal(await loc(s, 'EB-001'), 'OXB');
  await act(s, { action: 'checkIn', groupId: 'grpA1', bikeId: 'bike01', in: false, undo: true });
  assert.equal(await loc(s, 'EB-001'), 'VIC', 'back where it was');
  await act(s, { action: 'checkIn', groupId: 'grpA1', bikeId: 'bike02', location: 'OXB' });
  await act(s, { action: 'checkIn', groupId: 'grpA1', bikeId: 'bike02', in: false, reason: 'ticked the wrong bike' });
  const d = await day(s);
  assert.deepEqual(d.corrections.map(c => [c.kind, c.code, c.undo, c.reason]), [['check-in', 'EB-001', true, ''], ['check-in', 'EB-002', false, 'ticked the wrong bike']]);
  assert.ok(!d.groups[0].bikes.some(b => b.inAt));
  const v = await handleView(s, p({ view: 'scanner' }));
  assert.equal(v.corrections.length, 2, 'the trail goes to the phones');
});

test('a drop-off undone: bikes unticked and moved back, group as it was, once only', async () => {
  const s = await setup();
  await act(s, { action: 'setGroupStatus', groupId: 'grpA1', status: 'out' });
  await act(s, { action: 'dropOff', groupId: 'grpA1', location: 'DLN', at: Date.now() });
  assert.equal(await loc(s, 'EB-001'), 'DLN');
  await assert.rejects(act(s, { action: 'undoDropOff', groupId: 'grpA1' }), /reason/);
  await act(s, { action: 'undoDropOff', groupId: 'grpA1', reason: 'they came back to the VIC' });
  const g = (await day(s)).groups.find(x => x.id === 'grpA1');
  assert.equal(g.status, 'out');
  assert.ok(!g.bikes.some(b => b.inAt || b.droppedAt));
  assert.equal(await loc(s, 'EB-001'), 'VIC');
  const r = await act(s, { action: 'undoDropOff', groupId: 'grpA1', reason: 'again' });
  assert.equal(r.result, 'already-saved');
});

test('setting Out can be undone, and the trail says so', async () => {
  const s = await setup();
  await act(s, { action: 'setGroupStatus', groupId: 'grpA1', status: 'out' });
  await act(s, { action: 'setGroupStatus', groupId: 'grpA1', status: '', undo: true });
  const d = await day(s);
  assert.equal(d.groups[0].status, '');
  assert.deepEqual([d.corrections[0].kind, d.corrections[0].from, d.corrections[0].to], ['status', 'out', '']);
});

test('a deleted group restored, except bikes that have since gone out with another group', async () => {
  const s = await setup();
  await act(s, { action: 'deleteGroup', groupId: 'grpA1' });
  await act(s, { action: 'addBike', groupId: 'grpB1', bike: { id: 'bike09', code: 'EB-002' } });
  let v = await handleView(s, p({ view: 'scanner' }));
  assert.deepEqual(v.deletedGroups.map(g => g.id), ['grpA1']);
  const r = await act(s, { action: 'restoreGroup', groupId: 'grpA1', reason: 'deleted the wrong group' });
  const g = (await day(s)).groups.find(x => x.id === 'grpA1');
  assert.deepEqual(g.bikes.map(b => b.code), ['EB-001']);
  assert.equal(g.removed.find(b => b.code === 'EB-002').reason, 'other');
  v = await handleView(s, p({ view: 'scanner' }));
  assert.equal(v.deletedGroups.length, 0);
  assert.deepEqual(v.corrections.find(c => c.kind === 'restore-group').elsewhere, ['EB-002']);
});

test('an M-check pass voided: kept in the history, and the bike is due again', async () => {
  const s = await setup();
  await act(s, { action: 'mcheck', check: { id: 'chk0001', bike: 'EB-003', failed: [] } });
  let v = await handleView(s, p({ view: 'scanner' }));
  assert.ok(!v.mcheckDue.includes('EB-003'));
  const r = await act(s, { action: 'voidMcheck', checkId: 'chk0001', reason: 'signed off the wrong bike' });
  assert.ok(r.view.mcheckDue.includes('EB-003'));
  const c = (await s.get('mchecks')).checks[0];
  assert.equal(c.voided.reason, 'signed off the wrong bike');
  assert.equal((await act(s, { action: 'voidMcheck', checkId: 'chk0001', reason: 'x' })).result, 'already-saved');
  await act(s, { action: 'mcheck', check: { id: 'chk0002', bike: 'EB-003', failed: ['brakes'], issueId: 'iss0009' } });
  await assert.rejects(act(s, { action: 'voidMcheck', checkId: 'chk0002', reason: 'x' }), /Only a passed/);
});

test('issues: reopened when repaired by mistake; closed as logged in error; once each, and out of the figures', async () => {
  const s = memStore();
  const rep = (id, bike, faults, prio = 3) => act(s, { action: 'reportIssue', issue: { id, bikeId: bike, issue: 'x', priority: prio, reportedBy: 'SO', odometerUnreadable: true, faults } });
  await rep('iss0001', 'EB-001', ['brakes']);
  await act(s, { action: 'resolveIssue', id: 'iss0001', resolution: 'pads', repairedBy: 'Sam' });
  await act(s, { action: 'reopenIssue', id: 'iss0001', reason: 'still squealing, not fixed' });
  let i = (await handleView(s, p({ view: 'issues' }))).issues.find(x => x.id === 'iss0001');
  assert.equal(i.status, 'open');
  assert.equal(i.corrections[0].resolution, 'pads', 'the original repair is kept');
  await assert.rejects(act(s, { action: 'issueInError', id: 'iss0001', reason: 'x' }), e => e.code === 'already-corrected');
  await rep('iss0002', 'EB-002', ['brakes'], 5);
  await rep('iss0003', 'EB-002', ['brakes']);
  await act(s, { action: 'issueInError', id: 'iss0002', reason: 'it was EB-020' });
  const v = await handleView(s, p({ view: 'issues' }));
  i = v.issues.find(x => x.id === 'iss0002');
  assert.equal(i.status, 'resolved'); assert.equal(i.error, true);
  assert.equal(v.repeats.iss0003, undefined, 'an issue in error doesn\'t make a repeat');
  const f = await handleView(s, p({ view: 'fleet' }));
  assert.ok(!f.unavailable.some(u => u.bike === 'EB-002'));
  await assert.rejects(act(s, { action: 'reopenIssue', id: 'iss0003', reason: 'x' }), /Only a repaired/);
  await assert.rejects(act(s, { action: 'issueInError', id: 'iss0003', reason: '' }), /reason/);
});

test('a bike removed by mistake is restored, and past days count it as in the fleet', async () => {
  const s = await setup();
  await act(s, { action: 'deleteAsset', id: 'EB-003' });
  assert.ok(!(await s.get('assets')).assets.some(a => a.id === 'EB-003'));
  await act(s, { action: 'restoreAsset', id: 'EB-003', reason: 'removed the wrong bike' });
  const a = (await s.get('assets')).assets.find(x => x.id === 'EB-003');
  assert.equal(a.serial, 'SEB-003');
  const h = await handleView(s, p({ view: 'assetHistory', bike: 'EB-003' }));
  assert.equal(h.entries[0].how, 'restored');
  assert.ok(h.entries.find(e => e.how === 'removed').error);
  assert.equal((await act(s, { action: 'restoreAsset', id: 'EB-003', reason: 'x' })).result, 'already-saved', 'a retry');
});
