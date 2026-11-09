// Checks an off-site backup file (SA-eBikes-backup-<date>.json from Admin → Download off-site copy).
//   node tools/verify-backup.mjs SA-eBikes-backup-2026-11-01.json
// Re-checks every part against the checksum it was downloaded with, counts the records, and checks
// that every lost-property photo and daily archive is there and readable. Prints no customer details.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { LIVE_FILES } from '../netlify/lib/backup-core.mjs';

const file = process.argv[2];
if (!file) { console.log('Usage: node tools/verify-backup.mjs <backup file>'); process.exit(2); }
let f;
try { f = JSON.parse(readFileSync(file, 'utf8')); }
catch (e) { console.log('✗ Not a readable backup file: ' + e.message); process.exit(1); }
if (f.format !== 'sa-ebikes-ops-backup') { console.log('✗ This isn\'t an Operations Tools backup file'); process.exit(1); }

const sha = t => createHash('sha256').update(t).digest('hex');
const when = new Date(f.exportedAt).toLocaleString('en-AU', { timeZone: 'Australia/Adelaide' });
console.log(`Backup from Operations Tools v${f.appVersion || '?'}, downloaded ${when}${f.exportedBy ? ' by ' + f.exportedBy : ''}\n`);
const problems = [];
for (const [key, count] of Object.entries(LIVE_FILES)) {
  const part = (f.files || {})[key];
  if (!part) { console.log(`  · ${key.padEnd(18)} not in this file (not created yet)`); continue; }
  const ok = sha(JSON.stringify(part.data)) === part.sha;
  if (!ok) problems.push(key + ' failed its checksum');
  console.log(`  ${ok ? '✓' : '✗'} ${key.padEnd(18)} ${String(count(part.data)).padStart(5)} records`);
}
const items = (((f.files || {})['lost-property'] || {}).data || {}).items || [];
const wanted = items.filter(i => i.hasPhoto).map(i => i.id);
const missingPhotos = wanted.filter(id => !(f.photos || {})[id]);
if (missingPhotos.length) problems.push(missingPhotos.length + ' lost-property photo(s) missing');
console.log(`\n  Photos: ${wanted.length - missingPhotos.length} of ${wanted.length}`);
const arch = Object.keys(f.archives || {}).sort();
const unreadable = arch.filter(k => !f.archives[k] || !f.archives[k].day);
if (unreadable.length) problems.push(unreadable.length + ' daily archive(s) unreadable');
console.log(`  Daily archives: ${arch.length}${arch.length ? ` (${arch[0].split('/')[1]} to ${arch[arch.length - 1].split('/')[1]})` : ''}${unreadable.length ? `, ${unreadable.length} unreadable` : ''}`);
if (problems.length) { console.log('\n✗ ' + problems.join('; ')); process.exit(1); }
console.log('\n✓ Every part matches its checksum. This copy is complete.');
