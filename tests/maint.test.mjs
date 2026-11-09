// v3.7: fault types set in Admin, repeat faults, bikes unavailable now, the home screen, and a bike's history.
import test from 'node:test';
import assert from 'node:assert/strict';
import { memStore } from './memstore.mjs';
import { handleAction, handleView } from '../netlify/lib/ops-core.mjs';
import { repeatFaults, cleanFaultTypes, DEFAULT_FAULT_TYPES } from '../netlify/lib/maint-core.mjs';

const p = o => new URLSearchParams(o);
const act = (s, body, ctx) => handleAction(s, { by: 'SO', ...body }, ctx);
const ADMIN = { admin: { configured: true, ok: true } };
const issue = (id, bikeId, faults, priority = 3) => ({ action: 'reportIssue', issue: { id, bikeId, issue: 'x', priority, reportedBy: 'SO', odometerUnreadable: true, faults } });

test('fault types: renamed, added, left out (retired, never lost), Admin only, stale edits refused', async () => {
  const s = memStore();
  let st = await handleView(s, p({ view: 'settings' }));
  assert.equal(st.faultTypes.length, DEFAULT_FAULT_TYPES.length);
  const types = st.faultTypes.filter(t => t.id !== 'accessories').map(t => t.id === 'brakes' ? { ...t, label: 'Brakes and levers' } : t);
  types.push({ label: 'Child seat' });
  const r = await act(s, { action: 'saveFaultTypes', types, repeatDays: 60, baseRev: st.rev }, ADMIN);
  const by = Object.fromEntries(r.settings.faultTypes.map(t => [t.id, t]));
  assert.equal(by.brakes.label, 'Brakes and levers');
  assert.equal(by['child-seat'].label, 'Child seat');
  assert.equal(by.accessories.retired, true, 'left out: kept, retired');
  assert.equal(r.settings.repeatDays, 60);
  await assert.rejects(act(s, { action: 'saveFaultTypes', types, baseRev: st.rev }, ADMIN), e => e.code === 'changed');
  await assert.rejects(act(s, { action: 'saveFaultTypes', types }, { admin: { configured: true, ok: false } }), e => e.code === 'admin-required');
  assert.throws(() => cleanFaultTypes([{ label: 'A' }, { label: 'a' }], []), /twice/);
  assert.throws(() => cleanFaultTypes([{ id: 'brakes', label: 'Brakes', retired: true }], [{ id: 'brakes', label: 'Brakes' }]), /at least one/);
});

test('an issue is logged with its fault types; an M-check failure gets them from the items that failed', async () => {
  const s = memStore();
  await act(s, issue('iss0001', 'EB-001', ['brakes', 'nonsense', 'brakes']));
  let v = await handleView(s, p({ view: 'issues' }));
  assert.deepEqual(v.issues[0].faults, ['brakes'], 'unknown types dropped, no repeats');
  await act(s, { action: 'mcheck', check: { id: 'chk0001', bike: 'EB-002', by: 'SO', failed: ['front', 'rear', 'battery'], issueId: 'iss0002' } });
  v = await handleView(s, p({ view: 'issues' }));
  assert.deepEqual(v.issues.find(i => i.id === 'iss0002').faults, ['tyres', 'battery']);
});

test('an update can set the fault types (no text needed) and records the change', async () => {
  const s = memStore();
  await act(s, issue('iss0001', 'EB-001', []));
  await act(s, { action: 'updateIssue', id: 'iss0001', update: { id: 'upd0001', by: 'JB', faults: ['motor'] } });
  const i = (await handleView(s, p({ view: 'issues' }))).issues[0];
  assert.deepEqual(i.faults, ['motor']);
  assert.deepEqual([i.updates[0].faultsFrom, i.updates[0].faultsTo, i.updates[0].text], [[], ['motor'], '']);
  await assert.rejects(act(s, { action: 'updateIssue', id: 'iss0001', update: { id: 'upd0002', by: 'JB', faults: ['motor'] } }), /Update is required/);
});

test('repeat faults: same bike, same type, within the window', () => {
  const d = n => Date.UTC(2026, 0, 1) + n * 864e5;
  const list = [
    { id: 'a', bikeId: 'EB-001', faults: ['brakes'], reportedAt: d(0) }, { id: 'b', bikeId: 'EB-001', faults: ['brakes', 'tyres'], reportedAt: d(30) },
    { id: 'c', bikeId: 'EB-001', faults: ['brakes'], reportedAt: d(200) }, { id: 'd', bikeId: 'EB-002', faults: ['brakes'], reportedAt: d(31) },
    { id: 'e', bikeId: 'EB-001', faults: ['tyres'], reportedAt: d(40) }];
  const r = repeatFaults(list, 90);
  assert.deepEqual(Object.keys(r).sort(), ['b', 'e']);
  assert.deepEqual(r.b, [{ id: 'a', at: d(0), type: 'brakes' }]);
  assert.equal(r.e[0].id, 'b', 'tyres again 10 days later');
  assert.equal(r.c, undefined, '170 days on: outside the window');
});

