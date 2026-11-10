// v3.11: messages to staff, normal and urgent, with who has seen each (Admin only).
import test from 'node:test';
import assert from 'node:assert/strict';
import { memStore } from './memstore.mjs';
import { handleAction, handleView } from '../netlify/lib/ops-core.mjs';
import { takeSnapshot, SECTIONS } from '../netlify/lib/backup-core.mjs';

const p = o => new URLSearchParams(o);
const ADMIN = { admin: { configured: true, ok: true } };
const STAFF = { admin: { configured: true, ok: false } };
const post = (s, id, level, title = 'Long weekend') => handleAction(s, { action: 'postBroadcast', by: 'SO', from: 'Shayne', message: { id, title, body: 'All hands from 8:30', level } }, ADMIN);

test('a message goes to every phone until each person taps Got it; staff see no counts', async () => {
  const s = memStore();
  await s.setJSON('team', { rev: 1, members: [{ id: 'm1', name: 'Sam', initials: 'SO' }, { id: 'm2', name: 'Jo', initials: 'JB' }, { id: 'm3', name: 'Ex', initials: 'EX', retired: true }] });
  assert.equal((await post(s, 'bc000001', 'normal')).result, 'sent');
  assert.equal((await post(s, 'bc000001', 'normal')).result, 'already-saved', 'a retry sends nothing twice');
  let v = await handleView(s, p({ view: 'settings', me: 'm1' }));
  assert.deepEqual(v.broadcasts.map(b => [b.title, b.level, b.seen, b.by]), [['Long weekend', 'normal', false, 'Shayne']]);
  assert.equal(JSON.stringify(v.broadcasts).includes('acks'), false, 'no one else\'s Got it on the phone');
  const r = await handleAction(s, { action: 'ackBroadcast', id: 'bc000001', me: 'm1', name: 'Sam' }, STAFF);
  assert.equal(r.broadcasts[0].seen, true);
  assert.equal((await handleView(s, p({ view: 'settings', me: 'm2' }))).broadcasts[0].seen, false, 'still showing for Jo');
  const a = await handleView(s, p({ view: 'broadcastsAdmin' }), ADMIN);
  assert.deepEqual(a.items[0].seen.map(x => x.name), ['Sam']);
  assert.deepEqual(a.items[0].notSeen, ['Jo'], 'retired staff aren\'t waited on');
  await assert.rejects(handleView(s, p({ view: 'broadcastsAdmin' }), STAFF), e => e.code === 'admin-required');
});

test('urgent messages show on the Group Scanner until withdrawn; only Admin sends or withdraws', async () => {
  const s = memStore();
  await post(s, 'bc000002', 'urgent', 'EB-012 recalled: do not hire');
  let v = await handleView(s, p({ view: 'scanner' }));
  assert.deepEqual(v.urgent.map(u => u.title), ['EB-012 recalled: do not hire']);
  await handleAction(s, { action: 'ackBroadcast', id: 'bc000002', me: 'm1', name: 'Sam' }, STAFF);
  assert.equal((await handleView(s, p({ view: 'scanner' }))).urgent.length, 1, 'Got it doesn\'t take it off the scanner');
  await assert.rejects(handleAction(s, { action: 'withdrawBroadcast', id: 'bc000002' }, STAFF), e => e.code === 'admin-required');
  await assert.rejects(handleAction(s, { action: 'postBroadcast', message: { id: 'bc000009', title: 'x', level: 'normal' } }, STAFF), e => e.code === 'admin-required');
  await handleAction(s, { action: 'withdrawBroadcast', id: 'bc000002', by: 'SO' }, ADMIN);
  assert.equal((await handleView(s, p({ view: 'scanner' }))).urgent.length, 0);
  assert.equal((await handleView(s, p({ view: 'settings' }))).broadcasts.length, 0, 'gone from the home screen too');
  assert.equal((await handleView(s, p({ view: 'broadcastsAdmin' }), ADMIN)).items[0].active, false, 'kept in Admin\'s list');
  await assert.rejects(post(s, 'bc000003', 'loud'), /normal or urgent/);
  await assert.rejects(post(s, 'bc000004', 'normal', ''), /Heading is required/);
});

test('messages to staff are in the backups, with the team', async () => {
  const s = memStore();
  await post(s, 'bc000005', 'normal');
  assert.deepEqual(SECTIONS.find(x => x.id === 'team').files, ['team', 'broadcasts']);
  const r = await takeSnapshot(s, memStore(), { reason: 'manual' });
  assert.equal(r.files.broadcasts.count, 1);
});
