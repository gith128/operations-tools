// Roster, Known as, contact details and the admin password (v3.2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { memStore } from './memstore.mjs';
import { handleAction, handleView } from '../netlify/lib/ops-core.mjs';
import { parseDate, parseTime, mondayOf, todayAdelaide, addDays } from '../netlify/lib/roster-core.mjs';
import { takeSnapshot } from '../netlify/lib/backup-core.mjs';

const ADMIN = { admin: { configured: true, ok: true, supplied: true } };
const LOCKED = { admin: { configured: true, ok: false, supplied: false } };
const WRONG = { admin: { configured: true, ok: false, supplied: true } };
const NO_PW = { admin: { configured: false } };
const p = o => new URLSearchParams(o);
const act = (s, body, ctx = ADMIN) => handleAction(s, { by: 'SO', ...body }, ctx);
const today = todayAdelaide();
const nextMon = addDays(mondayOf(today), 7), sat = addDays(nextMon, 5), sun = addDays(nextMon, 6);
const dmy = iso => iso.split('-').reverse().join('/');

async function team() {
  const s = memStore();
  await act(s, { action: 'addMember', member: { id: 'mJess', name: 'Jess', initials: 'JT', fullName: 'Jessica Tran', email: 'jess@example.com', mobile: '0400 000 001' } });
  await act(s, { action: 'addMember', member: { id: 'mTom', name: 'Tom', initials: 'TR' } });
  await act(s, { action: 'addMember', member: { id: 'mSam1', name: 'Sam', initials: 'SK' } });
  await act(s, { action: 'addMember', member: { id: 'mSam2', name: 'Sam', initials: 'SR' } });
  return s;
}
const shift = (o = {}) => ({ id: 'shift' + Math.random().toString(36).slice(2, 8), date: sat, site: 'VIC', memberId: 'mJess', start: '09:00', end: '17:00', note: 'Opening', ...o });

test('dates and times as people type them', () => {
  assert.equal(parseDate('15/11/2026'), '2026-11-15');
  assert.equal(parseDate('5/1/26'), '2026-01-05');
  assert.equal(parseDate('2026-11-15'), '2026-11-15');
  assert.equal(parseDate('31/02/2026'), null);
  assert.equal(parseDate('Saturday'), null);
  for (const [t, want] of [['9:00', '09:00'], ['09:30', '09:30'], ['17:00', '17:00'], ['9am', '09:00'], ['5:30 pm', '17:30'], ['12pm', '12:00'], ['12am', '00:00'], ['0930', '09:30']]) assert.equal(parseTime(t), want, t);
  for (const t of ['25:00', '9:75', 'noon', '13pm', '']) assert.equal(parseTime(t), null, t);
});

test('the admin password: needed for Admin and roster changes once it is set', async () => {
  const s = await team();
  for (const ctx of [LOCKED, WRONG]) {
    await assert.rejects(act(s, { action: 'rosterSave', shift: shift() }, ctx), e => e.code === (ctx === WRONG ? 'admin-wrong' : 'admin-required'));
    await assert.rejects(act(s, { action: 'saveQrLinks', links: [] }, ctx), e => e.status === 403);
    await assert.rejects(handleView(s, p({ view: 'teamAdmin' }), ctx), e => e.status === 403);
    await assert.rejects(handleView(s, p({ view: 'rosterAdmin' }), ctx), e => e.status === 403);
  }
  // Staff pages still work without it.
  assert.ok((await handleView(s, p({ view: 'roster' }), LOCKED)).members.length);
  assert.ok((await handleView(s, p({ view: 'team' }), LOCKED)).members.length);
  // Not set yet: Admin works with the staff PIN as before, but contact details can't be stored or read.
  await act(s, { action: 'rosterSave', shift: shift() }, NO_PW);
  await act(s, { action: 'updateMember', id: 'mTom', member: { name: 'Tommy', initials: 'TR' } }, NO_PW);
  await assert.rejects(act(s, { action: 'updateMember', id: 'mTom', member: { name: 'Tom', initials: 'TR', email: 'tom@example.com' } }, NO_PW), e => e.code === 'admin-not-configured');
  await assert.rejects(handleView(s, p({ view: 'teamAdmin' }), NO_PW), e => e.code === 'admin-not-configured');
});

