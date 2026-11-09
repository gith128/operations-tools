// Release check: run `npm run check` before every delivery or deploy.
// Confirms the folder is a complete, consistent copy of the app that Netlify can deploy as-is.
import { readFile, readdir, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const problems = [], notes = [];
const exists = p => access(join(ROOT, p)).then(() => true, () => false);
const text = p => readFile(join(ROOT, p), 'utf8');

// 1. Everything the live site needs is here.
const REQUIRED = [
  'package.json', 'package-lock.json', 'netlify.toml', 'DEPLOY_NOTES.md', 'docs/manual.md', 'tools/build_help.py',
  'netlify/functions/ops.mjs', 'netlify/functions/backup-nightly.mjs', 'netlify/lib/ops-core.mjs', 'netlify/lib/backup-core.mjs', 'netlify/lib/roster-core.mjs',
  'tools/verify-backup.mjs', 'public/roster.html',
  'public/index.html', 'public/robots.txt', 'public/assets/ops-client.js', 'public/assets/ops-plus.js', 'public/assets/scan.js',
  'public/assets/vendor/html5-qrcode.min.js', 'public/assets/vendor/zxing-reader.js', 'public/assets/vendor/zxing_reader.wasm',
  'public/assets/vendor/libphonenumber-min.js', 'public/assets/vendor/qrcode-generator.js',
];
for (const f of REQUIRED) if (!(await exists(f))) problems.push('Missing: ' + f);

// 2. Nothing stray at the top level (copies there invite editing the wrong file).
const ALLOWED = new Set(['.git', '.gitignore', '.netlify', 'node_modules', 'DEPLOY_NOTES.md', 'README.md', 'docs', 'netlify', 'netlify.toml',
  'package.json', 'package-lock.json', 'public', 'tests', 'tools']);
for (const e of await readdir(ROOT)) if (!ALLOWED.has(e)) problems.push('Stray file or folder at the top level: ' + e + ' (delete it; the real one is under public/, netlify/, docs/, tests/ or tools/)');

// 3. Every page route in netlify.toml has its page.
const toml = await text('netlify.toml');
for (const [, to] of toml.matchAll(/to\s*=\s*"\/([\w-]+\.html)"/g)) if (!(await exists('public/' + to))) problems.push('netlify.toml routes to a missing page: public/' + to);
if (!/publish\s*=\s*"public"/.test(toml)) problems.push('netlify.toml should publish "public"');
if (!/functions\s*=\s*"netlify\/functions"/.test(toml)) problems.push('netlify.toml should use netlify/functions');

// 4. One version everywhere.
// The version shown on every page is package.json's, without a trailing .0 (3.9.0 → v3.9, 3.9.1 → v3.9.1).
const version = JSON.parse(await text('package.json')).version.replace(/\.0$/, '');
const label = 'v' + version;
for (const f of (await readdir(join(ROOT, 'public'))).filter(f => f.endsWith('.html'))) {
  const t = await text('public/' + f);
  const found = [...t.matchAll(/Operations Tools (v\d+\.\d+(?:\.\d+)?)/g)].map(m => m[1]);
  if (!found.length) problems.push(`public/${f} has no version label`);
  for (const v of new Set(found)) if (v !== label) problems.push(`public/${f} says ${v}, package.json says ${label}`);
}
const core = await text('netlify/lib/ops-core.mjs');
if (!core.includes(`APP_VERSION = '${version}'`)) problems.push(`APP_VERSION in ops-core.mjs isn't '${version}'`);
if (!(await text('DEPLOY_NOTES.md')).startsWith('# SA eBikes Operations Tools ' + label + '\n')) problems.push('DEPLOY_NOTES.md heading isn\'t ' + label);
if (!toml.startsWith('# SA eBikes Operations Tools ' + label + '\n')) problems.push('netlify.toml first line isn\'t ' + label);

// 5. The Help page is built from the current manual.
const py = spawnSync('python3', ['tools/build_help.py', '--check'], { cwd: ROOT, encoding: 'utf8' });
if (py.error || /No module named/.test(py.stderr || '')) notes.push('Skipped the Help page check (needs python3 and "pip install markdown")');
else if (py.status !== 0) problems.push((py.stdout || py.stderr).trim());

// 6. The server code loads, and the API function loads when its dependency is installed.
try { await import(new URL('../netlify/lib/ops-core.mjs', import.meta.url)); } catch (e) { problems.push('ops-core.mjs doesn\'t load: ' + e.message); }
if (await exists('node_modules/@netlify/blobs')) {
  for (const f of ['ops.mjs', 'backup-nightly.mjs']) {
    try { const m = await import(new URL('../netlify/functions/' + f, import.meta.url)); if (typeof m.default !== 'function') problems.push(f + ' has no default export'); }
    catch (e) { problems.push(f + ' doesn\'t load: ' + e.message); }
  }
} else notes.push('Skipped loading the Netlify functions (run npm install first)');

// 7. The automated tests.
const t = spawnSync(process.execPath, ['--test', ...(await readdir(join(ROOT, 'tests'))).filter(f => f.endsWith('.test.mjs')).map(f => 'tests/' + f)], { cwd: ROOT, encoding: 'utf8' });
const pass = /# pass (\d+)/.exec(t.stdout || ''), fail = /# fail (\d+)/.exec(t.stdout || '');
if (t.status !== 0) problems.push('Tests failed: ' + (fail ? fail[1] : '?') + ' failing\n' + (t.stdout || '').split('\n').filter(l => l.startsWith('not ok')).join('\n'));
else notes.push(`Tests: ${pass ? pass[1] : '?'} passing`);

for (const n of notes) console.log('· ' + n);
if (problems.length) { console.log('\n✗ Not ready to deploy:\n' + problems.map(p => '  - ' + p).join('\n')); process.exit(1); }
console.log(`\n✓ ${label} is complete and ready to deploy`);
