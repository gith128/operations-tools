// v3.12: guided tours: departures from the manifest, arrivals, Tour back, guides from the roster.
import test from 'node:test';
import assert from 'node:assert/strict';
import { memStore } from './memstore.mjs';
import { handleAction, handleView, summariseDay } from '../netlify/lib/ops-core.mjs';
import { todayAdelaide, mondayOf, addDays } from '../netlify/lib/roster-core.mjs';
import { tourFor, DEFAULT_TOURS } from '../netlify/lib/maint-core.mjs';

const ADMIN = { admin: { configured: true, ok: true, supplied: true } };
const STAFF = { admin: { configured: true, ok: false } };
const p = o => new URLSearchParams(o);
const act = (s, body, ctx = ADMIN) => handleAction(s, { by: 'SO', ...body }, ctx);
const date = addDays(mondayOf(todayAdelaide()), 7);
const departure = { id: 'grpTour1', name: 'Morning Tour 9:30 (x5)', kind: 'tour', tourId: 'morning', tourName: 'Morning Tour', session: '09:30', site: 'OXB', ptime: '9:30 AM', qty: 5,
  bookings: [{ code: 'RPJMYBL', name: 'Ray Dahdah', pax: 3, agent: '' }, { code: 'RDAZCZJ', name: 'Janine Öttl', pax: 2, agent: 'GetYourGuide' }] };
async function setup() {
  const s = memStore();
  await act(s, { action: 'addMember', member: { id: 'mJess', name: 'Jess', initials: 'JT' } });
  await act(s, { action: 'addMember', member: { id: 'mTom', name: 'Tom', initials: 'TR' } });
  await act(s, { action: 'importAssets', assets: ['EB-001', 'EB-002', 'EB-003', 'EB-004', 'EB-005'].map(id => ({ id, serial: 'S' + id, model: 'T3', location: 'OXB' })) });
  return s;
}
const load = (s, groups, contacts = []) => act(s, { action: 'loadManifest', manifestDate: date, manifestDateDisplay: date, loadId: 'load' + Math.random().toString(36).slice(2, 8), groups, contacts }, STAFF);

test('tours are recognised from the Rezdy product name', () => {
  assert.equal(tourFor('Guided Morning E-Bike Tour', DEFAULT_TOURS).id, 'morning');
  assert.equal(tourFor('Guided Afternoon E-Bike, Wine & Stories Tour', DEFAULT_TOURS).id, 'wine-stories');
  assert.equal(tourFor('E-Bike Hire Visitor Centre', DEFAULT_TOURS), null);
});

test('Configuration → Tours: saved by Admin, checked, a tour left out is kept (retired)', async () => {
  const s = await setup();
  const st = await handleView(s, p({ view: 'settings' }));
  assert.deepEqual(st.tours.map(t => t.id), ['morning', 'wine-stories']);
  const r = await act(s, { action: 'saveTours', tours: [{ ...st.tours[0], name: 'Morning Ride', sessions: ['09:30', '08:00'] }, { name: 'Sunset Tour', match: 'Sunset', location: 'OXB', durationMins: 120, sessions: '17:30' }] });
  const t = Object.fromEntries(r.settings.tours.map(x => [x.id, x]));
  assert.deepEqual(t.morning.sessions, ['08:00', '09:30']);
  assert.equal(t['sunset-tour'].durationMins, 120);
  assert.equal(t['wine-stories'].retired, true);
  for (const [tours, msg] of [[[{ name: 'X', match: 'x', location: 'OXB', durationMins: 150, sessions: '9.30am' }], /24-hour/], [[{ name: 'X', match: '', location: 'OXB', durationMins: 150 }], /matching word/],
    [[{ name: 'X', match: 'x', location: 'ZZZ', durationMins: 150 }], /starts/], [[{ name: 'X', match: 'x', location: 'OXB', durationMins: 5 }], /15 minutes/]])
    await assert.rejects(act(s, { action: 'saveTours', tours }), e => msg.test(e.message));
  await assert.rejects(act(s, { action: 'saveTours', tours: [] }, STAFF), e => e.code === 'admin-required');
});