test('staff see Known as names and initials only; contact details stay in Admin', async () => {
  const s = await team();
  await act(s, { action: 'rosterSave', shift: shift() });
  const staffTeam = await handleView(s, p({ view: 'team' }), LOCKED);
  const jess = staffTeam.members.find(m => m.id === 'mJess');
  assert.deepEqual(Object.keys(jess).sort(), ['id', 'initials', 'name']);
  const roster = await handleView(s, p({ view: 'roster', start: nextMon }), LOCKED);
  const text = JSON.stringify(roster);
  for (const secret of ['Jessica', 'jess@example.com', '0400']) assert.ok(!text.includes(secret), secret);
  assert.equal(roster.shifts[0].name, 'Jess');
  const admin = await handleView(s, p({ view: 'teamAdmin' }), ADMIN);
  assert.equal(admin.members.find(m => m.id === 'mJess').email, 'jess@example.com');
  // A save that leaves contact fields out keeps them.
  const v = admin.members.find(m => m.id === 'mJess').v;
  await act(s, { action: 'updateMember', id: 'mJess', baseV: v, member: { name: 'Jessie', initials: 'JT' } });
  const after = (await handleView(s, p({ view: 'teamAdmin' }), ADMIN)).members.find(m => m.id === 'mJess');
  assert.equal(after.name, 'Jessie');
  assert.equal(after.mobile, '0400 000 001');
  await assert.rejects(act(s, { action: 'updateMember', id: 'mJess', member: { name: 'J', initials: 'JT', email: 'not-an-email' } }), e => e.status === 400);
});

test('editing a team member someone else has just saved is refused, not overwritten', async () => {
  const s = await team();
  const v = (await handleView(s, p({ view: 'teamAdmin' }), ADMIN)).members.find(m => m.id === 'mTom').v;
  await act(s, { action: 'updateMember', id: 'mTom', baseV: v, member: { name: 'Tommy', initials: 'TR' } });
  await assert.rejects(act(s, { action: 'updateMember', id: 'mTom', baseV: v, member: { name: 'Thomas', initials: 'TR' } }), e => e.code === 'changed' && e.extra.current.name === 'Tommy');
  // A retry of the save that went through is fine.
  assert.equal((await act(s, { action: 'updateMember', id: 'mTom', baseV: v, member: { name: 'Tommy', initials: 'TR' } })).result, 'already-saved');
});

test('shifts: add, overlap refused, edit with history, conflict check, remove, retries are safe', async () => {
  const s = await team();
  const sh = shift();
  const r = await act(s, { action: 'rosterSave', shift: sh, viewStart: nextMon });
  assert.equal(r.result, 'added');
  assert.equal((await act(s, { action: 'rosterSave', shift: sh })).result, 'already-saved', 'retry of an add');
  await assert.rejects(act(s, { action: 'rosterSave', shift: shift({ start: '16:00', end: '18:00' }) }), e => e.code === 'overlap');
  await act(s, { action: 'rosterSave', shift: shift({ start: '17:00', end: '18:00', site: 'OXB' }) }); // touching, not overlapping
  await assert.rejects(act(s, { action: 'rosterSave', shift: shift({ start: '17:00', end: '09:00' }) }), e => e.status === 400);
  await assert.rejects(act(s, { action: 'rosterSave', shift: shift({ site: 'NOPE' }) }), e => e.status === 400);
  // Edit from version 1, twice: the second (stale) edit is refused.
  await act(s, { action: 'rosterSave', shift: { ...sh, start: '10:00' }, baseV: 1 });
  await assert.rejects(act(s, { action: 'rosterSave', shift: { ...sh, start: '08:00' }, baseV: 1 }), e => e.code === 'changed' && /start 09:00 → 10:00/.test(e.message));
  const v = await handleView(s, p({ view: 'rosterAdmin', start: nextMon }), ADMIN);
  const saved = v.shifts.find(x => x.id === sh.id);
  assert.equal(saved.v, 2);
  assert.deepEqual(saved.history.map(h => h.what), ['added', 'start 09:00 → 10:00']);
  await act(s, { action: 'rosterRemove', id: sh.id, baseV: 2 });
  assert.equal((await act(s, { action: 'rosterRemove', id: sh.id, baseV: 2 })).result, 'already-saved');
  assert.ok(!(await handleView(s, p({ view: 'roster', start: nextMon }), LOCKED)).shifts.some(x => x.id === sh.id));
});

