// SPA80 cache helpers v1 (reviewed copy of the draft's cache.mjs). IndexedDB storage is used
// ONLY for ?mock=1 synthetic data; core.mjs refuses persistence in real mode.
export const CACHE_DEFAULTS = Object.freeze({ dbName: 'SPA80-Mock-Cache-v1', maxEntries: 64, maxBytes: 5_242_880 });
export const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

export function canonical(value) {
  const seen = new Set();
  const visit = (v, depth) => {
    if (depth > 16) throw new TypeError('Parameters are too deep');
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return JSON.stringify(v);
    if (typeof v === 'number' && Number.isFinite(v)) return JSON.stringify(v);
    if (typeof v !== 'object' || seen.has(v)) throw new TypeError('Unsupported parameters');
    seen.add(v);
    let out;
    if (Array.isArray(v)) out = '[' + v.map(x => visit(x === undefined ? null : x, depth + 1)).join(',') + ']';
    else {
      if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) throw new TypeError('Unsupported parameters');
      out = '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + visit(v[k], depth + 1)).join(',') + '}';
    }
    seen.delete(v); return out;
  };
  return visit(value, 0);
}

export function byteSize(value) { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }
function expiredKeys(rows, limits) {
  const remove = [], valid = [];
  for (const row of rows) {
    try {
      if (typeof row?.key !== 'string' || !Number.isFinite(row.savedAt)) throw new Error('Malformed cache row');
      valid.push({ ...row, measuredBytes: byteSize(row) });
    } catch (_) { if (typeof row?.key === 'string') remove.push(row.key); }
  }
  let total = valid.reduce((n, x) => n + x.measuredBytes, 0), count = valid.length;
  valid.sort((a, b) => a.savedAt - b.savedAt || a.key.localeCompare(b.key));
  for (const row of valid) {
    if (count <= limits.maxEntries && total <= limits.maxBytes) break;
    remove.push(row.key); count--; total -= row.measuredBytes;
  }
  return remove;
}

// Deterministic in-memory storage adapter for tests or a browser without IndexedDB.
export function createMemoryStorage(options = {}) {
  const limits = { ...CACHE_DEFAULTS, ...options }, records = new Map(), epochs = new Map();
  return {
    async getEpoch(scope) { return epochs.get(scope) || 0; },
    async get(key) { const row = records.get(key); return row && row.scopeEpoch === (epochs.get(row.scope) || 0) ? copy(row) : undefined; },
    async put(record, expectedEpoch) {
      const epoch = epochs.get(record.scope) || 0;
      if (epoch !== expectedEpoch) return false;
      records.set(record.key, copy({ ...record, scopeEpoch: epoch }));
      for (const key of expiredKeys([...records.values()], limits)) records.delete(key);
      return records.has(record.key);
    },
    async delete(key) { records.delete(key); },
    async deleteScope(scope) { const epoch = (epochs.get(scope) || 0) + 1; epochs.set(scope, epoch); for (const [key, value] of records) if (value.scope === scope) records.delete(key); return epoch; },
    async clear() { for (const scope of new Set([...epochs.keys(), ...[...records.values()].map(x => x.scope)])) epochs.set(scope, (epochs.get(scope) || 0) + 1); records.clear(); },
    async count() { return records.size; },
    close() {}
  };
}

export function createIndexedDBStorage(options = {}) {
  const settings = { ...CACHE_DEFAULTS, ...options }, idb = options.indexedDB || globalThis.indexedDB;
  if (!idb) return null;
  let open;
  const database = () => open || (open = new Promise((resolve, reject) => {
    const request = idb.open(settings.dbName, 1);
    let failed = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('scopes')) db.createObjectStore('scopes', { keyPath: 'scope' });
    };
    request.onerror = () => { failed = true; reject(new Error('CACHE_UNAVAILABLE')); };
    request.onblocked = () => { failed = true; reject(new Error('CACHE_BLOCKED')); };
    request.onsuccess = () => { const db = request.result; if (failed) { db.close(); return; } db.onversionchange = () => db.close(); resolve(db); };
  }));
  const transaction = async (mode, operation) => {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['entries', 'scopes'], mode), entries = tx.objectStore('entries'), scopes = tx.objectStore('scopes');
      let result;
      tx.oncomplete = () => resolve(result); tx.onerror = tx.onabort = () => reject(new Error('CACHE_TRANSACTION_FAILED'));
      const read = (request, fn) => { request.onsuccess = () => { try { fn(request.result); } catch (_) { tx.abort(); } }; };
      try { operation({ entries, scopes, read, done: value => { result = value; } }); } catch (_) { tx.abort(); }
    });
  };
  return {
    getEpoch(scope) { return transaction('readonly', ({ scopes, read, done }) => read(scopes.get(scope), row => done(row?.epoch || 0))); },
    get(key) { return transaction('readonly', ({ entries, scopes, read, done }) => read(entries.get(key), row => {
      if (!row) { done(undefined); return; }
      read(scopes.get(row.scope), meta => done(row.scopeEpoch === (meta?.epoch || 0) ? row : undefined));
    })); },
    put(record, expectedEpoch) { return transaction('readwrite', ({ entries, scopes, read, done }) => read(scopes.get(record.scope), meta => {
      const epoch = meta?.epoch || 0;
      if (epoch !== expectedEpoch) { done(false); return; }
      entries.put({ ...record, scopeEpoch: epoch });
      read(entries.getAll(), rows => { const remove = expiredKeys(rows, settings); remove.forEach(key => entries.delete(key)); done(!remove.includes(record.key)); });
    })); },
    delete(key) { return transaction('readwrite', ({ entries, done }) => { entries.delete(key); done(true); }); },
    deleteScope(scope) { return transaction('readwrite', ({ entries, scopes, read, done }) => read(scopes.get(scope), meta => {
      const epoch = (meta?.epoch || 0) + 1; scopes.put({ scope, epoch });
      read(entries.getAll(), rows => { rows.filter(row => row.scope === scope).forEach(row => entries.delete(row.key)); done(epoch); });
    })); },
    clear() { return transaction('readwrite', ({ entries, scopes, read, done }) => read(scopes.getAll(), metas => read(entries.getAll(), rows => {
      const epochs = new Map(metas.map(x => [x.scope, x.epoch]));
      rows.forEach(row => { if (!epochs.has(row.scope)) epochs.set(row.scope, 0); });
      for (const [scope, epoch] of epochs) scopes.put({ scope, epoch: epoch + 1 });
      entries.clear(); done(true);
    }))); },
    async close() { if (open) { try { (await open).close(); } catch (_) {} } }
  };
}
