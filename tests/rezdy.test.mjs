// v3.4: every Rezdy product seen is remembered with the location it matched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { memStore } from './memstore.mjs';
import { handleAction, handleView } from '../netlify/lib/ops-core.mjs';
import { takeSnapshot } from '../netlify/lib/backup-core.mjs';

const p = o => new URLSearchParams(o);
const load = (date, loadId, groups) => ({ action: 'loadManifest', by: 'SO', manifestDate: date, manifestDateDisplay: date, loadId, contacts: [], groups });
const g = (id, product, site) => ({ id, name: id + ' (x2)', product, site });

test('products seen: counted per booking, first and last seen, last matched location; a retried load is not counted twice', async () => {
  const s = memStore();
  await handleAction(s, load('2026-10-16', 'l1', [g('grpA1', 'Full Day Hire - McLaren Vale Visitor Centre', 'VIC'), g('grpA2', 'Full Day Hire - McLaren Vale Visitor Centre', 'VIC'), g('grpA3', 'eTukTuk Adventure from Oxenberry Farm', 'OXB')]));
  await handleAction(s, load('2026-10-16', 'l1', [g('grpA1', 'Full Day Hire - McLaren Vale Visitor Centre', 'VIC')])); // the same load, retried
  await handleAction(s, load('2026-10-18', 'l2', [g('grpB1', 'Full Day Hire - McLaren Vale Visitor Centre', 'VIC'), g('grpB2', 'Nil', '')]));
  const v = await handleView(s, p({ view: 'rezdyProducts' }));
  const vic = v.products.find(x => x.name.startsWith('Full Day Hire - McLaren'));
  assert.equal(vic.bookings, 3);
  assert.equal(vic.firstSeen, '2026-10-16');
  assert.equal(vic.lastSeen, '2026-10-18');
  assert.equal(vic.site, 'VIC');
  assert.equal(v.products[0].name, vic.name, 'most-booked first');
  assert.equal(v.products.find(x => x.name === 'Nil').site, '', 'an unmatched product is kept, with no location');
  assert.equal(v.products.length, 3);
});

test('products seen are in every backup', async () => {
  const s = memStore();
  await handleAction(s, load('2026-10-16', 'l1', [g('grpA1', 'Full Day Hire - Oxenberry Farm', 'OXB')]));
  const r = await takeSnapshot(s, memStore(), { prune: false });
  assert.equal(r.files['rezdy-products'].count, 1);
});
