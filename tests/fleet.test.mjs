// v3.6: per-bike daily records, rebuilt history, register change history, and the report's sums.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { memStore } from './memstore.mjs';
import { handleAction, handleView } from '../netlify/lib/ops-core.mjs';
import { adlAt, registerAt, diffAssets, hiresOn, buildFleetDay } from '../netlify/lib/fleet-core.mjs';
import { takeSnapshot } from '../netlify/lib/backup-core.mjs';

const p = o => new URLSearchParams(o);
const act = (s, body) => handleAction(s, { by: 'SO', ...body });
const adminCtx = { admin: { configured: false } };
const fleetDays = async s => (await s.get('fleet-days')) || { days: {} };
// The report's sums, loaded as the browser loads them.
const FleetCore = new Function((await readFile(new URL('../public/assets/fleet-report.js', import.meta.url), 'utf8')) + '; return FleetCore;')();

async function fleet() {
  const s = memStore();
  await act(s, { action: 'importAssets', assets: [
    { id: 'EB-001', serial: 'S1', brand: 'Gazelle', model: 'T3', purchaseDate: '2024-01-01', location: 'VIC' },
    { id: 'EB-002', serial: 'S2', brand: 'Gazelle', model: 'T3', purchaseDate: '2024-01-01', location: 'VIC' },
    { id: 'EB-003', serial: 'S3', brand: 'Benno', model: 'Brando', purchaseDate: '2024-01-01', location: 'OXB' },
    { id: 'EB-004', serial: 'S4', brand: 'Benno', model: 'Brando', purchaseDate: '2024-01-01', location: 'HOM' },
    { id: 'EB-005', serial: 'S5', brand: 'Gazelle', model: 'T3', purchaseDate: '2026-05-01', location: 'VIC' }] });
  return s;
}
const load = (s, date, groups, extra = {}) => act(s, { action: 'loadManifest', manifestDate: date, manifestDateDisplay: date, loadId: 'L' + date + (extra.n || ''), groups, contacts: [], ...extra });
const scan = (s, groupId, code, n) => act(s, { action: 'addBike', groupId, bike: { id: 'scan' + code.replace('-', '') + (n || ''), code, ts: 1000 } });

test('Adelaide opening time, in and out of daylight saving', () => {
  assert.equal(new Date(adlAt('2026-01-10', 8)).toISOString(), '2026-01-09T21:30:00.000Z');
  assert.equal(new Date(adlAt('2026-07-10', 8)).toISOString(), '2026-07-09T22:30:00.000Z');
});

test('a day\'s records are written when the next manifest loads: hired, available, storage, not yet bought', async () => {
  const s = await fleet();
  await load(s, '2026-03-02', [{ id: 'grpA1', name: 'Smith (x2)', site: 'VIC' }, { id: 'grpB1', name: 'Lane (x1)', site: 'OXB' }]);
  await scan(s, 'grpA1', 'EB-001'); await scan(s, 'grpA1', 'EB-002'); await scan(s, 'grpB1', 'EB-003');
  assert.deepEqual((await fleetDays(s)).days, {}, 'nothing is frozen until the day is over');
  await load(s, '2026-03-03', [{ id: 'grpC1', name: 'Jones (x1)', site: 'VIC' }]);
  const r = (await fleetDays(s)).days['2026-03-02'];
  assert.equal(r.src, 'live'); assert.equal(r.manifest, true);
  assert.deepEqual(r.bikes['EB-001'], { m: 'T3', l: 'VIC', s: 'h', h: ['VIC'], n: 1, d: 1 });
  assert.deepEqual(r.bikes['EB-003'], { m: 'Brando', l: 'OXB', s: 'h', h: ['OXB'], n: 1, d: 1 });
  assert.equal(r.bikes['EB-004'].s, 's', 'at HOM: storage, not available');
  assert.equal(r.bikes['EB-005'], undefined, 'bought in May: not in the fleet yet');
});

test('a record doesn\'t change when the register does, and the change is in the register history', async () => {
  const s = await fleet();
  await load(s, '2026-03-02', [{ id: 'grpA1', name: 'Smith (x1)', site: 'VIC' }]);
  await scan(s, 'grpA1', 'EB-001');
  await load(s, '2026-03-03', [{ id: 'grpC1', name: 'Jones (x1)', site: 'VIC' }]);
  const a = (await s.get('assets')).assets.find(x => x.id === 'EB-002');
  await act(s, { action: 'saveAsset', originalId: 'EB-002', baseV: a.v, by: 'JB', asset: { ...a, model: 'T3 Plus' } });
  assert.equal((await fleetDays(s)).days['2026-03-02'].bikes['EB-002'].m, 'T3');
  const h = await handleView(s, p({ view: 'assetHistory', bike: 'EB-002' }));
  assert.equal(h.entries[0].how, 'edited'); assert.equal(h.entries[0].by, 'JB');
  assert.deepEqual(h.entries[0].changes, { model: ['T3', 'T3 Plus'] });
  assert.ok(!(await s.get('assets')).historyQueue, 'the queue is cleared once the history is saved');
  // added by the spreadsheet import, with the import noted
  const all = await handleView(s, p({ view: 'assetHistory' }));
  assert.equal(all.entries.filter(e => e.how === 'added' && e.via === 'import').length, 5);
});

