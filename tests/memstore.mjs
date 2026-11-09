// In-memory stand-in for a Netlify Blobs store, for tests and the local dev server.
// Supports conditional writes, text and JSON reads, listing and deleting.
// `failWhen(op, key)` can be set to make a call throw, to test half-finished work.
export function memStore() {
  const m = new Map(); let n = 0;
  const s = {
    m, failWhen: null,
    check(op, key) { if (s.failWhen && s.failWhen(op, key)) throw new Error(`simulated ${op} failure on ${key}`); },
    async getWithMetadata(k, o = {}) { s.check('get', k); const v = m.get(k); return v ? { data: o.type === 'text' ? v.body : JSON.parse(v.body), etag: v.etag, metadata: {} } : null; },
    async get(k, o = {}) { s.check('get', k); const v = m.get(k); if (!v) return null; return o.type === 'text' ? v.body : JSON.parse(v.body); },
    async set(k, text, o = {}) { s.check('set', k); return s.write(k, String(text), o); },
    async setJSON(k, data, o = {}) { s.check('set', k); return s.write(k, JSON.stringify(data), o); },
    write(k, body, o) {
      const cur = m.get(k);
      if (o.onlyIfNew && cur) return { modified: false };
      if (o.onlyIfMatch && (!cur || cur.etag !== o.onlyIfMatch)) return { modified: false };
      const etag = 'e' + (++n); m.set(k, { body, etag }); return { modified: true, etag };
    },
    async delete(k) { s.check('delete', k); m.delete(k); },
    async list({ prefix = '' } = {}) { s.check('list', prefix); return { blobs: [...m.keys()].filter(k => k.startsWith(prefix)).sort().map(key => ({ key, etag: m.get(key).etag })), directories: [] }; },
  };
  return s;
}