test('a shift changed after the roster was emailed shows as changed', async () => {
  const s = await team();
  const a = shift(), b = shift({ memberId: 'mTom', start: '10:00', end: '16:00' });
  await act(s, { action: 'rosterSave', shift: a });
  await act(s, { action: 'rosterSave', shift: b });
  await act(s, { action: 'rosterEmailed', week: nextMon });
  await new Promise(r => setTimeout(r, 5));
  await act(s, { action: 'rosterSave', shift: { ...b, start: '11:00' }, baseV: 1 });
  const v = await handleView(s, p({ view: 'roster', start: nextMon }), LOCKED);
  assert.equal(v.shifts.find(x => x.id === a.id).changed, false);
  assert.equal(v.shifts.find(x => x.id === b.id).changed, true);
  assert.ok(v.weeks[0].emailedAt);
});

test('copy last week: into an empty week, or replacing one only when confirmed, and undoable', async () => {
  const s = await team();
  const thisMon = mondayOf(today);
  await act(s, { action: 'rosterSave', shift: shift({ date: addDays(thisMon, 5) }) });
  await act(s, { action: 'rosterSave', shift: shift({ date: addDays(thisMon, 6), memberId: 'mTom' }) });
  const r = await act(s, { action: 'rosterCopyWeek', from: thisMon, to: nextMon });
  assert.equal(r.added, 2);
  assert.equal((await act(s, { action: 'rosterCopyWeek', from: thisMon, to: nextMon })).result, 'already-saved');
  let v = await handleView(s, p({ view: 'rosterAdmin', start: nextMon }), ADMIN);
  assert.deepEqual(v.shifts.map(x => x.date), [sat, sun]);
  assert.equal(v.weeks[0].undo.kind, 'copy');
  // Copying again over a week that now has shifts needs the count confirmed.
  await act(s, { action: 'rosterSave', shift: shift({ date: addDays(thisMon, 4), memberId: 'mSam1' }) });
  await assert.rejects(act(s, { action: 'rosterCopyWeek', from: thisMon, to: nextMon }), e => e.code === 'confirm' && e.extra.affected === 2);
  await act(s, { action: 'rosterCopyWeek', from: thisMon, to: nextMon, confirmReplace: 2 });
  assert.equal((await handleView(s, p({ view: 'roster', start: nextMon }), LOCKED)).shifts.length, 3);
  await act(s, { action: 'rosterUndoImport', week: nextMon });
  v = await handleView(s, p({ view: 'roster', start: nextMon }), LOCKED);
  assert.equal(v.shifts.length, 2, 'back to the first copy');
});

const csvRows = list => list.map((r, i) => ({ line: i + 2, ...r }));