test('a history save cut off after the register save is finished by the next register save', async () => {
  const s = await fleet();
  let failed = false;
  s.failWhen = (op, k) => { if (!failed && op === 'set' && k === 'asset-history') { failed = true; return true; } return false; };
  const a = (await s.get('assets')).assets.find(x => x.id === 'EB-003');
  await act(s, { action: 'saveAsset', originalId: 'EB-003', baseV: a.v, asset: { ...a, size: 'L' } });
  assert.equal((await s.get('assets')).historyQueue.length, 1, 'kept in the register');
  const v = await handleView(s, p({ view: 'assetHistory', bike: 'EB-003' }));
  assert.equal(v.entries[0].changes.size[1], 'L', 'shown even before it moves across');
  const b = (await s.get('assets')).assets.find(x => x.id === 'EB-004');
  await act(s, { action: 'saveAsset', originalId: 'EB-004', baseV: b.v, asset: { ...b, size: 'M' } });
  const h = await s.get('asset-history');
  assert.equal(h.entries.filter(e => e.bike === 'EB-003' && e.changes.size).length, 1, 'moved once, not twice');
  assert.ok(!(await s.get('assets')).historyQueue);
});

test('a multi-day hire counts on each day, with its day number', async () => {
  const s = await fleet();
  await load(s, '2026-03-02', [{ id: 'grpA1', name: 'Smith (x1)', site: 'BER', hireDays: 2 }]);
  await scan(s, 'grpA1', 'EB-001');
  await load(s, '2026-03-03', [{ id: 'grpC1', name: 'Jones (x1)', site: 'VIC' }]);
  await load(s, '2026-03-04', [{ id: 'grpD1', name: 'Kim (x1)', site: 'VIC' }]);
  const d = (await fleetDays(s)).days;
  assert.deepEqual([d['2026-03-02'].bikes['EB-001'].d, d['2026-03-03'].bikes['EB-001'].d], [1, 2]);
  assert.deepEqual(d['2026-03-03'].bikes['EB-001'].h, ['BER']);
});

test('days with no manifest: bikes available and none hired, except a group still out', async () => {
  const s = await fleet();
  await load(s, '2026-03-02', [{ id: 'grpA1', name: 'Smith (x1)', site: 'VIC' }, { id: 'grpB1', name: 'Lane (x1)', site: 'VIC' }]);
  await scan(s, 'grpA1', 'EB-001'); await scan(s, 'grpB1', 'EB-002');
  await act(s, { action: 'checkIn', groupId: 'grpB1', bikeId: 'scanEB002', at: adlAt('2026-03-02', 15) });
  await act(s, { action: 'setGroupStatus', groupId: 'grpB1', status: 'returned', at: adlAt('2026-03-02', 15) });
  await load(s, '2026-03-05', [{ id: 'grpC1', name: 'Jones (x1)', site: 'VIC' }]);
  const d = (await fleetDays(s)).days;
  assert.deepEqual(Object.keys(d).sort(), ['2026-03-02', '2026-03-03', '2026-03-04']);
  assert.equal(d['2026-03-03'].manifest, false);
  assert.equal(d['2026-03-03'].bikes['EB-001'].s, 'h', 'never checked in: still out');
  assert.equal(d['2026-03-03'].bikes['EB-001'].d, 2);
  assert.equal(d['2026-03-03'].bikes['EB-003'].s, 'a');
});

test('out of service at opening: a P5 logged in the afternoon counts from the next day', () => {
  const ctx = { assets: [{ id: 'EB-001', model: 'T3', location: 'VIC' }], history: { entries: [] }, moves: [], locations: [{ code: 'VIC', kind: 'hire' }],
    issues: [{ bikeId: 'EB-001', priority: 5, reportedAt: adlAt('2026-03-02', 16), status: 'resolved', resolvedAt: adlAt('2026-03-04', 12), updates: [] }] };
  const st = d => buildFleetDay(d, [], ctx, { manifest: true }).bikes['EB-001'].s;
  assert.deepEqual([st('2026-03-02'), st('2026-03-03'), st('2026-03-04'), st('2026-03-05')], ['a', 'o', 'o', 'a']);
});