test('a departure: bookings kept, arrivals ticked, no-shows left out of the riders, Tour back to Oxenberry', async () => {
  const s = await setup();
  await load(s, [departure, { id: 'grpHire1', name: 'Lane (x1)', site: 'VIC', qty: 1 }],
    [{ code: 'RPJMYBL', name: 'Ray Dahdah', tour: 'Morning Tour 9:30', tourGroupId: 'grpTour1', site: 'OXB' }]);
  let d = await s.get('day');
  const g = d.groups.find(x => x.id === 'grpTour1');
  assert.deepEqual([g.kind, g.tourId, g.session, g.bookings.length, g.bookings[1].pax], ['tour', 'morning', '09:30', 2, 2]);
  assert.equal(d.contacts[0].tourGroupId, 'grpTour1');
  assert.equal(d.groups.find(x => x.id === 'grpHire1').kind, undefined, 'a hire stays a hire');
  await act(s, { action: 'setArrival', groupId: 'grpTour1', code: 'RPJMYBL', state: 'arrived' }, STAFF);
  await act(s, { action: 'setArrival', groupId: 'grpTour1', code: 'RDAZCZJ', state: 'noshow' }, STAFF);
  await assert.rejects(act(s, { action: 'setArrival', groupId: 'grpTour1', code: 'NOPE', state: 'arrived' }, STAFF), e => e.code === 'not-found');
  for (const [n, c] of ['EB-001', 'EB-002', 'EB-003'].entries()) await act(s, { action: 'addBike', groupId: 'grpTour1', bike: { id: 'bike0' + n, code: c } }, STAFF);
  await act(s, { action: 'setGroupStatus', groupId: 'grpTour1', status: 'out' }, STAFF);
  await act(s, { action: 'dropOff', groupId: 'grpTour1', location: 'OXB', at: Date.now() }, STAFF);
  d = await s.get('day');
  const t = d.groups.find(x => x.id === 'grpTour1');
  assert.equal(t.status, 'returned'); assert.ok(t.bikes.every(b => b.inAt));
  await assert.rejects(act(s, { action: 'dropOff', groupId: 'grpHire1', location: 'OXB', at: Date.now() }, STAFF), /collection point/, 'a hire can\'t be "dropped" at a hire location');
  const sum = summariseDay(d, await s.get('assets'), { issues: [] }, null);
  assert.deepEqual(sum.tours.morning, { name: 'Morning Tour', departures: 1, booked: 5, riders: 3, bikes: 3, byAgent: { Direct: 3, GetYourGuide: 0 } });
});

test('guides come from the roster: the shift must be at the tour\'s start and cover it, one guide per session', async () => {
  const s = await setup();
  const shift = (o = {}) => ({ id: 'shift' + Math.random().toString(36).slice(2, 8), date, site: 'OXB', memberId: 'mJess', start: '09:00', end: '12:30', note: '', guiding: { tourId: 'morning', session: '09:30' }, ...o });
  await assert.rejects(act(s, { action: 'rosterSave', shift: shift({ end: '11:00' }) }), /doesn't cover the whole Morning Tour/);
  await assert.rejects(act(s, { action: 'rosterSave', shift: shift({ site: 'VIC' }) }), /starts at OXB/);
  await act(s, { action: 'rosterSave', shift: shift() });
  await assert.rejects(act(s, { action: 'rosterSave', shift: shift({ memberId: 'mTom' }) }), e => e.code === 'guide-taken' && /Jess is already guiding/.test(e.message));
  const v = await handleView(s, p({ view: 'tours', date }));
  assert.deepEqual(v.guides['morning|09:30'], { memberId: 'mJess', name: 'Jess' });
  const r = await handleView(s, p({ view: 'roster', start: date, days: 1 }));
  assert.deepEqual(r.shifts[0].guiding, { tourId: 'morning', session: '09:30' });
  await load(s, [departure]);
  const sc = await handleView(s, p({ view: 'scanner' }));
  assert.equal(sc.guides['morning|09:30'].name, 'Jess');
  assert.equal(sc.tours[0].durationMins, 150);
});

test('tours are in the configuration file', async () => {
  const s = await setup();
  const cfg = await handleView(s, p({ view: 'configExport' }), ADMIN);
  assert.equal(cfg.sections.tours[0].name, 'Morning Tour');
});
