// SA eBikes Operations Tools v3.2 — the roster.
//
// One "roster" file holds every shift: { date, site, memberId, start, end, note }, plus a version
// number. A finish of "close" means until the work's done (no fixed time). An entry of kind "na" is
// "not available": a person, a date and an optional note, with no site or times. Each entry has a version
// number (v) for the edit-conflict check and a short history of who changed what. Removed shifts
// are kept, marked removed, so the history stays readable. Shifts more than 400 days old are dropped.
//
// Per week (keyed by its Monday), the roster remembers when it was last emailed, so shifts changed
// since show as "changed", and the state before the last upload or copy, so that can be undone
// until someone edits the week again.
//
// Staff see shifts with each person's Known as name and initials only. Adding, changing, removing,
// copying, uploading and emailing are Admin actions (checked in ops-core.mjs).
import { TZ } from './tz.mjs';

export class RosterError extends Error {
  constructor(status, message, code, extra) { super(message); this.status = status; this.code = code; this.extra = extra; }
}
const bad = (msg, code = 'invalid', extra) => new RosterError(400, msg, code, extra);
const conflict = (msg, code, extra) => new RosterError(409, msg, code, extra);

export const KEY_ROSTER = 'roster';
export const emptyRoster = () => ({ rev: 0, updatedAt: 0, shifts: [], weeks: {} });
const KEEP_DAYS = 400;
const DAY = 864e5;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── dates and times ────────────────────────────────────────────────────────
const isoOf = d => d.toISOString().slice(0, 10);
const parseIso = iso => { const d = new Date(iso + 'T00:00:00Z'); return isNaN(d) || isoOf(d) !== iso ? null : d; };
export const todayAdelaide = (t = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(t));
export const addDays = (iso, n) => isoOf(new Date(parseIso(iso).getTime() + n * DAY));
export function mondayOf(iso) { const d = parseIso(iso); return addDays(iso, -((d.getUTCDay() + 6) % 7)); }
export const weekdayOf = iso => DAYS[parseIso(iso).getUTCDay()];
export const showDate = iso => { const d = parseIso(iso); return DAYS[d.getUTCDay()].slice(0, 3) + ' ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()]; };
// "close" (until the work's done) counts as the end of the day for overlaps.
const mins = t => { if (t === 'close') return 24 * 60; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export function showTime(t) { if (t === 'close') return 'close'; const [h, m] = t.split(':').map(Number); return (h % 12 || 12) + ':' + String(m).padStart(2, '0') + (h < 12 ? ' am' : ' pm'); }
const isNA = s => s.kind === 'na';

// Dates as people type them in Australia: 15/11/2026, 15/11/26, 2026-11-15, 15-11-2026.
export function parseDate(raw) {
  const s = String(raw || '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  let y, mo, d;
  if (m) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s))) [d, mo, y] = [+m[1], +m[2], m[3].length === 2 ? 2000 + +m[3] : +m[3]];
  else return null;
  const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return parseIso(iso) ? iso : null;
}
// Times: 9:00, 09:00, 17:00, 9am, 9:30 pm, 0930, and spreadsheet times with seconds (08:45:00).
export function parseTime(raw) {
  const s = String(raw || '').trim().toLowerCase().replace(/\s+/g, '').replace(/^(\d{1,2}:\d{2}):\d{2}/, '$1');
  const m = /^(\d{1,2})(?::?(\d{2}))?(am|pm)?$/.exec(s);
  if (!m) return null;
  let h = +m[1]; const min = m[2] ? +m[2] : 0;
  if (m[3]) { if (h < 1 || h > 12) return null; h = (h % 12) + (m[3] === 'pm' ? 12 : 0); }
  else if (!m[2] && s.length > 2) return null;
  if (h > 23 || min > 59) return null;
  return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
}