test('the register as it stood: edits and removals undone, renames followed', () => {
  const assets = [{ id: 'EB-099', model: 'T3 Plus', purchaseDate: '2024-01-01' }];
  const t1 = adlAt('2026-03-01', 8), t2 = adlAt('2026-04-01', 8);
  const history = { startedAt: 1, entries: [
    ...diffAssets([{ id: 'EB-009', model: 'T3' }], [{ id: 'EB-099', model: 'T3' }], { renames: [{ from: 'EB-009', to: 'EB-099' }], at: t1 + 1000 }),
    ...diffAssets([{ id: 'EB-099', model: 'T3' }, { id: 'EB-050', model: 'Surf', purchaseDate: '2024-01-01' }], [{ id: 'EB-099', model: 'T3 Plus' }], { at: t2 + 1000 })] };
  const { recs, cur } = registerAt(assets, history, t1);
  assert.equal(recs.get('EB-099').model, 'T3');
  assert.equal(recs.get('EB-050').model, 'Surf', 'removed later: back in the register for that day');
  assert.equal(cur('EB-009'), 'EB-099');
  assert.equal(registerAt(assets, history, t2 + 5000).recs.get('EB-099').model, 'T3 Plus');
  // a hire under the old barcode counts against the bike as it's known now
  const h = hiresOn('2026-03-01', [{ manifestDate: '2026-03-01', groups: [{ id: 'g', site: 'VIC', bikes: [{ code: 'EB-009', model: 'T3' }] }] }], cur);
  assert.ok(h.has('EB-099'));
});

test('rebuild from the archives: past days as they were, estimates marked, live records kept, dry run writes nothing', async () => {
  const s = await fleet();
  await load(s, '2026-03-02', [{ id: 'grpA1', name: 'Smith (x1)', site: 'VIC' }]);
  await scan(s, 'grpA1', 'EB-001');
  await load(s, '2026-03-03', [{ id: 'grpC1', name: 'Jones (x1)', site: 'OXB' }]);
  await scan(s, 'grpC1', 'EB-003');
  await load(s, '2026-03-04', [{ id: 'grpD1', name: 'Kim (x1)', site: 'VIC' }]);
  // as if v3.6 had arrived only now: no records yet, and the 3rd's history and moves both start later
  const live2 = (await fleetDays(s)).days['2026-03-02'];
  await s.setJSON('fleet-days', { rev: 1, days: { '2026-03-02': live2 } });
  await s.setJSON('moves', { rev: 1, moves: [{ id: 'mv1', at: Date.now() + 1, bike: 'EB-002', from: 'OXB', to: 'VIC', how: 'hand' }] });
  const pv = await handleAction(s, { action: 'rebuildFleet', month: '2026-03', dryRun: true }, adminCtx);
  assert.equal(pv.kept, 1);
  // EB-001 was never checked in, so it was still out on the 3rd as well as EB-003
  assert.deepEqual(pv.days.map(d => [d.date, d.hired]), [['2026-03-03', 2]]);
  assert.equal((await fleetDays(s)).days['2026-03-03'], undefined, 'a preview saves nothing');
  await handleAction(s, { action: 'rebuildFleet', month: '2026-03' }, adminCtx);
  const d = (await fleetDays(s)).days;
  assert.equal(d['2026-03-02'].src, 'live', 'the live record is kept');
  assert.equal(d['2026-03-03'].src, 'rebuilt');
  assert.deepEqual(d['2026-03-03'].bikes['EB-003'], { m: 'Brando', l: 'OXB', s: 'h', h: ['OXB'], n: 1, d: 1, e: 'l' }, 'model from the scan, so not estimated');
  assert.equal(d['2026-03-03'].bikes['EB-002'].l, 'OXB', 'the move since is undone');
  assert.equal(d['2026-03-03'].bikes['EB-002'].e, 'ml');
  const again = await handleAction(s, { action: 'rebuildFleet', month: '2026-03', dryRun: true }, adminCtx);
  assert.equal(again.days.filter(x => x.changed).length, 0, 'rebuilding again changes nothing');
  await assert.rejects(handleAction(s, { action: 'rebuildFleet', month: '2026-03' }, { admin: { configured: true, ok: false } }), e => e.code === 'admin-required');
});

