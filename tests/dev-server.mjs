// Local stand-in for Netlify, for browser testing only. Not deployed.
// node tests/dev-server.mjs  → http://localhost:8888  (PIN: testpin1)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { handleAction, handleView, HttpError } from '../netlify/lib/ops-core.mjs';

const PIN = 'testpin1', ROOT = new URL('../public/', import.meta.url).pathname;
import { memStore } from './memstore.mjs';
import { takeSnapshot } from '../netlify/lib/backup-core.mjs';
// DEV_CONTEXT=deploy-preview node tests/dev-server.mjs  → behaves like a preview (its own data,
// with one "live" backup available to load).
const CONTEXT = process.env.DEV_CONTEXT || 'production';
const store = memStore(), backups = memStore(), liveBackups = CONTEXT === 'production' ? backups : memStore();
const ctx = { backups, liveBackups, isLive: CONTEXT === 'production', deployContext: CONTEXT };
// The admin password: DEV_ADMIN_PASSWORD, "admintest1" unless set; DEV_ADMIN_PASSWORD=none runs without one.
const ADMIN_PW = process.env.DEV_ADMIN_PASSWORD === 'none' ? '' : (process.env.DEV_ADMIN_PASSWORD || 'admintest1');
const ctxFor = req => { const sup = req.headers['x-saebikes-admin-password'] || ''; const configured = ADMIN_PW.length >= 8; return { ...ctx, admin: { configured, tooShort: !configured && ADMIN_PW.length > 0, supplied: !!sup, ok: configured && !!sup && sup === ADMIN_PW } }; };
if (CONTEXT !== 'production') {
  const fake = memStore();
  await handleAction(fake, { action: 'loadManifest', manifestDate: '2026-11-01', manifestDateDisplay: '1 Nov 2026', groups: [{ id: 'grpLIVE1', name: 'Live Smith (x2)' }], contacts: [] });
  await takeSnapshot(fake, liveBackups, { reason: 'nightly' });
}
export let offline = false;
// /__dropreply?n=2 : the next n saves are carried out, but the reply never reaches the phone
// (as when signal drops mid-save), to test "Not confirmed" and safe retries.
let dropReplies = 0;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.txt': 'text/plain', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml' };
const routes = { '/': '/index.html', '/scanner': '/scanner.html', '/contacts': '/contacts.html', '/manifest': '/manifest.html', '/issues': '/issues.html', '/admin': '/admin.html', '/fleet': '/fleet.html', '/help': '/help.html', '/checklists': '/checklists.html', '/qr': '/qr.html', '/dashboard': '/dashboard.html', '/report': '/report.html', '/bike': '/bike.html', '/config': '/admin.html', '/lost': '/lost.html', '/roster': '/roster.html' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (s, b) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); };
  if (url.pathname === '/__offline') { offline = url.searchParams.get('on') === '1'; return send(200, { offline }); }
  if (url.pathname === '/__dropreply') { dropReplies = parseInt(url.searchParams.get('n') || '1', 10); return send(200, { dropReplies }); }
  if (url.pathname === '/__stats') return send(200, { requests: stats });
  if (url.pathname === '/api/ops') {
    stats++;
    if (offline) { req.socket.destroy(); return; }
    if (req.headers['x-saebikes-staff-pin'] !== PIN) return send(req.headers['x-saebikes-staff-pin'] ? 403 : 401, { error: 'PIN', code: req.headers['x-saebikes-staff-pin'] ? 'pin-wrong' : 'pin-required' });
    try {
      if (req.method === 'GET') return send(200, await handleView(store, url.searchParams, ctxFor(req)));
      let body = ''; for await (const c of req) body += c;
      await new Promise(r => setTimeout(r, 150)); // simulate network latency
      const out = await handleAction(store, JSON.parse(body), ctxFor(req));
      if (dropReplies > 0) { dropReplies--; req.socket.destroy(); return; }
      return send(200, out);
    } catch (e) { return e instanceof HttpError ? send(e.status, { error: e.message, code: e.code, ...e.extra }) : send(500, { error: e.message }); }
  }
  const file = routes[url.pathname] || url.pathname;
  try { const b = await readFile(join(ROOT, file)); res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end('not found'); }
}).listen(8888, () => console.log('dev server on http://localhost:8888 (' + CONTEXT + ')'));
let stats = 0;
