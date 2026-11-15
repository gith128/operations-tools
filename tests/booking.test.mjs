// v3.14: editing a booking on the day: pick-up and return, bikes booked, equipment and staff notes,
// tracked with who and when, kept on a reload of the same day.
import test from 'node:test';
import assert from 'node:assert/strict';
import { memStore } from './memstore.mjs';
import { handleAction, handleView } from '../netlify/lib/ops-core.mjs';

const STAFF = { admin: { configured: true, ok: false } };
const act = (s, body) => handleAction(s, body, STAFF);
const p = o => new URLSearchParams(o);
const DATE = '2026-11-20';
const smith = { id: 'grpS', name: 'Smith (x2)', code: 'RSMITH1', site: 'VIC', ptime: '9:30 AM', qty: 2, dropoff: '' };
const tour = { id: 'grpT', name: 'Morning Tour 9:30 (x3)', kind: 'tour', tourId: 'morning', tourName: 'Morning Tour', session: '09:30', site: 'OXB', ptime: '9:30 AM', qty: 3,
  bookings: [{ code: 'RTOUR1', name: 'Ray D', pax: 3, agent: '' }] };
const contacts = [{ code: 'RSMITH1', name: 'Ann Smith', phone: '+61400000000', ptime: '9:30 AM', site: 'VIC', totalBikes: 2 },
  { code: 'RTOUR1', name: 'Ray D', ptime: '9:30 AM', tourGroupId: 'grpT', tour: 'Morning Tour 9:30', site: 'OXB' }];
const load = (s, groups = [smith, tour], loadId = 'L' + Math.random(), date = DATE) =>
  act(s, { action: 'loadManifest', manifestDate: date, manifestDateDisplay: date, loadId, groups, contacts: contacts.filter(c => groups.some(g => g.code === c.code || (g.bookings || []).some(b => b.code === c.code))) });
const day = s => s.get('day', { type: 'json' });

test('a booking edited: both screens follow, the name and count change, and the history says who and what', async () => {
  const s = memStore(); await load(s);
  const r = await act(s, { action: 'editBooking', code: 'RSMITH1', baseV: 0, by: 'so', changes: { ptime: '11:00 AM', qty: 3, equip: ['1× Child Seat'], retTime: '4:00 PM', dropoff: 'Dandelion Wines' } });
  assert.equal(r.result, 'saved'); assert.equal(r.v, 1);
  const d = await day(s);
  const g = d.groups.find(x => x.id === 'grpS'), c = d.contacts.find(x => x.code === 'RSMITH1');
  assert.deepEqual([g.ptime, g.qty, g.name, g.retTime, g.dropoff, g.equip], ['11:00 AM', 3, 'Smith (x3)', '4:00 PM', 'Dandelion Wines', ['1× Child Seat']]);
  assert.deepEqual([c.ptime, c.totalBikes, c.retTime, c.dropoff], ['11:00 AM', 3, '4:00 PM', 'Dandelion Wines']);
  const rec = d.bookingEdits.RSMITH1;
  assert.deepEqual(rec.orig, { ptime: '9:30 AM', qty: 2, equip: [], retTime: '', dropoff: '' });
  assert.equal(rec.history.length, 5);
  assert.deepEqual(rec.history.find(h => h.field === 'qty'), { field: 'qty', from: 2, to: 3, at: rec.history[0].at, by: 'SO' });
  // Both views carry the record.
  assert.ok((await handleView(s, p({ view: 'contacts' }))).bookingEdits.RSMITH1);
  assert.ok((await handleView(s, p({ view: 'scanner' }))).bookingEdits.RSMITH1);
  // Put back to Rezdy's time: the marker clears, the history stays.
  await act(s, { action: 'editBooking', code: 'RSMITH1', baseV: 1, by: 'JB', changes: { ptime: '9:30 AM' } });
  const rec2 = (await day(s)).bookingEdits.RSMITH1;
  assert.equal('ptime' in rec2.orig, false); assert.equal(rec2.history.length, 6); assert.equal(rec2.v, 2);
});