test('upload: a preview with adds, changes and removes; problems flagged per row; nothing saved until applied', async () => {
  const s = await team();
  const keep = shift({ start: '09:00', end: '17:00' });
  const change = shift({ memberId: 'mTom', start: '10:00', end: '16:00' });
  const gone = shift({ date: sun, memberId: 'mSam1', site: 'OXB' });
  for (const x of [keep, change, gone]) await act(s, { action: 'rosterSave', shift: x });
  const rows = csvRows([
    { date: dmy(sat), day: 'Saturday', site: 'VIC', person: 'Jess', start: '9:00', end: '17:00', note: 'Opening' },
    { date: dmy(sat), day: 'Sat', site: 'Visitor Centre', person: 'TR', start: '10:00', end: '15:00' },
    { date: dmy(sun), site: 'OXB', person: 'SR', start: '9:30am', end: '4:30pm', note: 'Trailer first' },
  ]);
  const before = s.m.get('roster').body;
  const plan = (await act(s, { action: 'rosterImport', dryRun: true, rows, viewWeek: nextMon })).plan;
  assert.equal(s.m.get('roster').body, before, 'a preview saves nothing');
  assert.equal(plan.errors.length, 0);
  const w = plan.weeks[0];
  assert.equal(w.unchanged, 1);
  assert.equal(w.changes.length, 1);
  assert.equal(w.adds.length, 1);
  assert.equal(w.removes.length, 1);
  assert.equal(plan.affected, 2);
  // Applying needs the number of shifts it changes or removes, confirmed.
  await assert.rejects(act(s, { action: 'rosterImport', rows, file: 'week.csv' }), e => e.code === 'confirm' && e.extra.affected === 2);
  const r = await act(s, { action: 'rosterImport', rows, file: 'week.csv', confirmReplace: 2 });
  assert.equal(r.result, 'imported');
  let v = await handleView(s, p({ view: 'rosterAdmin', start: nextMon }), ADMIN);
  assert.equal(v.shifts.length, 3);
  assert.equal(v.shifts.find(x => x.id === change.id).end, '15:00');
  assert.match(v.shifts.find(x => x.id === change.id).history.slice(-1)[0].what, /from week.csv: finish 16:00 → 15:00/);
  assert.equal(v.weeks[0].undo.kind, 'upload');
  // The same file again changes nothing, and says so.
  const again = await act(s, { action: 'rosterImport', dryRun: true, rows });
  assert.equal(again.plan.affected, 0);
  assert.ok(again.plan.warnings.some(x => x.code === 'no-change'));
  // Undo puts the week back exactly.
  await act(s, { action: 'rosterUndoImport', week: nextMon });
  v = await handleView(s, p({ view: 'rosterAdmin', start: nextMon }), ADMIN);
  assert.deepEqual(v.shifts.map(x => x.id).sort(), [keep.id, change.id, gone.id].sort());
  assert.equal(v.shifts.find(x => x.id === change.id).end, '16:00');
  await assert.rejects(act(s, { action: 'rosterUndoImport', week: nextMon }), e => e.code === 'nothing-to-undo');
});

