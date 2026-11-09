// v3.10: Business settings (name, logo, colours, font, country), the configuration file, and
// configuration as its own backup section.
import test from 'node:test';
import assert from 'node:assert/strict';
import { memStore } from './memstore.mjs';
import { handleAction, handleView } from '../netlify/lib/ops-core.mjs';
import { takeSnapshot, listSnapshots, restoreSnapshot, SECTIONS } from '../netlify/lib/backup-core.mjs';

const p = o => new URLSearchParams(o);
const ADMIN = { admin: { configured: true, ok: true } };
const act = (s, body, ctx = ADMIN) => handleAction(s, { by: 'SO', ...body }, ctx);
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('an upgrade shows SA eBikes as before: settings saved by v3.9 have no business yet', async () => {
  const s = memStore();
  await s.setJSON('app-settings', { rev: 4, faultTypes: [{ id: 'other', label: 'Other' }], repeatDays: 90, home: { order: [], hidden: [] } });
  const v = await handleView(s, p({ view: 'settings' }));
  assert.equal(v.business.name, 'SA eBikes');
  assert.deepEqual([v.brand.main, v.brand.bright, v.brand.font, v.brand.logo], ['#415b30', '#5fd64f', 'baloo', '/assets/brand/logo.png']);
  assert.equal((await handleView(memStore(), p({ view: 'brand' }))).brand.name, 'SA eBikes', 'a new installation too');
});

test('business details: saved by Admin, checked, and shown on every page', async () => {
  const s = memStore();
  const st = await handleView(s, p({ view: 'settings' }));
  const r = await act(s, { action: 'saveBusiness', baseRev: st.rev, business: { name: '  Fleurieu  Rides ', tagline: 'Ride on', main: '#123456', bright: '#ABCDEF', font: 'app', country: 'nz', showName: false, logo: PNG } });
  assert.deepEqual([r.settings.business.name, r.settings.business.main, r.settings.business.bright, r.settings.business.country, r.settings.business.showName], ['Fleurieu Rides', '#123456', '#abcdef', 'NZ', false]);
  const b = (await handleView(s, p({ view: 'brand' }))).brand;
  assert.equal(b.logo, PNG); assert.equal(b.font, 'app');
  await act(s, { action: 'saveBusiness', business: { logo: 'none' } });
  assert.equal((await handleView(s, p({ view: 'brand' }))).brand.logo, '', 'no logo');
  await act(s, { action: 'saveBusiness', business: { logo: '' } });
  assert.equal((await handleView(s, p({ view: 'brand' }))).brand.logo, '/assets/brand/logo.png', 'the standard logo');
  for (const [business, msg] of [[{ name: ' ' }, /required/], [{ main: 'green' }, /six-digit/], [{ font: 'comic' }, /font/], [{ country: 'Aus' }, /two-letter/],
    [{ logo: 'data:image/svg+xml;base64,AAAA' }, /PNG, JPEG or WebP/], [{ logo: 'data:image/png;base64,' + 'A'.repeat(95000) }, /too large/]])
    await assert.rejects(act(s, { action: 'saveBusiness', business }), e => e.code === 'invalid' && msg.test(e.message), JSON.stringify(business).slice(0, 40));
  await assert.rejects(act(s, { action: 'saveBusiness', business: { name: 'X' }, baseRev: st.rev }), e => e.code === 'changed');
  await assert.rejects(act(s, { action: 'saveBusiness', business: { name: 'X' } }, { admin: { configured: true, ok: false } }), e => e.code === 'admin-required');
});

test('the configuration file: downloaded, then loaded into another installation (after a backup)', async () => {
  const a = memStore();
  await act(a, { action: 'saveBusiness', business: { name: 'Fleurieu Rides', logo: PNG } });
  await act(a, { action: 'saveHomeTiles', order: ['scanner'], hidden: ['qr'] });
  const cfg = await handleView(a, p({ view: 'configExport' }));
  assert.equal(cfg.kind, 'operations-tools-configuration');
  assert.equal(cfg.sections.business.name, 'Fleurieu Rides');
  assert.ok(Array.isArray(cfg.sections.locations) && cfg.sections.locations.length);
  assert.equal(JSON.stringify(cfg).includes('"rev"'), false, 'no revision numbers in the file');

  const b = memStore(), backups = memStore();
  await act(b, { action: 'importAssets', assets: [{ id: 'EB-001', serial: 'S1', location: 'VIC' }] });
  const locs = cfg.sections.locations.map(l => l.code === 'VIC' ? { ...l, name: 'Main shop' } : l).concat([{ code: 'NEW', name: 'New site', kind: 'hire' }]);
  const r = await act(b, { action: 'configImport', config: { ...cfg, sections: { ...cfg.sections, locations: locs } }, sections: ['business', 'home', 'locations'] }, { ...ADMIN, backups });
  assert.deepEqual(r.loaded, ['business', 'home', 'locations']);
  assert.ok(r.backupId, 'a backup first');
  assert.equal((await listSnapshots(backups)).snapshots[0].reason, 'pre-config-load');
  const st = await handleView(b, p({ view: 'settings' }));
  assert.equal(st.business.name, 'Fleurieu Rides'); assert.deepEqual(st.home.hidden, ['qr']);
  const assets = await b.get('assets');
  assert.equal(assets.locations.find(l => l.code === 'VIC').name, 'Main shop');
  assert.ok(assets.locations.some(l => l.code === 'NEW'));
  assert.equal(assets.assets[0].id, 'EB-001', 'the register itself is untouched');
  await assert.rejects(act(b, { action: 'configImport', config: { kind: 'something-else' }, sections: ['business'] }), e => e.code === 'invalid');
  await assert.rejects(act(b, { action: 'configImport', config: cfg, sections: [] }), /Choose what to load/);
  await assert.rejects(handleView(b, p({ view: 'configExport' }), { admin: { configured: true, ok: false } }), e => e.code === 'admin-required');
});

test('configuration is its own backup section, restorable without touching anything else', async () => {
  assert.deepEqual(SECTIONS.find(x => x.id === 'config').files, ['app-settings', 'qr-links', 'message-templates', 'site-checklists']);
  const live = memStore(), backups = memStore();
  await act(live, { action: 'saveBusiness', business: { name: 'Before' } });
  await live.setJSON('issues', { rev: 1, issues: [] });
  const snap = await takeSnapshot(live, backups, { reason: 'manual' });
  await act(live, { action: 'saveBusiness', business: { name: 'After' } });
  await act(live, { action: 'reportIssue', issue: { id: 'iss0001', bikeId: 'EB-001', issue: 'x', priority: 3, reportedBy: 'SO', odometerUnreadable: true } });
  await restoreSnapshot(live, backups, backups, { id: snap.id, sections: ['config'], by: 'SO' });
  assert.equal((await handleView(live, p({ view: 'brand' }))).brand.name, 'Before');
  assert.equal((await live.get('issues')).issues.length, 1, 'issues left alone');
});