test('notes, retries and two phones at once', async () => {
  const s = memStore(); await load(s);
  const note = { action: 'editBooking', groupId: 'grpS', baseV: 0, by: 'SO', note: { id: 'note1', text: 'Running 30 min late, rang 10:05' } };
  await act(s, note);
  assert.equal((await act(s, note)).result, 'already-saved', 'a retried note is not added twice');
  let rec = (await day(s)).bookingEdits.RSMITH1;
  assert.equal(rec.notes.length, 1); assert.equal(rec.notes[0].by, 'SO');
  // A second phone still on version 0 is refused, with the latest record to show.
  await assert.rejects(act(s, { action: 'editBooking', code: 'RSMITH1', baseV: 0, by: 'JB', changes: { ptime: '10:00 AM' } }),
    e => e.code === 'changed' && e.status === 409);
  // The same change arriving twice is recognised even with an old version.
  await act(s, { action: 'editBooking', code: 'RSMITH1', baseV: 1, by: 'JB', changes: { ptime: '10:00 AM' } });
  assert.equal((await act(s, { action: 'editBooking', code: 'RSMITH1', baseV: 1, by: 'JB', changes: { ptime: '10:00 AM' } })).result, 'already-saved');
  // Initials are required, bad values refused, and nothing to save is refused.
  await assert.rejects(act(s, { action: 'editBooking', code: 'RSMITH1', by: '', changes: { ptime: '1:00 PM' } }), /initials/);
  await assert.rejects(act(s, { action: 'editBooking', code: 'RSMITH1', by: 'SO', changes: { qty: 140 } }), /0 to 99/);
  await assert.rejects(act(s, { action: 'editBooking', code: 'RSMITH1', by: 'SO', changes: { site: 'ZZZ' } }), /hire location/);
  await assert.rejects(act(s, { action: 'editBooking', code: 'RSMITH1', by: 'SO', changes: {} }), /Nothing to save/);
  await assert.rejects(act(s, { action: 'editBooking', code: 'NOPE', by: 'SO', note: { id: 'noteNope01', text: 'x' } }), e => e.code === 'no-group');
});

test('a tour booking takes notes only, and a walk-in gets a booking number', async () => {
  const s = memStore(); await load(s);
  await act(s, { action: 'editBooking', code: 'RTOUR1', by: 'SO', note: { id: 'noteTour01', text: 'Vegetarian lunch' } });
  assert.equal((await day(s)).bookingEdits.RTOUR1.notes[0].text, 'Vegetarian lunch');
  await assert.rejects(act(s, { action: 'editBooking', code: 'RTOUR1', by: 'SO', changes: { ptime: '1:00 PM' } }), /only have notes/);
  await act(s, { action: 'createGroup', groupId: 'grpW', name: 'Walk-in Lee (x1)', site: 'VIC' });
  await act(s, { action: 'editBooking', groupId: 'grpW', by: 'SO', changes: { qty: 2 } });
  const d = await day(s); const w = d.groups.find(g => g.id === 'grpW');
  assert.ok(w.code.startsWith('WALK-')); assert.equal(w.name, 'Walk-in Lee (x2)'); assert.ok(d.bookingEdits[w.code]);
});

test('a reload of the same day keeps edits and notes, unless Rezdy now agrees; a cancelled booking drops out', async () => {
  const s = memStore(); await load(s);
  await act(s, { action: 'editBooking', code: 'RSMITH1', by: 'SO', changes: { ptime: '11:00 AM', qty: 3, retTime: '4:00 PM' }, note: { id: 'noteLate01', text: 'Late' } });
  // Rezdy was updated for the bikes (3) but not the time.
  const r = await load(s, [{ ...smith, qty: 3, name: 'Smith (x3)' }, tour]);
  assert.deepEqual(r.keptEdits.map(k => [k.field, k.value, k.rezdy]), [['ptime', '11:00 AM', '9:30 AM']]);
  let d = await day(s);
  const g = d.groups.find(x => x.id === 'grpS'), c = d.contacts.find(x => x.code === 'RSMITH1');
  assert.deepEqual([g.ptime, c.ptime, g.qty, g.retTime], ['11:00 AM', '11:00 AM', 3, '4:00 PM']);
  const rec = d.bookingEdits.RSMITH1;
  assert.deepEqual(Object.keys(rec.orig).sort(), ['ptime', 'retTime'], 'bikes now match Rezdy, so that marker clears');
  assert.equal(rec.notes.length, 1);
  // Cancelled in Rezdy: gone from the list, and its record with it (still in the archive).
  await load(s, [tour]);
  d = await day(s);
  assert.equal(d.bookingEdits.RSMITH1, undefined);
});

test('changing a location already set is recorded as an edit', async () => {
  const s = memStore(); await load(s);
  await act(s, { action: 'setGroupSite', groupId: 'grpS', site: 'BER', by: 'SO' });
  const rec = (await day(s)).bookingEdits.RSMITH1;
  assert.deepEqual([rec.orig.site, rec.history[0].from, rec.history[0].to, rec.history[0].by], ['VIC', 'VIC', 'BER', 'SO']);
});