test('upload problems: unknown people and sites, two people with the same Known as, wrong weekdays, bad times, double booking', async () => {
  const s = await team();
  const rows = csvRows([
    { date: dmy(sat), day: 'Friday', site: 'VIC', person: 'Jess', start: '9:00', end: '17:00' },
    { date: dmy(sat), site: 'Nowhere', person: 'Jess', start: '9:00', end: '17:00' },
    { date: dmy(sat), site: 'VIC', person: 'Bob', start: '9:00', end: '17:00' },
    { date: dmy(sat), site: 'VIC', person: 'Sam', start: '9:00', end: '17:00' },
    { date: dmy(sat), site: 'VIC', person: 'SK', start: '17:00', end: '9:00' },
    { date: '32/13/2026', site: 'VIC', person: 'TR', start: '9:00', end: '17:00' },
    { date: dmy(sun), site: 'VIC', person: 'TR', start: '9:00', end: '17:00' },
    { date: dmy(sun), site: 'OXB', person: 'Tom', start: '12:00', end: '15:00' },
  ]);
  const plan = (await act(s, { action: 'rosterImport', dryRun: true, rows })).plan;
  const byLine = Object.fromEntries(plan.errors.map(e => [e.line, e.problem]));
  assert.match(byLine[2], /says Friday, but .* is a Saturday/);
  assert.match(byLine[3], /site "Nowhere"/);
  assert.match(byLine[4], /"Bob" isn't on the team/);
  assert.match(byLine[5], /"Sam" matches 2 people: use their initials \(SK, SR\)/);
  assert.match(byLine[6], /finish is before start/);
  assert.match(byLine[7], /isn't a date/);
  assert.match(byLine[9], /Tom is already on line 8/);
  await assert.rejects(act(s, { action: 'rosterImport', rows, confirmReplace: 0 }), e => e.code === 'import-errors');
  assert.ok(!s.m.has('roster') || JSON.parse(s.m.get('roster').body).shifts.length === 0, 'nothing saved');
});

test('upload warnings for files that may have the wrong dates', async () => {
  const s = await team();
  const lastMon = addDays(mondayOf(today), -7);
  await act(s, { action: 'rosterSave', shift: shift({ date: addDays(lastMon, 5) }) });
  // A file for last week (dates not updated), uploaded while looking at next week.
  const old = csvRows([{ date: dmy(addDays(lastMon, 5)), site: 'VIC', person: 'Jess', start: '9:00', end: '17:00', note: 'Opening' }]);
  const plan = (await act(s, { action: 'rosterImport', dryRun: true, rows: old, viewWeek: nextMon })).plan;
  const codes = plan.warnings.map(w => w.code);
  assert.ok(codes.includes('past'));
  assert.ok(codes.includes('other-week'));
  assert.ok(codes.includes('no-change'));
  // Next week, exactly like an earlier week.
  const copy = csvRows([{ date: dmy(sat), site: 'VIC', person: 'Jess', start: '9:00', end: '17:00' }]);
  const plan2 = (await act(s, { action: 'rosterImport', dryRun: true, rows: copy, viewWeek: nextMon })).plan;
  assert.ok(plan2.warnings.some(w => w.code === 'same-as'));
  assert.ok(!plan2.warnings.some(w => w.code === 'other-week'));
});

test('editing a week after an upload ends the chance to undo it', async () => {
  const s = await team();
  const rows = csvRows([{ date: dmy(sat), site: 'VIC', person: 'Jess', start: '9:00', end: '17:00' }]);
  await act(s, { action: 'rosterImport', rows, confirmReplace: 0 });
  const v = await handleView(s, p({ view: 'rosterAdmin', start: nextMon }), ADMIN);
  await act(s, { action: 'rosterSave', shift: { ...v.shifts[0], start: '08:30' }, baseV: v.shifts[0].v });
  await assert.rejects(act(s, { action: 'rosterUndoImport', week: nextMon }), e => e.code === 'nothing-to-undo');
});

test('the roster is in every backup', async () => {
  const s = await team();
  await act(s, { action: 'rosterSave', shift: shift() });
  const r = await takeSnapshot(s, memStore(), { prune: false });
  assert.equal(r.files.roster.count, 1);
});

// ── v3.2.3: Close, not available, spreadsheet times ───────────────────────
test('spreadsheet times with seconds, Close as a finish, and the forms of "not available"', async () => {
  assert.equal(parseTime('08:45:00'), '08:45');
  assert.equal(parseTime('5:15:00 pm'), '17:15');
  const { isNARow } = await import('../netlify/lib/roster-core.mjs');
  for (const r of [{ site: 'N/A' }, { site: 'na' }, { site: 'Not available' }, { site: 'VIC', start: 'N/A' }, { site: '', start: '0', end: '0' }, { site: '', start: '', end: '' }]) assert.ok(isNARow(r), JSON.stringify(r));
  for (const r of [{ site: 'VIC', start: '9:00', end: '17:00' }, { site: '', start: '9:00', end: '17:00' }]) assert.ok(!isNARow(r), JSON.stringify(r));
});

test('a sheet laid out like the real one uploads cleanly: seconds, Close, a bare hour, and a not-available row', async () => {
  const s = memStore();
  for (const [id, name, ini] of [['mAlex', 'Alex', 'AO'], ['mBeatrice', 'Bea', 'BB'], ['mJoey', 'Jo', 'JJ']]) await act(s, { action: 'addMember', member: { id, name, initials: ini } });
  const mon = nextMon, d = n => dmy(addDays(mon, n)).replace(/\/(\d{2})(\d{2})$/, '/$2'); // dd/mm/yy, as Excel saves it
  const day = n => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][n];
  const rows = csvRows([
    { date: d(0), day: day(0), site: 'VIC', person: 'Alex', start: '08:45:00', end: '17:15:00' },
    { date: d(2), day: day(2), site: 'VIC', person: 'Jo', start: '08:45:00', end: '17:15:00', note: 'Move to HOM to work on TukTuks' },
    { date: d(2), day: day(2), site: 'OXB', person: 'Bea', start: '09:45:00', end: '12:45:00' },
    { date: d(3), day: day(3), site: 'VIC', person: 'Alex', start: '08:45:00', end: 'Close' },
    { date: d(4), day: day(4), site: 'HOM', person: 'Jo', start: '10', end: 'Close' },
    { date: d(4), day: day(4), site: '', person: 'Alex', start: '0', end: '0', note: 'Awards night' },
  ]);
  const plan = (await act(s, { action: 'rosterImport', dryRun: true, rows })).plan;
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.weeks[0].adds.length, 6);
  await act(s, { action: 'rosterImport', rows, confirmReplace: 0, file: 'roster.csv' });
  const v = await handleView(s, p({ view: 'roster', start: mon }), LOCKED);
  const thu = v.shifts.find(x => x.date === addDays(mon, 3));
  assert.equal(thu.end, 'close');
  const fri = v.shifts.filter(x => x.date === addDays(mon, 4));
  assert.deepEqual(fri.map(x => x.kind), ['shift', 'na'], 'not-available entries come after the shifts');
  assert.equal(fri[0].start, '10:00');
  assert.equal(fri[1].name, 'Alex');
  assert.equal(fri[1].note, 'Awards night');
  // The same sheet again changes nothing.
  assert.equal((await act(s, { action: 'rosterImport', dryRun: true, rows })).plan.affected, 0);
});