test('the report view: records in the period, plus today so far', async () => {
  const s = await fleet();
  await load(s, '2026-03-02', [{ id: 'grpA1', name: 'Smith (x1)', site: 'VIC' }]);
  await scan(s, 'grpA1', 'EB-001');
  await load(s, '2026-03-03', [{ id: 'grpC1', name: 'Jones (x1)', site: 'OXB' }]);
  await scan(s, 'grpC1', 'EB-003');
  const v = await handleView(s, p({ view: 'fleetReport', from: '2026-03-01', to: '2026-03-31' }));
  assert.deepEqual(Object.keys(v.days).sort(), ['2026-03-02', '2026-03-03']);
  assert.equal(v.days['2026-03-03'].src, 'today');
  assert.equal(v.days['2026-03-03'].bikes['EB-003'].s, 'h');
  await assert.rejects(handleView(s, p({ view: 'fleetReport', from: '2026-03-31', to: '2026-03-01' })), e => e.code === 'invalid');
});

test('report sums: utilisation by bike, model and hire location; days with no manifest', () => {
  const days = {
    '2026-03-02': { manifest: true, src: 'live', bikes: { 'EB-001': { m: 'T3', l: 'VIC', s: 'h', h: ['HMD'], n: 1, d: 1 }, 'EB-002': { m: 'T3', l: 'VIC', s: 'a' }, 'EB-003': { m: 'Brando', l: 'OXB', s: 'o' } } },
    '2026-03-03': { manifest: false, src: 'rebuilt', bikes: { 'EB-001': { m: 'T3', l: 'VIC', s: 'a', e: 'm' }, 'EB-002': { m: 'T3', l: 'VIC', s: 'h', h: ['VIC'], n: 2, d: 1 }, 'EB-003': { m: 'Brando', l: 'OXB', s: 'a' } } },
  };
  const bike = Object.fromEntries(FleetCore.aggregate(days, 'bike').map(r => [r.key, r]));
  assert.deepEqual([bike['EB-001'].available, bike['EB-001'].hired, bike['EB-001'].hires], [2, 1, 1]);
  assert.equal(bike['EB-003'].available, 1, 'not counted while out of service');
  const model = Object.fromEntries(FleetCore.aggregate(days, 'model').map(r => [r.key, r]));
  assert.equal(model.T3.util, 0.5);
  const loc = Object.fromEntries(FleetCore.aggregate(days, 'location').map(r => [r.key, r]));
  assert.deepEqual([loc.HMD.hired, loc.HMD.available, loc.VIC.available, loc.VIC.hired], [1, 1, 3, 1], 'a bike counts where it went out from');
  const q = FleetCore.quality(days);
  assert.deepEqual([q.bikeDays, q.estModel, q.noManifest], [6, 1, ['2026-03-03']]);
  const mo = FleetCore.monthly(days, 'model');
  assert.deepEqual(mo.months, ['2026-03']);
  assert.equal(mo.rows.find(r => r.key === 'T3').months['2026-03'].util, 0.5);
});

test('fleet records and the register history are in every backup', async () => {
  const s = await fleet();
  await load(s, '2026-03-02', [{ id: 'grpA1', name: 'Smith (x1)', site: 'VIC' }]);
  await load(s, '2026-03-03', [{ id: 'grpC1', name: 'Jones (x1)', site: 'VIC' }]);
  const b = memStore();
  const r = await takeSnapshot(s, b, { reason: 'manual' });
  assert.equal(r.files['fleet-days'].count, 1);
  assert.equal(r.files['asset-history'].count, 5);
});

test('the spreadsheet file opens as a zip with a sheet per tab', async () => {
  const XlsxLite = new Function((await readFile(new URL('../public/assets/xlsx-lite.js', import.meta.url), 'utf8')) + '; return XlsxLite;')();
  const bytes = XlsxLite.build([{ name: 'By bike', rows: [['Bike', 'Utilisation'], ['EB-001', 0.5], ['A & B <c>', 1]], pct: [1], widths: [12, 12] }, { name: 'Notes', rows: [['Plain text']] }]);
  const buf = Buffer.from(bytes);
  assert.equal(buf.readUInt32LE(0), 0x04034b50, 'a zip file');
  const text = buf.toString('latin1');
  for (const f of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/styles.xml']) assert.ok(text.includes(f), f);
  assert.ok(text.includes('A &amp; B &lt;c&gt;'), 'text is escaped');
  // every entry's checksum matches its contents
  const { crc32 } = await import('node:zlib');
  let off = 0, n = 0;
  while (buf.readUInt32LE(off) === 0x04034b50) {
    const crc = buf.readUInt32LE(off + 14), size = buf.readUInt32LE(off + 18), nameLen = buf.readUInt16LE(off + 26), extra = buf.readUInt16LE(off + 28);
    const data = buf.subarray(off + 30 + nameLen + extra, off + 30 + nameLen + extra + size);
    if (crc32) assert.equal(crc32(data) >>> 0, crc);
    off += 30 + nameLen + extra + size; n++;
  }
  assert.equal(n, 7);
});
