// SA eBikes Operations Tools v3.12 — API at /api/ops
// Storage: Netlify Blobs (built into Netlify, no external account or API key).
// The live site uses the stores it always has. A deploy preview or branch deploy gets its own,
// so a new version can be tried without touching live data (see backup-core.mjs).
import { getStore } from '@netlify/blobs';
import { createHash, timingSafeEqual } from 'node:crypto';
import { handleView, handleAction, HttpError } from '../lib/ops-core.mjs';
import { deployContextOf, storeNames } from '../lib/backup-core.mjs';

const MIN_PIN_LENGTH = 6;
const MIN_ADMIN_LENGTH = 8;
const MAX_BODY = 300_000;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

const sha = s => createHash('sha256').update(String(s)).digest();

// The staff PIN is mandatory. Without it, anyone who found the URL could read
// customer names and phone numbers or wipe the data.
function checkPin(req, env) {
  const required = env.SAEBIKES_STAFF_PIN || '';
  if (required.length < MIN_PIN_LENGTH) {
    return json(503, {
      error: 'Staff PIN is not set up',
      fix: `Set SAEBIKES_STAFF_PIN (at least ${MIN_PIN_LENGTH} characters) in Netlify > Site configuration > Environment variables, then redeploy.`,
      code: 'pin-not-configured',
    });
  }
  const supplied = req.headers.get('x-saebikes-staff-pin') || '';
  if (!supplied) return json(401, { error: 'Staff PIN required', code: 'pin-required' });
  if (!timingSafeEqual(sha(supplied), sha(required))) {
    return new Promise(r => setTimeout(() => r(json(403, { error: 'Incorrect staff PIN', code: 'pin-wrong' })), 600));
  }
  return null;
}

// The admin password, a second shared password for Admin and the roster (ops-core.mjs decides
// what needs it). Not set, or shorter than 8 characters: Admin works with the staff PIN, but
// contact details can't be stored.
function adminState(req, env) {
  const required = env.SAEBIKES_ADMIN_PASSWORD || '';
  const configured = required.length >= MIN_ADMIN_LENGTH;
  const supplied = req.headers.get('x-saebikes-admin-password') || '';
  return { configured, tooShort: !configured && required.length > 0, supplied: !!supplied, ok: configured && !!supplied && timingSafeEqual(sha(supplied), sha(required)) };
}

export default async (req, context) => {
  try {
    const env = process.env;
    const denied = await checkPin(req, env);
    if (denied) return denied;

    const deployContext = deployContextOf(req, context);
    const names = storeNames(deployContext);
    const store = getStore({ name: names.live, consistency: 'strong' });
    const backups = getStore({ name: names.backups, consistency: 'strong' });
    const ctx = { backups, liveBackups: names.isLive ? backups : getStore({ name: names.liveBackups, consistency: 'strong' }), isLive: names.isLive, deployContext, admin: adminState(req, env) };

    if (req.method === 'GET') {
      return json(200, await handleView(store, new URL(req.url).searchParams, ctx));
    }
    if (req.method === 'POST') {
      const text = await req.text();
      if (!text || text.length > MAX_BODY) return json(413, { error: 'Request missing or too large', code: 'too-large' });
      let body;
      try { body = JSON.parse(text); } catch { return json(400, { error: 'Invalid JSON', code: 'invalid' }); }
      return json(200, await handleAction(store, body, ctx));
    }
    return json(405, { error: 'Method not allowed', code: 'method' });
  } catch (e) {
    if (e instanceof HttpError) {
      // A wrong admin password is answered slowly, like a wrong PIN, so it can't be guessed quickly.
      if (e.code === 'admin-wrong') await new Promise(r => setTimeout(r, 600));
      return json(e.status, { error: e.message, code: e.code, ...e.extra });
    }
    console.error(e);
    return json(500, { error: 'Server error', detail: e && e.message ? e.message : String(e), code: 'server' });
  }
};

export const config = { path: '/api/ops' };