test("not available: a person can't also be rostered that day, it isn't copied forward, and it can be added in Admin", async () => {
  const s = await team();
  const na = { id: 'naJess1', kind: 'na', date: sat, memberId: 'mJess', note: 'Away' };
  await act(s, { action: 'rosterSave', shift: na });
  await assert.rejects(act(s, { action: 'rosterSave', shift: shift() }), e => e.code === 'overlap' && /not available/.test(e.message));
  await assert.rejects(act(s, { action: 'rosterSave', shift: { ...na, id: 'naJess2' } }), e => e.code === 'overlap');
  await act(s, { action: 'rosterSave', shift: shift({ memberId: 'mTom', end: 'close' }) });
  await assert.rejects(act(s, { action: 'rosterSave', shift: shift({ memberId: 'mTom', start: '18:00', end: '19:00' }) }), e => e.code === 'overlap', 'until close runs to the end of the day');
  const rows = csvRows([{ date: dmy(sat), site: 'VIC', person: 'Jess', start: '9:00', end: '17:00' }, { date: dmy(sat), site: 'N/A', person: 'Jess' }]);
  const plan = (await act(s, { action: 'rosterImport', dryRun: true, rows })).plan;
  assert.match(plan.errors[0].problem, /marked not available on line 3, and rostered on line 2/);
  const r = await act(s, { action: 'rosterCopyWeek', from: nextMon, to: addDays(nextMon, 7) });
  assert.equal(r.added, 1, 'only the shift is copied');
});