test('bikes unavailable now: open P5s, from when they went to P5', async () => {
  const s = memStore();
  await act(s, issue('iss0001', 'EB-001', ['motor'], 5));
  await act(s, issue('iss0002', 'EB-002', ['brakes'], 3));
  await act(s, { action: 'updateIssue', id: 'iss0002', update: { id: 'upd0001', by: 'SO', text: 'worse', priority: 5 } });
  await act(s, issue('iss0003', 'EB-003', ['tyres'], 5));
  await act(s, { action: 'resolveIssue', id: 'iss0003', resolution: 'new tube', repairedBy: 'Sam' });
  const f = await handleView(s, p({ view: 'fleet' }));
  assert.deepEqual(f.unavailable.map(u => u.bike).sort(), ['EB-001', 'EB-002']);
  const u2 = f.unavailable.find(u => u.bike === 'EB-002');
  const iss = (await handleView(s, p({ view: 'issues' }))).issues.find(i => i.id === 'iss0002');
  assert.equal(u2.since, iss.updates[0].at, 'from the change to P5, not when it was logged');
});

test('home screen: order and hidden tiles kept for every phone; Load Manifest can\'t be hidden', async () => {
  const s = memStore();
  const r = await act(s, { action: 'saveHomeTiles', order: ['scanner', 'contacts', 'bogus', 'scanner'], hidden: ['qr', 'manifest', 'bogus'] }, ADMIN);
  assert.deepEqual(r.settings.home.order.slice(0, 3), ['scanner', 'contacts', 'checklists']);
  assert.equal(r.settings.home.order.length, 10);
  assert.deepEqual(r.settings.home.hidden, ['qr']);
  assert.deepEqual((await handleView(s, p({ view: 'settings' }))).home.hidden, ['qr']);
});

test('a bike\'s history: register, moves, issues with repeats, M-checks and daily records, through a rename', async () => {
  const s = memStore();
  await act(s, { action: 'saveAsset', isNew: true, asset: { id: 'EB-009', serial: 'S9', brand: 'Gazelle', model: 'T3', purchaseDate: '2024-01-01', location: 'VIC' } });
  await act(s, issue('iss0001', 'EB-009', ['brakes']));
  const a = (await s.get('assets')).assets[0];
  await act(s, { action: 'saveAsset', originalId: 'EB-009', baseV: a.v, asset: { ...a, id: 'EB-099' } });
  await act(s, issue('iss0002', 'EB-099', ['brakes']));
  await act(s, { action: 'moveAssets', location: 'OXB', by: 'SO', codes: ['EB-099'] });
  await act(s, { action: 'mcheck', check: { id: 'chk0001', bike: 'EB-099', by: 'SO', failed: [] } });
  await s.setJSON('fleet-days', { rev: 1, days: { '2026-03-02': { src: 'live', manifest: true, bikes: { 'EB-009': { m: 'T3', l: 'VIC', s: 'h', h: ['VIC'], n: 1, d: 1 } } } } });
  const h = await handleView(s, p({ view: 'bikeHistory', bike: 'EB-099' }));
  assert.equal(h.asset.serial, 'S9');
  assert.deepEqual(h.ids.sort(), ['EB-009', 'EB-099']);
  assert.equal(h.issues.length, 2, 'issues under the old ID too');
  assert.equal(h.issues.find(i => i.id === 'iss0002').repeats.length, 1, 'brakes again: a repeat');
  assert.deepEqual(h.history.map(e => e.how).sort(), ['added', 'renamed']);
  assert.equal(h.moves.filter(m => m.to === 'OXB').length, 1);
  assert.equal(h.checks.length, 1);
  assert.equal(h.days['2026-03-02'].s, 'h', 'a day hired under the old ID');
  // removed from the register: still has a history
  const b = (await s.get('assets')).assets[0];
  await act(s, { action: 'deleteAsset', id: 'EB-099' });
  const g = await handleView(s, p({ view: 'bikeHistory', bike: 'EB-099' }));
  assert.ok(g.removed && g.asset.serial === 'S9');
  await assert.rejects(handleView(s, p({ view: 'bikeHistory', bike: 'EB-777' })), e => e.code === 'not-found');
});
