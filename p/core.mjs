/* SPA80 controller v1. Event-driven reads: one request per uncached screen, no polling,
   no prefetch, no automatic retries. Real data lives in memory only.
   Persistent storage (IndexedDB) is accepted ONLY when mode === 'mock'. */
import {canonical, byteSize, copy} from './cache.mjs';
import {OPS, normalizeEnvelope, cleanParams} from './shapes.mjs';

export const DEFAULTS = Object.freeze({schemaVersion: 1, ttlMs: 60_000, maxEntries: 64, maxBytes: 5_242_880, readTimeoutMs: 20_000});

export function createController({api, mode = 'real', storage = null, onChange = () => {}, onUnauthorized = () => {}, now = Date.now, settings = {}} = {}) {
  if (!api || typeof api.read !== 'function') throw new TypeError('A read adapter is required');
  const cfg = {...DEFAULTS, ...settings};
  const persistent = mode === 'mock' && storage ? storage : null; // hard rule: no persistence for real data
  const scope = mode === 'mock' ? 'mock' : 'live';
  const memory = new Map(), flights = new Map();
  let generation = 0, epoch = 0, destroyed = false, queueTail = Promise.resolve();
  let state = {screen: null, params: {}, data: null, lang: 'ar', ts: null, loading: false, refreshing: false, stale: false, error: null};

  const snapshot = () => copy(state);
  const emit = () => { if (!destroyed) onChange(snapshot()); };
  const keyOf = (op, params) => canonical([cfg.schemaVersion, scope, op, params]);
  const fresh = r => !!r && Number.isFinite(r.savedAt) && r.savedAt <= now() && now() - r.savedAt < cfg.ttlMs;
  const queue = job => { const run = queueTail.then(job, job); queueTail = run.catch(() => {}); return run; };

  function memoryPut(record) {
    const value = {...record, size: byteSize(record.raw)};
    memory.delete(value.key);
    if (value.size > cfg.maxBytes) return;
    memory.set(value.key, value);
    let size = [...memory.values()].reduce((sum, r) => sum + r.size, 0);
    while (memory.size > cfg.maxEntries || size > cfg.maxBytes) {
      const oldest = memory.keys().next().value; size -= memory.get(oldest).size; memory.delete(oldest);
    }
  }
  function touch(key) { const r = memory.get(key); if (r) { memory.delete(key); memory.set(key, r); } return r; }
  function show(record, gen, refreshing) {
    if (gen !== generation) return; // a newer navigation owns the screen
    state = {...state, data: copy(record.env.data), lang: record.env.lang, ts: record.env.ts, loading: false, refreshing, stale: !fresh(record), error: null};
    emit();
  }
  function persist(record, ep) {
    if (!persistent) return;
    queue(async () => {
      if (ep !== epoch || destroyed) return;
      const e = await persistent.getEpoch(scope);
      await persistent.put({key: record.key, scope, op: record.op, params: record.params, raw: record.raw, savedAt: record.savedAt}, e);
    }).catch(() => {});
  }
  async function fromStorage(key, op, params) {
    if (!persistent) return undefined;
    try {
      const row = await persistent.get(key);
      if (!row || row.key !== key || row.scope !== scope || row.op !== op || canonical(row.params) !== canonical(params) || !Number.isFinite(row.savedAt)) return undefined;
      const env = normalizeEnvelope(op, row.raw);
      if (!env) return undefined;
      const record = {key, op, params, raw: row.raw, env, savedAt: row.savedAt};
      memoryPut(record); return touch(key);
    } catch { return undefined; }
  }
  function fetchRemote(key, op, params) {
    if (flights.has(key)) return flights.get(key); // single-flight per screen+params
    const ep = epoch, ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), cfg.readTimeoutMs); timer.unref?.();
    const promise = (async () => {
      try {
        const res = await api.read(op, copy(params), {signal: ctrl.signal});
        if (res?.status === 401) return {kind: 'unauthorized'};
        if (res?.status === 403) return {kind: 'forbidden'};
        if (res?.status !== 200) return {kind: 'error', code: 'READ_FAILED'};
        const env = normalizeEnvelope(op, res.body);
        if (!env) return {kind: 'error', code: 'INVALID_RESPONSE'};
        const record = {key, op, params, raw: copy(res.body), env, savedAt: now()};
        if (ep === epoch && !destroyed) { memoryPut(record); persist(record, ep); }
        return {kind: 'ok', record};
      } catch { return {kind: 'error', code: 'READ_FAILED'}; }
      finally { clearTimeout(timer); if (flights.get(key) === promise) flights.delete(key); }
    })();
    flights.set(key, promise);
    return promise;
  }
  function clearAll() {
    epoch++; memory.clear(); flights.clear();
    if (persistent) queue(() => persistent.deleteScope(scope)).catch(() => {});
  }
  async function load(op, params = {}, {force = false} = {}) {
    if (destroyed) return snapshot();
    if (!OPS.includes(op)) throw new TypeError('Invalid op');
    params = cleanParams(op, params);
    const gen = ++generation, key = keyOf(op, params);
    state = {...state, screen: op, params: copy(params), data: null, error: null, loading: true, refreshing: false, stale: false};
    let cached = touch(key);
    if (!cached) { emit(); cached = await fromStorage(key, op, params); if (gen !== generation) return snapshot(); }
    if (cached) { show(cached, gen, force || !fresh(cached)); if (!force && fresh(cached)) return snapshot(); }
    const result = await fetchRemote(key, op, params);
    if (destroyed) return snapshot();
    if (result.kind === 'unauthorized') {
      clearAll();
      try { onUnauthorized(); } catch {}
      state = {...state, data: null, loading: false, refreshing: false, stale: false, error: {code: 'UNAUTHORIZED'}};
      emit(); return snapshot();
    }
    if (result.kind === 'forbidden') {
      memory.delete(key);
      if (gen === generation) { state = {...state, data: null, loading: false, refreshing: false, stale: false, error: {code: 'FORBIDDEN'}}; emit(); }
      return snapshot();
    }
    if (result.kind === 'error') {
      if (gen === generation) { state = {...state, loading: false, refreshing: false, stale: !!state.data, error: {code: result.code}}; emit(); }
      return snapshot();
    }
    show(result.record, gen, false);
    return snapshot();
  }
  // Read a cached screen without any request (e.g. stage labels from home counts).
  function peek(op, params = {}) {
    const r = memory.get(keyOf(op, cleanParams(op, params)));
    return r ? copy(r.env) : null;
  }
  return {
    load, peek, snapshot,
    refresh: () => state.screen ? load(state.screen, state.params, {force: true}) : Promise.resolve(snapshot()),
    lock(code = 'UNAUTHORIZED') { clearAll(); generation++; state = {...state, data: null, loading: false, refreshing: false, stale: false, error: {code}}; emit(); },
    clear: clearAll,
    destroy() { destroyed = true; epoch++; memory.clear(); flights.clear(); },
    diagnostics: () => ({memoryEntries: memory.size, inFlight: flights.size, persistentEnabled: !!persistent})
  };
}