// A finish of Close / closing / until close.
const parseFinish = raw => (/^(close|closing|close[sd]|untilclose|tilclose|tillclose)$/.test(String(raw || '').trim().toLowerCase().replace(/[\s'’]/g, '')) ? 'close' : parseTime(raw));
// A row that means "not available": N/A (or NA, Not available, Unavailable) as the site or start,
// or no site with no real times (blank or 0).
const NA_WORDS = /^(n\/?a|not ?available|unavailable|away|off)$/i;
const blankTime = v => ['', '0', '00:00', '0:00', '00:00:00'].includes(String(v || '').trim());
export function isNARow(r) {
  if (NA_WORDS.test(String(r.site || '').trim()) || NA_WORDS.test(String(r.start || '').trim())) return true;
  return !String(r.site || '').trim() && blankTime(r.start) && blankTime(r.end);
}

// ── checking a shift ───────────────────────────────────────────────────────
const active = s => !s.removed;
const weekOf = s => mondayOf(s.date);
function memberName(rctx, id) { const m = rctx.members.find(x => x.id === id); return m ? m.name : 'someone no longer on the team'; }

function cleanShift(x, rctx) {
  const date = DATE_RE.test(String(x && x.date)) && parseIso(x.date) ? x.date : null;
  if (!date) throw bad('Choose a date');
  if (x.kind === 'na') {
    const memberId = String(x.memberId || '');
    const m = rctx.members.find(y => y.id === memberId);
    if (!m || m.retired) throw bad('Choose who is not available');
    return { kind: 'na', date, site: '', memberId, start: '', end: '', note: String(x.note || '').trim().slice(0, 300) };
  }
  const site = String((x && x.site) || '').toUpperCase();
  if (!rctx.locations.some(l => l.code === site && !l.retired)) throw bad('Choose where the shift is');
  const memberId = String((x && x.memberId) || '');
  const m = rctx.members.find(y => y.id === memberId);
  if (!m || m.retired) throw bad('Choose who is working');
  const start = TIME_RE.test(String(x.start)) ? x.start : null, end = x.end === 'close' || TIME_RE.test(String(x.end)) ? x.end : null;
  if (!start || !end) throw bad('Enter a start and finish time');
  if (mins(end) <= mins(start)) throw bad('The finish time must be after the start');
  const note = String(x.note || '').trim().slice(0, 300);
  // v3.12: a shift can be marked as guiding a tour session. It must be at the tour's location and
  // cover the whole tour (from the session time to the end of its duration), so a guide is always
  // rostered on for it.
  let guiding = null;
  if (x.guiding && x.guiding.tourId) {
    const t = (rctx.tours || []).find(y => y.id === x.guiding.tourId && !y.retired);
    const session = String(x.guiding.session || '');
    if (!t || !TIME_RE.test(session)) throw bad('Choose the tour and session being guided');
    if (site !== t.location) throw bad(t.name + ' starts at ' + t.location + ': the shift has to be there to guide it');
    if (mins(start) > mins(session) || (end !== 'close' && mins(end) < mins(session) + t.durationMins))
      throw bad('The shift doesn\'t cover the whole ' + t.name + ' (' + showTime(session) + ' to ' + showTime(addMins(session, t.durationMins)) + ')');
    guiding = { tourId: t.id, session };
  }
  return { kind: 'shift', date, site, memberId, start, end, note, ...(guiding ? { guiding } : {}) };
}
const addMins = (t, n) => { const m = mins(t) + n; return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
// v3.12: who's rostered to guide each tour session on a date: { 'tourId|09:30': { memberId, name } }.
export function guidesOn(doc, members, date) {
  const out = {};
  for (const sh of (doc && doc.shifts) || []) {
    if (sh.date !== date || !sh.guiding) continue;
    const m = members.find(x => x.id === sh.memberId);
    out[sh.guiding.tourId + '|' + sh.guiding.session] = { memberId: sh.memberId, name: m ? (m.knownAs || m.name) : 'someone no longer on the team' };
  }
  return out;
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const kindOf = s => (s.kind === 'na' ? 'na' : 'shift');
const sameShift = (a, b) => kindOf(a) === kindOf(b) && a.date === b.date && (a.site || '') === (b.site || '') && a.memberId === b.memberId && (a.start || '') === (b.start || '') && (a.end || '') === (b.end || '') && (a.note || '') === (b.note || '') && JSON.stringify(a.guiding || null) === JSON.stringify(b.guiding || null);

// Two shifts for one person at overlapping times, or a shift on a day they're not available
// (or marked not available twice), can't both stand.
function clashes(o, sh) {
  if (o.memberId !== sh.memberId || o.date !== sh.date) return false;
  if (isNA(o) || isNA(sh)) return true;
  return mins(o.start) < mins(sh.end) && mins(sh.start) < mins(o.end);
}
function overlapWith(shifts, sh, exceptId) {
  return shifts.find(o => active(o) && o.id !== exceptId && clashes(o, sh));
}
function clashText(rctx, clash, sh) {
  const who = memberName(rctx, sh.memberId);
  if (isNA(clash)) return `${who} is marked not available that day`;
  if (isNA(sh)) return `${who} is already rostered that day (${clash.start}–${clash.end === 'close' ? 'close' : clash.end} at ${clash.site})`;
  return `${who} is already on ${clash.start}–${clash.end === 'close' ? 'close' : clash.end} at ${clash.site} that day`;
}
function describe(old, sh, rctx) {
  const out = [];
  if (kindOf(old) !== kindOf(sh)) out.push(isNA(sh) ? 'now not available' : 'now a shift');
  if (old.date !== sh.date) out.push(`date ${showDate(old.date)} → ${showDate(sh.date)}`);
  if ((old.site || '') !== (sh.site || '') && !isNA(sh) && !isNA(old)) out.push(`site ${old.site} → ${sh.site}`);
  if (old.memberId !== sh.memberId) out.push(`${memberName(rctx, old.memberId)} → ${memberName(rctx, sh.memberId)}`);
  if (!isNA(sh) && !isNA(old) && old.start !== sh.start) out.push(`start ${old.start} → ${sh.start}`);
  if (!isNA(sh) && !isNA(old) && old.end !== sh.end) out.push(`finish ${old.end} → ${sh.end}`);
  if ((old.note || '') !== (sh.note || '')) out.push('note changed');
  if (JSON.stringify(old.guiding || null) !== JSON.stringify(sh.guiding || null)) out.push(sh.guiding ? 'guiding ' + ((rctx.tours || []).find(t => t.id === sh.guiding.tourId) || { name: 'a tour' }).name + ' ' + showTime(sh.guiding.session) : 'no longer guiding');
  return out.join(', ');
}
const historyOf = s => (s.history = s.history || []);
function addHistory(s, at, by, what) { historyOf(s).push({ at, by, what }); if (s.history.length > 30) s.history.splice(0, s.history.length - 30); }
const weekInfo = (doc, w) => (doc.weeks[w] = doc.weeks[w] || {});
// Any ordinary edit to a week ends the chance to undo its last upload or copy.
function weekEdited(doc, w) { if (doc.weeks[w]) delete doc.weeks[w].lastImport; }
function tidy(doc, today) {
  const cutoff = addDays(today, -KEEP_DAYS);
  doc.shifts = doc.shifts.filter(s => s.date >= cutoff);
  for (const w of Object.keys(doc.weeks)) if (w < mondayOf(cutoff)) delete doc.weeks[w];
}
const byOf = p => String((p && p.by) || '').trim().toUpperCase().slice(0, 10);
const needBy = p => { const by = byOf(p); if (!by) throw bad('Enter your initials'); return by; };
const shiftId = v => { const s = String(v || ''); if (!/^[\w-]{4,80}$/.test(s)) throw bad('Shift id missing'); return s; };
const newShiftId = () => 'sh' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ── actions (each runs inside a conditional write of the roster file) ──────
// rctx: { members, locations, today, now }
export const rosterActions = {
  async rosterSave(doc, p, rctx) {
    const by = needBy(p), now = rctx.now;
    const id = shiftId(p.shift && p.shift.id);
    const sh = cleanShift(p.shift, rctx);
    const existing = doc.shifts.find(s => s.id === id);
    // One guide per tour session.
    if (sh.guiding) {
      const other = doc.shifts.find(s => s.id !== id && !s.removed && s.date === sh.date && s.guiding && s.guiding.tourId === sh.guiding.tourId && s.guiding.session === sh.guiding.session);
      if (other) throw conflict(memberName(rctx, other.memberId) + ' is already guiding that tour at ' + showTime(sh.guiding.session), 'guide-taken');
    }
    if (!existing && !sh.guiding) delete sh.guiding;
    if (existing && !sh.guiding) sh.guiding = undefined;
    if (!existing) {
      const clash = overlapWith(doc.shifts, sh);
      if (clash) throw conflict(clashText(rctx, clash, sh), 'overlap');
      const s = { id, ...sh, v: 1, createdAt: now, createdBy: by, changedAt: now, history: [] };
      addHistory(s, now, by, 'added');
      doc.shifts.push(s);
      weekEdited(doc, weekOf(s));
      tidy(doc, rctx.today);
      return { result: 'added', shift: s };
    }
    if (existing.removed) throw conflict(`That shift was removed by ${existing.removed.by || 'someone'}`, 'removed');
    // The edit-conflict check: the version the form was opened at must still be the current one.
    if (p.baseV == null || p.baseV !== existing.v) {
      if (sameShift(existing, sh)) return { result: 'already-saved', shift: existing };
      const last = (existing.history || []).slice(-1)[0];
      throw conflict('Someone changed this shift since you opened it' + (last ? ` (${last.by}: ${last.what})` : ''), 'changed', { current: existing });
    }
    const what = describe(existing, sh, rctx);
    if (!what) return { result: 'unchanged', shift: existing };
    const clash = overlapWith(doc.shifts, sh, id);
    if (clash) throw conflict(clashText(rctx, clash, sh), 'overlap');
    weekEdited(doc, weekOf(existing));
    Object.assign(existing, sh, { v: existing.v + 1, changedAt: now });
    addHistory(existing, now, by, what);
    weekEdited(doc, weekOf(existing));
    tidy(doc, rctx.today);
    return { result: 'updated', shift: existing };
  },

  async rosterRemove(doc, p, rctx) {
    const by = needBy(p), now = rctx.now;
    const s = doc.shifts.find(x => x.id === shiftId(p.id));
    if (!s) throw new RosterError(404, 'That shift no longer exists', 'not-found');
    if (s.removed) return { result: 'already-saved' };
    if (p.baseV != null && p.baseV !== s.v) throw conflict('Someone changed this shift since you opened it', 'changed', { current: s });
    s.removed = { at: now, by }; s.v += 1; s.changedAt = now;
    addHistory(s, now, by, 'removed');
    weekEdited(doc, weekOf(s));
    return { result: 'removed' };
  },

  // Copies one week's shifts into another. A week that already has shifts is only replaced when
  // confirmReplace equals the number of shifts that would go. The copy can be undone.
  async rosterCopyWeek(doc, p, rctx) {
    const by = needBy(p), now = rctx.now;
    const from = mondayOf(String(p.from || '')), to = mondayOf(String(p.to || ''));
    if (!parseIso(from) || !parseIso(to) || from === to) throw bad('Choose two different weeks');
    const offset = Math.round((parseIso(to) - parseIso(from)) / DAY);
    // "Not available" entries are one-offs, so they aren't copied.
    const src = doc.shifts.filter(s => active(s) && !isNA(s) && weekOf(s) === from);
    if (!src.length) throw bad('There are no shifts in that week to copy');
    const copyId = s => (s.id + '-to-' + to).slice(0, 80);
    if (src.every(s => doc.shifts.some(x => x.id === copyId(s) && active(x)))) return { result: 'already-saved' };
    const target = doc.shifts.filter(s => active(s) && weekOf(s) === to);
    if (target.length && p.confirmReplace !== target.length) {
      throw conflict(`${showDate(to)} week already has ${target.length} shift${target.length > 1 ? 's' : ''}`, 'confirm', { affected: target.length });
    }
    weekInfo(doc, to).lastImport = { at: now, by, kind: 'copy', from, before: JSON.parse(JSON.stringify(doc.shifts.filter(s => weekOf(s) === to))) };
    for (const s of target) { s.removed = { at: now, by }; s.v += 1; s.changedAt = now; addHistory(s, now, by, `replaced by a copy of ${showDate(from)} week`); }
    let added = 0, skipped = 0;
    for (const s of src) {
      const m = rctx.members.find(x => x.id === s.memberId);
      if (!m || m.retired || !rctx.locations.some(l => l.code === s.site && !l.retired)) { skipped++; continue; }
      const c = { id: copyId(s), kind: 'shift', date: addDays(s.date, offset), site: s.site, memberId: s.memberId, start: s.start, end: s.end, note: s.note || '', v: 1, createdAt: now, createdBy: by, changedAt: now, history: [] };
      addHistory(c, now, by, `copied from ${showDate(s.date)}`);
      doc.shifts = doc.shifts.filter(x => x.id !== c.id).concat(c);
      added++;
    }
    tidy(doc, rctx.today);
    return { result: 'copied', added, skipped, replaced: target.length };
  },

  // A spreadsheet upload: rows of { line, date, day, site, person, start, end, note }.
  // dryRun returns the plan without saving. Applying replaces the weeks in the file; whenever that
  // changes or removes existing shifts, confirmReplace must equal that number.
  async rosterImport(doc, p, rctx) {
    const plan = planImport(doc, p, rctx);
    if (p.dryRun) return { result: 'plan', plan, noWrite: true };
    if (plan.errors.length) throw bad(`${plan.errors.length} row${plan.errors.length > 1 ? 's have' : ' has'} a problem. Fix the file and upload it again.`, 'import-errors', { plan });
    if (!plan.weeks.length) throw bad('There are no shifts in that file');
    if (plan.affected && p.confirmReplace !== plan.affected) throw conflict(`This replaces ${plan.affected} existing shift${plan.affected > 1 ? 's' : ''}`, 'confirm', { affected: plan.affected, plan });
    const by = needBy(p), now = rctx.now, file = String(p.file || 'roster.csv').slice(0, 80);
    if (!plan.weeks.some(w => w.adds.length || w.changes.length || w.removes.length)) return { result: 'unchanged', plan };
    for (const w of plan.weeks) {
      if (!w.adds.length && !w.changes.length && !w.removes.length) continue;
      weekInfo(doc, w.week).lastImport = { at: now, by, kind: 'upload', file, before: JSON.parse(JSON.stringify(doc.shifts.filter(s => weekOf(s) === w.week))) };
      for (const c of w.changes) {
        const s = doc.shifts.find(x => x.id === c.id);
        const what = describe(s, c.shift, rctx);
        Object.assign(s, c.shift, { v: s.v + 1, changedAt: now });
        addHistory(s, now, by, `from ${file}: ${what}`);
      }
      for (const r of w.removes) {
        const s = doc.shifts.find(x => x.id === r.id);
        s.removed = { at: now, by }; s.v += 1; s.changedAt = now;
        addHistory(s, now, by, `removed by ${file}`);
      }
      for (const a of w.adds) {
        const s = { id: newShiftId(), ...a.shift, v: 1, createdAt: now, createdBy: by, changedAt: now, history: [] };
        addHistory(s, now, by, `added from ${file}`);
        doc.shifts.push(s);
      }
    }
    tidy(doc, rctx.today);
    return { result: 'imported', plan };
  },

  // Puts a week back exactly as it was before its last upload or copy.
  async rosterUndoImport(doc, p, rctx) {
    const by = needBy(p), now = rctx.now;
    const week = mondayOf(String(p.week || ''));
    const li = doc.weeks[week] && doc.weeks[week].lastImport;
    if (!li) throw conflict('There is nothing to undo for that week. It has been edited since, so use a backup if it needs going back.', 'nothing-to-undo');
    const current = new Map(doc.shifts.map(s => [s.id, s]));
    const restored = li.before.map(s => {
      const cur = current.get(s.id);
      const back = { ...s, v: Math.max(s.v || 1, cur ? cur.v : 0) + 1, changedAt: now };
      addHistory(back, now, by, `${li.kind === 'copy' ? 'copy' : 'upload'} undone`);
      return back;
    });
    doc.shifts = doc.shifts.filter(s => weekOf(s) !== week).concat(restored);
    delete doc.weeks[week].lastImport;
    return { result: 'undone', shifts: restored.filter(active).length };
  },

  async rosterEmailed(doc, p, rctx) {
    const by = needBy(p);
    const week = mondayOf(String(p.week || ''));
    if (!parseIso(week)) throw bad('Choose a week');
    Object.assign(weekInfo(doc, week), { emailedAt: rctx.now, emailedBy: by });
    return { result: 'emailed' };
  },
};

// ── the upload plan ────────────────────────────────────────────────────────
function resolvePerson(raw, members) {
  const s = String(raw || '').trim();
  if (!s) return { error: 'No name' };
  const live = members.filter(m => !m.retired);
  const byInit = live.filter(m => m.initials === s.toUpperCase());
  if (byInit.length === 1) return { member: byInit[0] };
  const byName = live.filter(m => m.name.toLowerCase() === s.toLowerCase());
  if (byName.length === 1) return { member: byName[0] };
  if (byName.length > 1) return { error: `"${s}" matches ${byName.length} people: use their initials (${byName.map(m => m.initials).join(', ')})` };
  return { error: `"${s}" isn't on the team (Admin → Team)` };
}
function resolveSite(raw, locations) {
  const s = String(raw || '').trim().toLowerCase();
  const live = locations.filter(l => !l.retired);
  return live.find(l => l.code.toLowerCase() === s) || live.find(l => l.name.toLowerCase() === s) || null;
}

export function planImport(doc, p, rctx) {
  const rows = Array.isArray(p.rows) ? p.rows.slice(0, 2000) : [];
  const errors = [], shifts = [];
  for (const r of rows) {
    const line = r.line || shifts.length + errors.length + 2;
    const problems = [];
    const date = parseDate(r.date);
    if (!date) problems.push(`date "${r.date || ''}" isn't a date`);
    if (date && r.day && String(r.day).trim()) {
      const d = String(r.day).trim().toLowerCase();
      const actual = weekdayOf(date);
      if (!(actual.toLowerCase().startsWith(d.slice(0, 3)) && d.length >= 3)) problems.push(`says ${r.day}, but ${date.split('-').reverse().join('/')} is a ${actual}`);
    }
    const na = isNARow(r);
    const who = resolvePerson(r.person, rctx.members);
    let site = null, start = '', end = '';
    if (!na) {
      site = resolveSite(r.site, rctx.locations);
      if (!site) problems.push(`site "${r.site || ''}" isn't a location (write N/A for "not available")`);
      start = parseTime(r.start); end = parseFinish(r.end);
      if (!start) problems.push(`start "${r.start || ''}" isn't a time`);
      if (!end) problems.push(`finish "${r.end || ''}" isn't a time or Close`);
      if (start && end && mins(end) <= mins(start)) problems.push('finish is before start');
    }
    if (who.error) problems.push(who.error);
    if (problems.length) { errors.push({ line, problem: problems.join('; ') }); continue; }
    const sh = na
      ? { kind: 'na', date, site: '', memberId: who.member.id, start: '', end: '', note: String(r.note || '').trim().slice(0, 300) }
      : { kind: 'shift', date, site: site.code, memberId: who.member.id, start, end, note: String(r.note || '').trim().slice(0, 300) };
    const clash = shifts.find(o => clashes(o.shift, sh));
    if (clash) {
      errors.push({ line, problem: na || isNA(clash.shift) ? `${who.member.name} is marked not available on line ${na ? line : clash.line}, and rostered on line ${na ? clash.line : line}` : `${who.member.name} is already on line ${clash.line} at that time` });
      continue;
    }
    shifts.push({ line, shift: sh });
  }
  const weeks = [...new Set(shifts.map(s => mondayOf(s.shift.date)))].sort();
  const plan = { weeks: [], errors, rows: rows.length, affected: 0, warnings: [] };
  for (const week of weeks) {
    const existing = doc.shifts.filter(s => active(s) && weekOf(s) === week);
    const unmatched = new Set(existing.map(s => s.id));
    const w = { week, existing: existing.length, adds: [], changes: [], removes: [], unchanged: 0, emailedAt: (doc.weeks[week] || {}).emailedAt || 0 };
    for (const f of shifts.filter(s => mondayOf(s.shift.date) === week)) {
      const match = existing.find(s => unmatched.has(s.id) && kindOf(s) === f.shift.kind && s.date === f.shift.date && s.memberId === f.shift.memberId && (s.site || '') === f.shift.site);
      if (!match) { w.adds.push({ line: f.line, shift: f.shift }); continue; }
      unmatched.delete(match.id);
      if (sameShift(match, f.shift)) w.unchanged++;
      else w.changes.push({ id: match.id, line: f.line, shift: f.shift, from: { start: match.start || '', end: match.end || '', note: match.note || '' } });
    }
    for (const s of existing) if (unmatched.has(s.id)) w.removes.push({ id: s.id, shift: { kind: kindOf(s), date: s.date, site: s.site || '', memberId: s.memberId, start: s.start || '', end: s.end || '', note: s.note || '' } });
    plan.affected += w.changes.length + w.removes.length;
    plan.weeks.push(w);
  }
  // Signs the file may have the wrong dates.
  const today = rctx.today;
  const past = shifts.filter(s => s.shift.date < today).length;
  if (past) plan.warnings.push({ code: 'past', count: past, text: `${past} shift${past > 1 ? 's are' : ' is'} on dates that have already passed.` });
  if (p.viewWeek && weeks.length && !weeks.includes(mondayOf(String(p.viewWeek)))) {
    plan.warnings.push({ code: 'other-week', text: `This file is for ${weeks.map(w => 'the week of ' + showDate(w)).join(', ')}, but you were looking at the week of ${showDate(mondayOf(String(p.viewWeek)))}.` });
  }
  for (const w of plan.weeks) {
    if (!w.adds.length && !w.changes.length && !w.removes.length && w.existing) {
      plan.warnings.push({ code: 'no-change', week: w.week, text: `The week of ${showDate(w.week)} is already exactly as in this file. If this was meant to be a new week, the dates in the file haven't been updated.` });
    }
    // The same pattern as an earlier week (same weekdays, sites, people and times): a sheet copied
    // forward without its dates changed would show here, or simply a repeat roster.
    const sig = list => list.map(s => [kindOf(s), weekdayOf(s.date), s.site || '', s.memberId, s.start || '', s.end || ''].join('|')).sort().join(';');
    const mine = sig(shifts.filter(s => mondayOf(s.shift.date) === w.week).map(s => s.shift));
    for (let k = 1; k <= 8; k++) {
      const earlier = addDays(w.week, -7 * k);
      const theirs = doc.shifts.filter(s => active(s) && weekOf(s) === earlier);
      if (theirs.length && sig(theirs) === mine) { plan.warnings.push({ code: 'same-as', week: w.week, text: `The week of ${showDate(w.week)} in this file is identical to the week of ${showDate(earlier)}. Check the dates were updated.` }); break; }
    }
  }
  return plan;
}

// ── what staff and Admin see ───────────────────────────────────────────────
export function rosterView(doc, rctx, { start, days = 7, admin = false } = {}) {
  const from = start && parseIso(start) ? start : mondayOf(rctx.today);
  const n = Math.max(1, Math.min(42, parseInt(days, 10) || 7));
  const to = addDays(from, n - 1);
  const names = new Map(rctx.members.map(m => [m.id, m]));
  const shifts = doc.shifts.filter(s => active(s) && s.date >= from && s.date <= to).map(s => {
    const m = names.get(s.memberId) || { name: '?', initials: '?' };
    const wk = doc.weeks[weekOf(s)] || {};
    const out = { id: s.id, kind: kindOf(s), date: s.date, site: s.site || '', memberId: s.memberId, name: m.name, initials: m.initials, start: s.start || '', end: s.end || '', note: s.note || '',
      changed: !!(wk.emailedAt && s.changedAt > wk.emailedAt), ...(s.guiding ? { guiding: s.guiding } : {}) };
    if (admin) Object.assign(out, { v: s.v, history: s.history || [] });
    return out;
  }).sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'na') - (b.kind === 'na') || a.site.localeCompare(b.site) || a.start.localeCompare(b.start));
  const weeks = [];
  for (let w = mondayOf(from); w <= to; w = addDays(w, 7)) {
    const info = doc.weeks[w] || {};
    const out = { week: w, emailedAt: info.emailedAt || 0 };
    if (admin) Object.assign(out, { emailedBy: info.emailedBy || '', undo: info.lastImport ? { kind: info.lastImport.kind, at: info.lastImport.at, by: info.lastImport.by } : null });
    weeks.push(out);
  }
  // Staff see each person's Known as name and initials, nothing else.
  const members = rctx.members.filter(m => !m.retired).map(m => ({ id: m.id, name: m.name, initials: m.initials }));
  const locations = rctx.locations.filter(l => !l.retired).map(l => ({ code: l.code, name: l.name, kind: l.kind }));
  const tours = (rctx.tours || []).filter(t => !t.retired).map(t => ({ id: t.id, name: t.name, location: t.location, durationMins: t.durationMins, sessions: t.sessions }));
  return { rev: doc.rev, from, to, today: rctx.today, shifts, weeks, members, locations, tours };
}
