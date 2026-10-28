// get.js, built by src/pwa/v2/get/build_get.js: the shell's idb.js, store.js, sign.js, api.js (src/pwa/v2/shell/src, as they are) as TSW_GET, then
// src/pwa/v2/get/get.js. CFG: the values of the app at this site, and the two hooks of get/config.js.
var TSW_GET = (function () {
  'use strict';
  var defs = {
  "./idb.js": function (module, exports, require) {
// idb.js: the IndexedDB database 'tsw' (ARCH §3.2) and a small promise wrapper. Shared by the app (store.js) and the service worker: build.js
// copies this file into sw.js as it is, so it uses plain function declarations, no require and no app globals.
// Stores: kv (out-of-line keys: tok, key, me, lang, lock, …), boot (key = the person's name), outbox (keyPath [who, rid]),
// inbox (keyPath [who, id]). Every person's data is keyed by the person (critique 18).
'use strict';
const IDB_VER = 1;
const IDB_STORES = { kv: null, boot: null, outbox: ['who', 'rid'], inbox: ['who', 'id'] };

// the open database, or null when IndexedDB is missing, blocked or throws (private windows, cleared site data)
function idbOpen(idb, name) {
  return new Promise((resolve) => {
    let rq;
    try { rq = idb.open(name, IDB_VER); } catch (e) { resolve(null); return; }
    rq.onupgradeneeded = () => {
      try {
        const db = rq.result;
        for (const s of Object.keys(IDB_STORES)) {
          if (db.objectStoreNames.contains(s)) continue;
          if (IDB_STORES[s]) db.createObjectStore(s, { keyPath: IDB_STORES[s] });
          else db.createObjectStore(s);
        }
      } catch (e) { /* the open fails below */ }
    };
    rq.onsuccess = () => {
      const db = rq.result;
      try { db.onversionchange = () => { try { db.close(); } catch (e) { /* closed */ } }; } catch (e) { /* ok */ }
      resolve(db);
    };
    rq.onerror = () => resolve(null);
    rq.onblocked = () => resolve(null);
  });
}
// run fn(stores…) in one transaction; resolves with fn's value once the transaction completes, rejects when it aborts
function idbTx(db, names, mode, fn) {
  return new Promise((resolve, reject) => {
    let tx, out;
    try {
      tx = db.transaction(names, mode);
      out = fn.apply(null, names.map((n) => tx.objectStore(n)));
    } catch (e) { reject(e); return; }
    tx.oncomplete = () => {
      if (out && typeof out.then === 'function') out.then(resolve, reject);
      else resolve(out && out.__rq ? out.__rq.result : out);
    };
    tx.onerror = () => reject(tx.error || new Error('idb error'));
    tx.onabort = () => reject(tx.error || new Error('idb abort'));
  });
}
// a request's result, read after the transaction completes
function idbRq(rq) { return { __rq: rq }; }
function idbGet(db, store, key) { return idbTx(db, [store], 'readonly', (s) => idbRq(s.get(key))); }
function idbAll(db, store) { return idbTx(db, [store], 'readonly', (s) => idbRq(s.getAll())); }
function idbPut(db, store, val, key) { return idbTx(db, [store], 'readwrite', (s) => { if (key === undefined) s.put(val); else s.put(val, key); }); }
function idbDel(db, store, key) { return idbTx(db, [store], 'readwrite', (s) => { s.delete(key); }); }
function idbClear(db, store) { return idbTx(db, [store], 'readwrite', (s) => { s.clear(); }); }

if (typeof module !== 'undefined') module.exports = { IDB_VER, IDB_STORES, idbOpen, idbTx, idbRq, idbGet, idbAll, idbPut, idbDel, idbClear };
  },
  "./store.js": function (module, exports, require) {
// store.js: what the app keeps on the phone (ARCH §3.2), on top of idb.js. When IndexedDB is missing or refuses (a private window, cleared
// site data), the same calls work in memory for this page's life: the person signs in again next time, which is a normal path (§3.2).
// Every person's data is keyed by the person (critique 18). wipeSession() runs on sign-out and on auth / revoked / inactive / suspended;
// setMe(name) wipes the previous person's data when another person signs in. lang, prefs, the call budget and the clock skew are kept.
'use strict';
const I = require('./idb.js');

// kv keys removed with the session (lang, prefs, seenInstallHelp, budget and skew stay)
const SESSION_KEYS = ['tok', 'key', 'nds', 'pend', 'me', 'pendingRoute', 'unread', 'badge', 'lock'];
// what a different person must never see (critique 18)
const PERSON_KEYS = ['pendingRoute', 'unread', 'badge', 'lock'];
const INBOX_MAX = 50;
const INBOX_DAYS = 14;

function createStore(o) {
  const opt = o || {};
  const name = opt.name || 'tsw';
  const now = opt.now || (() => Date.now());
  let db = null, mem = null, ready = null;

  // the memory fallback has the same shape: kv map, and per store a map by key text
  function memDb() {
    return { kv: new Map(), boot: new Map(), outbox: new Map(), inbox: new Map() };
  }
  const mk = (store, key) => (Array.isArray(key) ? JSON.stringify(key) : String(key));
  const keyOf = (store, val) => (I.IDB_STORES[store] ? I.IDB_STORES[store].map((k) => val[k]) : undefined);
  const clone = (v) => { try { return structuredClone(v); } catch (e) { return v; } };

  function open() {
    if (!ready) {
      ready = (async () => {
        if (opt.idb) db = await I.idbOpen(opt.idb, name);
        if (!db) mem = memDb();
        return !!db;
      })();
    }
    return ready;
  }
  // an IndexedDB failure after open (quota, a closed connection) moves the page to memory instead of failing the app
  async function safe(fn, fb) {
    await open();
    if (db) {
      try { return await fn(); } catch (e) { if (opt.onError) opt.onError(e); }
    }
    return fb();
  }

  const get = (k) => safe(() => I.idbGet(db, 'kv', k), () => clone(mem.kv.get(k)));
  const set = (k, v) => safe(() => I.idbPut(db, 'kv', v, k), () => { mem.kv.set(k, clone(v)); });
  const del = (k) => safe(() => I.idbDel(db, 'kv', k), () => { mem.kv.delete(k); });
  // several kv writes and deletes in one transaction, so a token swap is all or nothing
  const setMany = (vals, dels) => safe(() => I.idbTx(db, ['kv'], 'readwrite', (s) => {
    for (const k of Object.keys(vals || {})) s.put(vals[k], k);
    for (const k of dels || []) s.delete(k);
  }), () => {
    for (const k of Object.keys(vals || {})) mem.kv.set(k, clone(vals[k]));
    for (const k of dels || []) mem.kv.delete(k);
  });

  // ---------- boot: the last boot per person, { json, at, h } ----------
  const bootGet = (who) => safe(() => I.idbGet(db, 'boot', who), () => clone(mem.boot.get(who)));
  const bootPut = (who, rec) => safe(() => I.idbPut(db, 'boot', rec, who), () => { mem.boot.set(who, clone(rec)); });

  // ---------- outbox: { who, rid, a, f, at, av, tries, st, … } ----------
  async function obxAll(who) {
    const all = await safe(() => I.idbAll(db, 'outbox'), () => [...mem.outbox.values()].map(clone));
    return (all || []).filter((x) => x && x.who === who).sort((a, b) => a.at - b.at || (Number(a.n) || 0) - (Number(b.n) || 0) || (a.rid < b.rid ? -1 : 1));
  }
  const obxPut = (item) => safe(() => I.idbPut(db, 'outbox', item), () => { mem.outbox.set(mk('outbox', keyOf('outbox', item)), clone(item)); });
  const obxDel = (who, rid) => safe(() => I.idbDel(db, 'outbox', [who, rid]), () => { mem.outbox.delete(mk('outbox', [who, rid])); });

  // ---------- inbox: { who, id, t, b, u, k, tag, ts, read } (the service worker writes it too) ----------
  async function inboxAll(who) {
    const all = await safe(() => I.idbAll(db, 'inbox'), () => [...mem.inbox.values()].map(clone));
    return (all || []).filter((x) => x && x.who === who).sort((a, b) => b.ts - a.ts);
  }
  const inboxPut = (item) => safe(() => I.idbPut(db, 'inbox', item), () => { mem.inbox.set(mk('inbox', keyOf('inbox', item)), clone(item)); });
  const inboxDel = (who, id) => safe(() => I.idbDel(db, 'inbox', [who, id]), () => { mem.inbox.delete(mk('inbox', [who, id])); });
  // keep the last 50 rows of the last 14 days
  async function inboxPrune(who) {
    const rows = await inboxAll(who), cut = now() - INBOX_DAYS * 864e5;
    const drop = rows.filter((r, i) => i >= INBOX_MAX || !(r.ts >= cut));
    for (const r of drop) await inboxDel(who, r.id);
    return drop.length;
  }

  async function clearData() {
    for (const s of ['boot', 'outbox', 'inbox']) await safe(() => I.idbClear(db, s), () => { mem[s].clear(); });
  }
  // sign-out, or a refusal: the token, the device key and every person's data (ARCH §1.7, §1.8)
  async function wipeSession() {
    await clearData();
    await setMany({}, SESSION_KEYS);
  }
  // the person this phone holds; a different person first wipes the previous one's data (critique 18)
  async function setMe(nm) {
    const cur = await get('me');
    const changed = !!cur && cur !== nm;
    if (changed) { await clearData(); await setMany({}, PERSON_KEYS); }
    await set('me', nm);
    return { changed };
  }
  // ask the browser to keep the data (iOS may still clear it; ARCH critique 19)
  async function persist(nav) {
    try {
      const st = nav && nav.storage;
      if (!st || typeof st.persist !== 'function') return false;
      if (typeof st.persisted === 'function' && await st.persisted()) return true;
      return !!(await st.persist());
    } catch (e) { return false; }
  }

  return {
    open, get, set, del, setMany, bootGet, bootPut, obxAll, obxPut, obxDel, inboxAll, inboxPut, inboxDel, inboxPrune,
    wipeSession, setMe, persist, clearData,
    get memory() { return !db; },
    get name() { return name; },
  };
}

module.exports = { createStore, SESSION_KEYS, PERSON_KEYS, INBOX_MAX, INBOX_DAYS };
  },
  "./sign.js": function (module, exports, require) {
// sign.js: the device secret, the device key and the call signature (ARCH §1.4, critique 7; DEVIATIONS lib item 3). Shared by the app (api.js)
// and the service worker (build.js copies this file into sw.js), so plain functions only. c is the WebCrypto object (crypto: getRandomValues
// and subtle).
// csig: every body field but csig, as text, sorted by name (plain sort), encodeURIComponent(name) '=' encodeURIComponent(value) joined with
// '&'; h = SHA-256 hex of that; the device key signs 'a|rid|ts|h' (ECDSA P-256, SHA-256, the 64-byte r‖s), sent as base64url.
'use strict';
function sgB64u(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function sgUnb64u(s) {
  const t = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function sgRand(c, n) { const b = new Uint8Array(n); c.getRandomValues(b); return b; }
// a device secret: 32 random bytes as 43 base64url characters
function sgNewDs(c) { return sgB64u(sgRand(c, 32)); }
// a 12-character nonce (rid), also the outbox key
function sgNewRid(c) { return sgB64u(sgRand(c, 9)); }
// the signed body form; null for a value that is not text or a number
function sgCanon(body) {
  const ks = Object.keys(body).filter((k) => k !== 'csig').sort();
  const out = [];
  for (const k of ks) {
    const v = body[k];
    if (typeof v !== 'string' && typeof v !== 'number') return null;
    out.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
  }
  return out.join('&');
}
async function sgSha256hex(c, s) {
  const d = new Uint8Array(await c.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  let x = '';
  for (let i = 0; i < d.length; i++) x += d[i].toString(16).padStart(2, '0');
  return x;
}
// the base64url csig of a body (which must already hold a, ts and, on writes, rid), or '' when it cannot be signed
async function sgCsig(c, key, body) {
  const canon = sgCanon(body);
  if (canon === null || !key) return '';
  const one = (k) => (body[k] == null ? '' : String(body[k]));
  const msg = one('a') + '|' + one('rid') + '|' + one('ts') + '|' + (await sgSha256hex(c, canon));
  const sig = await c.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(msg));
  return sgB64u(sig);
}
// a new device key: the private key is non-extractable (it can sign, never leave the device); pk is the public JWK as text
async function sgNewKey(c) {
  const kp = await c.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const j = await c.subtle.exportKey('jwk', kp.publicKey);
  return { key: kp.privateKey, pk: JSON.stringify({ kty: 'EC', crv: 'P-256', x: j.x, y: j.y }) };
}

if (typeof module !== 'undefined') module.exports = { sgB64u, sgUnb64u, sgNewDs, sgNewRid, sgCanon, sgSha256hex, sgCsig, sgNewKey };
  },
  "./api.js": function (module, exports, require) {
// api.js: every call to the app door (ARCH §2.2). A form-encoded POST with no custom headers (a CORS simple request), credentials omitted, one
// request in flight, a timeout per call, backoff with jitter after a 5xx, a timeout, a lost connection or busy, and the call budget of
// critique 17. Signed calls carry the token (s), ts and csig (sign.js); writes carry rid. The device secret rotates when fewer than 7 days are
// left (nds, §1.6), and the token is swapped in one transaction when the answer carries the token of the new secret.
// busy keeps everything; auth, revoked, inactive and suspended on a signed call wipe the session (critique 1). The app listens to onEvent.
'use strict';
const SG = require('./sign.js');

const UNSIGNED = { login: 1, otp: 1, mfapw: 1, pair: 1 };
// read calls carry no rid (§2.2: rid on every write); boot is sent as a=me
const READS = { me: 1, order: 1, calendar: 1, duty: 1, team: 1, file: 1, leaves: 1 };
const OK_CODES = { boot: 1, same: 1, sent: 1, in: 1, mfa: 1, done: 1, already: 1, pending: 1, who: 1 };
const SESSION = { auth: 1, revoked: 1, inactive: 1, suspended: 1 };
const DS_RE = /^[A-Za-z0-9_-]{43}$/;
const RENEW_LEFT = 7 * 864e5;
// sign-in material (ds and the key) is reused for retries: a lost answer never burns the code (critique 15)
const PEND_LIFE = 10 * 60000;
const BUDGET = { win: 10 * 60000, max: 30, day: 400, userX: 2 };
const BACKOFF = { base: 2000, cap: 60000 };
const TIMEOUT = { me: 15000, go: 20000, def: 20000 };

// a token's parts: { ds, name, exp, ver }, or null (tok = ds "." encodeURIComponent(name) "|" exp "|" ver "|" sig, §1.4)
function tokInfo(tok) {
  if (typeof tok !== 'string' || tok.length > 700 || tok.indexOf('.') !== 43) return null;
  const ds = tok.slice(0, 43);
  if (!DS_RE.test(ds)) return null;
  const p = tok.slice(44).split('|');
  if (p.length !== 4 || !/^\d{10,15}$/.test(p[1]) || !/^\d{1,12}$/.test(p[2]) || !p[3]) return null;
  let name = '';
  try { name = decodeURIComponent(p[0]); } catch (e) { return null; }
  return name ? { ds, name, exp: Number(p[1]), ver: Number(p[2]) } : null;
}
// '2.261007.3' < '2.261008.1' (numeric per part)
function verLt(a, b) {
  const x = String(a || '').split('.').map(Number), y = String(b || '').split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const p = x[i] || 0, q = y[i] || 0;
    if (p !== q) return p < q;
  }
  return false;
}
const dayNo = (ms) => Math.floor((ms + 4 * 3600000) / 864e5);
// the answer's boot: nested in boot on writes and sign-in (§2.2), or the answer itself for a=me (§2.4 shows it flat); envelope fields dropped
const ENVELOPE = ['ok', 'code', 'msg', 'tok', 'res', 'focus', 'view', 'same', 'reason', 'signed', 'rid', 'nds', 'local', 'http', 'sent'];
function bootOf(r) {
  if (!r || typeof r !== 'object') return null;
  if (r.boot && typeof r.boot === 'object' && !Array.isArray(r.boot)) return r.boot;
  if (r.code !== 'boot' || !r.me || typeof r.me !== 'object') return null;
  const b = {};
  for (const k of Object.keys(r)) if (!ENVELOPE.includes(k)) b[k] = r[k];
  return b;
}

function createApi(o) {
  const c = o.crypto, store = o.store, doFetch = o.fetch;
  const now = o.now || (() => Date.now());
  const sT = o.setTimeout || setTimeout, cT = o.clearTimeout || clearTimeout;
  const rnd = o.random || Math.random;
  const T = Object.assign({}, TIMEOUT, o.timeouts || {});
  const lang = typeof o.lang === 'function' ? o.lang : () => (o.lang === 'en' ? 'en' : 'ar');
  const emit = (t, d) => { try { if (o.onEvent) o.onEvent(t, d || {}); } catch (e) { /* a listener's error is not the call's */ } };
  let q = Promise.resolve(), cache = null, skew = 0, fails = 0, waitUntil = 0, last = null;

  // the token and key, read once per page and kept in step with every swap
  async function creds() {
    if (cache) return cache;
    const [tok, key, sk] = await Promise.all([store.get('tok'), store.get('key'), store.get('skew')]);
    if (typeof sk === 'number' && isFinite(sk)) skew = sk;
    const info = tokInfo(tok);
    cache = { tok: info ? tok : '', key: info && key ? key : null, info };
    return cache;
  }
  const srvNow = () => now() + skew;

  // the call budget: 30 calls in 10 minutes and 400 a day; automatic calls stop at the budget, calls the person makes at twice it
  async function budgetTake(kind) {
    if (kind === 'free') return true;
    const t = now(), d = dayNo(t), b = (await store.get('budget')) || {};
    const w = (Array.isArray(b.w) ? b.w : []).filter((x) => typeof x === 'number' && t - x < BUDGET.win && x <= t);
    let n = b.d === d ? Number(b.n) || 0 : 0;
    const k = kind === 'user' ? BUDGET.userX : 1;
    if (w.length >= BUDGET.max * k || n >= BUDGET.day * k) return false;
    w.push(t); n++;
    await store.set('budget', { w: w.slice(-BUDGET.max * BUDGET.userX), d, n });
    return true;
  }
  function backoff() {
    fails++;
    const d = Math.min(BACKOFF.cap, BACKOFF.base * Math.pow(2, fails - 1));
    waitUntil = now() + Math.round(d / 2 + rnd() * d / 2);
  }

  // the body as sent: common fields, the action's fields as text, then the signature
  async function bodyOf(a, f, op, cr) {
    const b = { fmt: 'app', a: a === 'boot' ? 'me' : a, l: lang(), av: String(o.build || '') };
    for (const k of Object.keys(f || {})) if (f[k] != null && f[k] !== '') b[k] = String(f[k]);
    const signed = !UNSIGNED[b.a] && !!cr.tok;
    if (!signed) return { b, signed };
    b.s = cr.tok;
    if (!READS[b.a]) b.rid = op.rid || SG.sgNewRid(c);
    if (cr.info && cr.info.exp - srvNow() < RENEW_LEFT) {
      let nds = await store.get('nds');
      if (typeof nds !== 'string' || !DS_RE.test(nds) || nds === cr.info.ds) { nds = SG.sgNewDs(c); await store.set('nds', nds); }
      b.nds = nds;
    }
    b.ts = String(Math.round(srvNow()));
    b.csig = await SG.sgCsig(c, cr.key, b);
    return { b, signed };
  }

  // one request: { ok, code, … the answer } or a local code: net (no connection), timeout (sent, no answer), fail (not 200 or not JSON)
  async function once(a, f, op) {
    const cr = await creds();
    const { b, signed } = await bodyOf(a, f, op, cr);
    const ms = op.timeout || T[b.a] || T.def;
    const ac = typeof AbortController === 'function' ? new AbortController() : null;
    let timedOut = false;
    const timer = sT(() => { timedOut = true; if (ac) ac.abort(); }, ms);
    const t0 = now();
    let res, txt;
    try {
      res = await doFetch(o.url, {
        method: 'POST', body: new URLSearchParams(b), mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error',
        referrerPolicy: 'no-referrer', keepalive: !!op.keepalive, signal: ac ? ac.signal : undefined,
      });
      txt = await res.text();
    } catch (e) {
      cT(timer);
      // no answer before the timeout: offline, or the server's host failed (its error page has no CORS headers, so it throws too).
      // o.siteUp asks the site itself: down = the phone is online and only the server is not (review 2026-10-28 design item 2)
      const down = !timedOut && typeof o.siteUp === 'function' ? !!(await o.siteUp()) : false;
      return { ok: false, code: timedOut ? 'timeout' : 'net', down, local: true, sent: timedOut, signed, rid: b.rid };
    }
    cT(timer);
    if (timedOut) return { ok: false, code: 'timeout', local: true, sent: true, signed, rid: b.rid };
    if (!res || res.status !== 200) return { ok: false, code: 'fail', http: res ? res.status : 0, local: true, signed, rid: b.rid };
    let j = null;
    try { j = JSON.parse(txt); } catch (e) { j = null; }
    if (!j || typeof j !== 'object' || Array.isArray(j) || typeof j.code !== 'string') return { ok: false, code: 'fail', http: 200, local: true, signed, rid: b.rid };
    if (typeof j.at === 'number' && isFinite(j.at)) {
      const ns = Math.round(j.at - (t0 + now()) / 2);
      if (Math.abs(ns - skew) > 1000) { skew = ns; await store.set('skew', skew); }
    }
    const reason = typeof j.reason === 'string' ? j.reason : j.res && typeof j.res.reason === 'string' ? j.res.reason : '';
    // msg goes into the page as a child: text only (review-shell)
    const msg = typeof j.msg === 'string' ? j.msg.slice(0, 500) : '';
    return Object.assign({}, j, { ok: !!OK_CODES[j.code] && j.ok !== false, reason, msg, signed, rid: b.rid, nds: b.nds || '' });
  }

  // a renewed token: kept only when it carries the secret this phone sent (nds), swapped with nds in one transaction
  async function takeTok(r) {
    if (typeof r.tok !== 'string') return;
    const info = tokInfo(r.tok), cr = await creds();
    if (!info || !cr.info || info.name !== cr.info.name) return;
    if (r.nds && info.ds === r.nds) {
      await store.setMany({ tok: r.tok }, ['nds']);
      cache = { tok: r.tok, key: cr.key, info };
      emit('renewed', { exp: info.exp });
    } else if (info.ds === cr.info.ds) {
      await store.set('tok', r.tok);
      cache = { tok: r.tok, key: cr.key, info };
    }
  }

  async function after(r, op) {
    if (!r.local || r.down) emit('net', { online: true });
    if (r.min && verLt(o.build, r.min)) emit('upgrade', { min: r.min });
    if (r.ok) { fails = 0; waitUntil = 0; }
    if (r.code === 'busy' || r.code === 'timeout' || r.code === 'net' || (r.code === 'fail' && (r.http === 0 || r.http >= 500))) backoff();
    if (r.code === 'net' && !r.down) emit('net', { online: false });
    // a renewed token is taken from any signed answer that carries one, a fail included: App Done keeps it on a fail when the renewal row
    // was written (the old token then lasts 2 minutes); an answer that ends the session wipes instead
    if (r.signed && typeof r.tok === 'string' && !SESSION[r.code]) await takeTok(r);
    if (SESSION[r.code] && r.signed) {
      await store.wipeSession();
      cache = null;
      emit('session', { code: r.code, reason: r.reason });
    } else if (r.code === 'busy') emit('busy', {});
    else if (r.code === 'upgrade') emit('upgrade', { min: r.min || '' });
    else if (r.code === 'off' || r.code === 'origin' || r.code === 'limit') emit(r.code, { msg: r.msg || '' });
    // a sign-in answer's boot goes out with 'signedin', once the person and the token are stored
    const b = bootOf(r);
    if (r.signed && b) emit('boot', { boot: b, at: r.at, op });
    else if (r.signed && r.code === 'same') emit('same', { at: r.at, op });
    last = { code: r.code, at: now() };
    return r;
  }

  async function run(a, f, op) {
    const kind = op.free ? 'free' : op.auto ? 'auto' : 'user';
    if (op.auto && now() < waitUntil) return { ok: false, code: 'wait', local: true };
    if (!(await budgetTake(kind))) { emit('budget', { auto: kind === 'auto' }); return { ok: false, code: 'budget', local: true }; }
    let r = await once(a, f, op);
    // a stale ts writes nothing on the server (DEVIATIONS lib 5): resync from at and try once more before anything is wiped
    if (r.code === 'revoked' && r.reason === 'ts' && typeof r.at === 'number') r = await once(a, f, op);
    return after(r, op);
  }
  // one request in flight per device: calls run in order, each after the previous answer or timeout
  function call(a, fields, opt) {
    const p = q.then(() => run(a, fields || {}, opt || {}));
    q = p.catch(() => {});
    return p;
  }

  // ---------- sign-in (§1.2, §1.3): the phone makes ds and the key, sent with otp, mfapw and the second pair step ----------
  async function pend(fresh) {
    let p = fresh ? null : await store.get('pend');
    if (!p || !DS_RE.test(String(p.ds)) || !p.key || !p.pk || !(now() - p.at < PEND_LIFE)) {
      const k = await SG.sgNewKey(c);
      p = { ds: SG.sgNewDs(c), key: k.key, pk: k.pk, at: now() };
      await store.set('pend', p);
    }
    return p;
  }
  // an 'in' answer: the token must carry this phone's ds; then the person, the token and the key are stored together
  async function signedIn(r, p) {
    const info = tokInfo(r.tok);
    if (r.code !== 'in' || !info || info.ds !== p.ds) return Object.assign({}, r, { ok: false, code: r.code === 'in' ? 'fail' : r.code });
    const ch = await store.setMe(info.name);
    await store.setMany({ tok: r.tok, key: p.key }, ['pend', 'nds']);
    cache = { tok: r.tok, key: p.key, info };
    emit('signedin', { name: info.name, changed: ch.changed, boot: bootOf(r) });
    return Object.assign({}, r, { who: info.name });
  }
  // ch 'mail': the code goes to the account's sign-in email (E1); the answer then carries the masked address (m)
  const login = (phone, ch) => call('login', ch === 'mail' ? { phone, ch: 'mail' } : { phone });
  async function otp(phone, v) { const p = await pend(); return signedIn(await call('otp', { phone, v, ds: p.ds, pk: p.pk }), p); }
  async function mfapw(id, pw) { const p = await pend(); return signedIn(await call('mfapw', { id, pw, ds: p.ds, pk: p.pk }), p); }
  // pairing step 1 shows whose code it is ({ mask, role, pt }); nothing is linked until step 2
  async function pair1(code) {
    const r = await call('pair', { c: code });
    const x = r.res && typeof r.res === 'object' ? r.res : r;
    return r.code === 'who' && typeof x.pt === 'string' ? Object.assign({}, r, { ok: true, mask: String(x.mask || ''), role: String(x.role || ''), pt: x.pt }) : r;
  }
  async function pair2(pt) { const p = await pend(); return signedIn(await call('pair', { pt, ds: p.ds, pk: p.pk }), p); }

  // sign out here (logout) or everywhere (signoutall); the phone wipes itself whatever the answer, since a dead network must not keep a session.
  // It is outside the call budget, so a spent budget never leaves the token alive on the server
  async function signOut(all) {
    const r = await call(all ? 'signoutall' : 'logout', {}, { free: true });
    await store.wipeSession();
    cache = null;
    return r;
  }
  async function signedInfo() { const cr = await creds(); return cr.info ? Object.assign({}, cr.info) : null; }

  return {
    call, login, otp, mfapw, pair1, pair2, signOut, signedInfo,
    forget() { cache = null; },
    get skew() { return skew; },
    get waitUntil() { return waitUntil; },
    get last() { return last; },
  };
}

module.exports = { createApi, tokInfo, verLt, bootOf, UNSIGNED, READS, SESSION, RENEW_LEFT, BUDGET, BACKOFF, TIMEOUT, PEND_LIFE };
  }
  }, done = {};
  function req(n) {
    if (done[n]) return done[n].exports;
    if (!defs[n]) throw new Error('TSW_GET: no module ' + n);
    var mod = { exports: {} };
    done[n] = mod;
    defs[n](mod, mod.exports, req);
    return mod.exports;
  }
  var A = req('./api.js'), St = req('./store.js');
  return Object.freeze({ createApi: A.createApi, createStore: St.createStore, tokInfo: A.tokInfo, CFG: Object.freeze({"API_URL":"https://ahmedzenary.app.n8n.cloud/webhook/tasweer-admin","BUILD":"2.261029.1","ENV":"prod","DB":"tsw","DOMAIN":"shj-security-media-services.github.io","MN_URL":"https://ahmedzenary.app.n8n.cloud/webhook/tasweer-mn","ANDROID_APK_URL":"","IOS_MANIFEST_URL":"","IOS_LINK":""}) });
})();
// get.js: the install page /get/, v3 (zeno 2026-10-28: «like the Sharjah Police employee-app page»): a gate, then the download page.
// The gate is the app's own sign-in, through the shell's own client (build_get.js puts shell/src idb.js, store.js, sign.js and api.js in
// front of this file as TSW_GET, with the API URL, build and database name read from the site's app bundle): the member's number, «هل هذا
// رقمك؟», a 6-digit code by WhatsApp (a=login, the shell's limits and texts), the code (a=otp with the phone-made ds and device key), then
// the page. A right code mints the app's session: on Android it stays in this browser's storage, which the installed app shares, so the app
// opens signed in; on iPhone and iPad it is signed out at once (Safari's storage is not the installed app's; the app asks for its own code).
// A phone that already holds the app's session, or passed the gate in this tab in the last 30 minutes, skips the gate. Inside another app
// (WhatsApp, Instagram, a WebView, Chrome on iOS) and on a computer there is no gate: open it in Safari or Chrome, or on the phone.
// The download page: «دليل التثبيت» (a sheet with this phone's steps: Safari's Add to Home Screen by iOS version with the big arrow at
// Safari's own button, or Android's), Android (the browser's install dialog, else the ⋮ menu line with an arrow at it; ANDROID_APK_URL set:
// a download of that file) and iPhone (the Add to Home Screen steps; IOS_MANIFEST_URL set: itms-services://?action=download-manifest).
// ?l=en or ?l=ar picks the language, else the phone's (English only for an English phone, as the app); ع / EN switches it, ☾ / ☀ the theme.
// Opened from the home screen it goes to the app.
// /get/?r=mn (MN v1, fix28 2026-10-28): the administrative coordinators' gate in place of the team's: the military number, «رقمك المسجّل
// ينتهي بـ 19 — هل هذا رقمك؟», the 6-digit WhatsApp code, through the portal «👥 المنسقون» (CFG.MN_URL, fmt=app: mlook, msend, mcode, the
// device id dv); a right code keeps the coordinator's record {dv, tok, exp, me} under the key mn as the app's views/coord.js does, so on
// Android the installed app opens in his mode («طلب جديد», «المتابعة»); on iPhone and iPad he signs in inside the app.
'use strict';
(function () {
  var w = window, d = document, nav = w.navigator, ua = String(nav.userAgent || '');
  var standalone = !!((w.matchMedia && w.matchMedia('(display-mode: standalone)').matches) || nav.standalone === true);
  if (standalone) { w.location.replace('/'); return; }

  // TSW_GET: the shell's client and the build's values, in front of this file (build_get.js)
  var X = typeof TSW_GET !== 'undefined' ? TSW_GET : null;
  var CFG = (X && X.CFG) || {};
  var ios = /iPhone|iPad|iPod/.test(ua) || (nav.platform === 'MacIntel' && Number(nav.maxTouchPoints) > 1);
  var iphone = ios && /iPhone|iPod/.test(ua);
  var android = !ios && /Android/.test(ua);
  // where nothing installs: Facebook, Instagram, WhatsApp, the Google app, an Android WebView; on iOS a page view without Safari's token,
  // and the other browsers (the shell's guide sends them to Safari too)
  var inApp = /FBAN|FBAV|Instagram|WhatsApp|GSA\/|Line\/|Snapchat|; wv\)/.test(ua) || (ios && (!/Safari\//.test(ua) || /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)));
  var sam = android && /SamsungBrowser/.test(ua);
  var m = /Version\/(\d+)/.exec(ua), n = m ? Number(m[1]) : 0;
  var iosv = n >= 27 ? '27' : n >= 26 ? '26' : '18';
  // the browser's own bar follows the phone's language, not the page's
  var dir = /^(?:ar|he|fa|ur)\b/i.test(String(nav.language || '')) ? 'rtl' : 'ltr';
  var q = null;
  try { q = new w.URLSearchParams(w.location.search); } catch (e) { q = null; }
  var ql = q ? q.get('l') : '';
  var lang = ql === 'en' || ql === 'ar' ? ql : /^en\b/i.test(String(nav.language || '')) ? 'en' : 'ar';
  // the coordinators' gate (MN v1): only where the app was built with the portal (not the demo site)
  var MN = !!(q && q.get('r') === 'mn' && /^https:\/\//.test(String(CFG.MN_URL || '')));

  // the shell's own numbers (views/welcome.js): a code lives 5 minutes, a resend waits a minute (or the server's wait), 5 tries; the code
  // step is kept 10 minutes across a trip to WhatsApp; a passed gate holds for 30 minutes in this tab
  var CODE_LIFE = 5 * 60000, RESEND = 60000, HINT = 60000, TRIES = 5, LIFE = 10 * 60000, OK_LIFE = 30 * 60000;
  var SS = 'tsw-get', OK = 'tsw-get-ok', TH = 'tsw-get-theme', SSM = 'tsw-get-mn', DV_RE = /^[A-Za-z0-9_-]{22,64}$/;

  var S = {
    ar: {
      title: 'تنزيل تطبيق الإعلام الأمني', copied: 'نُسخ الرابط', link: 'الرابط', langs: 'اللغة', dark: 'الوضع الداكن', light: 'الوضع الفاتح', close: 'إغلاق',
      phoneBad: 'اكتب رقماً إماراتياً من 9 أرقام يبدأ بـ 5.', codeShort: 'اكتب الرمز المكوّن من 6 أرقام.',
      bad: 'الرمز غير صحيح. بقيت {n}.', noTries: 'انتهت المحاولات لهذا الرمز. اطلب رمزاً جديداً.', expired: 'انتهت صلاحية الرمز. اطلب رمزاً جديداً.',
      resendIn: 'إعادة الإرسال خلال ', timeUp: 'انتهت صلاحية الرمز. ', resent: 'أرسلنا رمزاً جديداً إن كان الرقم مسجّلاً.',
      noPaste: 'لم نجد رمزاً من 6 أرقام. انسخ الرمز من رسالة واتساب ثم اضغط «لصق الرمز».',
      noNet: 'لا يوجد اتصال. تحقّق من الإنترنت وحاول مرة أخرى.', busy: 'النظام مشغول، حاول بعد دقيقة.', limit: 'طلبات كثيرة خلال وقت قصير. حاول بعد دقيقة.',
      fail: 'تعذّر الاتصال بالخادم، حاول مرة أخرى.', down: 'الخادم لا يرد، حاول بعد قليل.', refused: 'لا تملك صلاحية هذا الإجراء',
      inactive: 'عضويتك في فريق التصوير غير نشطة حالياً، لذلك لا يمكن فتح التطبيق. للاستفسار تواصل مع مسؤول المصورين.', suspended: 'هذا الحساب موقوف. تواصل مع مسؤول التصوير.',
      guideLine: 'أول مرة تثبّت التطبيق؟ خطوات جوالك خطوة بخطوة.',
      andWeb: 'يُثبَّت من المتصفح مباشرة، دون متجر.', andApk: 'نزّل ملف التطبيق (APK) وثبّته على جوالك الأندرويد.',
      iosWeb: 'اضغط بالأسفل واتبع الخطوات، دون App Store.', iosEnt: 'اضغط بالأسفل للتثبيت مباشرة، دون App Store.',
      sec: ['ثانية واحدة', 'ثانيتين', 'ثوانٍ', 'ثانية'], tries: ['محاولة واحدة', 'محاولتان', 'محاولات', 'محاولة'],
      milBad: 'اكتب الرقم العسكري (أرقام فقط).', nomil: 'الرقم العسكري غير موجود، راجع الإدارة', who: 'رقمك المسجّل ينتهي بـ {e} — هل هذا رقمك؟',
      notMe: 'راجع الإدارة لتحديث رقم هاتفك المسجّل.', mbad: 'الرمز غير صحيح', start: 'انتهت هذه الخطوة. ابدأ من جديد.',
    },
    en: {
      title: 'Download Security Media', copied: 'Link copied', link: 'Link', langs: 'Language', dark: 'Dark mode', light: 'Light mode', close: 'Close',
      phoneBad: 'Enter a 9-digit UAE mobile starting with 5.', codeShort: 'Enter the 6-digit code.',
      bad: 'Wrong code. {n} left.', noTries: 'No tries left for this code. Ask for a new one.', expired: 'The code has expired. Ask for a new one.',
      resendIn: 'Resend in ', timeUp: 'The code has expired. ', resent: 'A new code is on its way if the number is registered.',
      noPaste: 'No 6-digit code found. Copy the code from the WhatsApp message, then tap «Paste code».',
      noNet: 'No connection. Check the internet and try again.', busy: 'The system is busy. Try again in a minute.', limit: 'Too many requests in a short time. Try again in a minute.',
      fail: 'Could not reach the server. Please try again.', down: 'The server is not responding, try again shortly.', refused: 'You do not have permission for this action',
      inactive: 'Your photography team membership is inactive, so the app cannot open. Please contact the photography manager.', suspended: 'This account is suspended. Please contact the photography manager.',
      guideLine: 'First time installing? The steps for your phone, one by one.',
      andWeb: 'Installs straight from the browser, no store needed.', andApk: 'Download the APK and install it on your Android device.',
      iosWeb: 'Tap below and follow the steps — no App Store needed.', iosEnt: 'Tap below to install directly — no App Store needed.',
      sec: ['1 second', '2 seconds', 'seconds', 'seconds'], tries: ['1 try', '2 tries', 'tries', 'tries'],
      milBad: 'Enter your military number (digits only).', nomil: 'This military number is not registered. Please contact the administration.',
      who: 'Your registered number ends in {e}. Is this your number?', notMe: 'Please contact the administration to update your registered phone number.',
      mbad: 'The code is not correct', start: 'This step has ended. Please start again.',
    },
  };
  var fill = function (s, v) { return v ? String(s).replace(/\{(\w+)\}/g, function (a, b) { return v[b] != null ? v[b] : a; }) : s; };
  var t = function (k, v) { return fill(S[lang][k], v); };
  // a count with its noun: «ثانية واحدة», «ثانيتين», «5 ثوانٍ», «22 ثانية»; "1 second", "22 seconds"
  function count(k, x) {
    var f = S[lang][k], r = x % 100;
    if (x === 1) return f[0];
    if (x === 2) return f[1];
    return x + ' ' + (lang === 'ar' && r >= 3 && r <= 10 ? f[2] : f[3]);
  }

  var $ = function (id) { return d.getElementById(id); };
  function show(id) { var el = $(id); if (el) el.hidden = false; }
  function hide(id) { var el = $(id); if (el) el.hidden = true; }
  var root = d.documentElement;
  var now = function () { return Date.now(); };
  // the browser's storage (sessionStorage for the gate's step, localStorage for the theme): private windows and blocked storage read as nothing
  function kept(kind, k, v) {
    try {
      var s = w[kind];
      if (v === undefined) return JSON.parse(s.getItem(k) || 'null');
      if (v === null) s.removeItem(k); else s.setItem(k, JSON.stringify(v));
    } catch (e) { /* no storage */ }
    return null;
  }
  var ss = function (k, v) { return kept('sessionStorage', k, v); };
  var toLatin = function (s) { return String(s == null ? '' : s).replace(/[٠-٩]/g, function (c) { return String(c.charCodeAt(0) - 0x0660); }).replace(/[۰-۹]/g, function (c) { return String(c.charCodeAt(0) - 0x06F0); }); };
  // a UAE mobile as the shell takes it: 05XXXXXXXX, or ''
  function phoneOf(v) {
    var x = toLatin(v).replace(/\D/g, '').replace(/^(?:00971|971|0)/, '');
    return /^5\d{8}$/.test(x) ? '0' + x : '';
  }
  // 0501234567 -> 0501••••67: the start and the end, as the person can tell it is theirs
  var masked = function (p) { return p.slice(0, 4) + '••••' + p.slice(-2); };

  var api = null, store = null;
  if (X) {
    var idb = null;
    try { idb = w.indexedDB || null; } catch (e) { idb = null; }
    store = X.createStore({ idb: idb, name: CFG.DB || 'tsw' });
    api = X.createApi({ url: CFG.API_URL, build: CFG.BUILD, store: store, crypto: w.crypto, fetch: w.fetch.bind(w), lang: function () { return lang; }, siteUp: siteStatus });
  }

  // the owner's outage line, as in the app (shell main.js siteStatus): /status.json on this site {on, ar, en}, its URL changed once a minute;
  // a missing file or on not true = no line. The same read is the api's probe: true = the site answered (online, only the server is not)
  function siteStatus() {
    if (nav.onLine === false || typeof w.fetch !== 'function') return Promise.resolve(false);
    var ac = typeof w.AbortController === 'function' ? new w.AbortController() : null;
    var tm = w.setTimeout(function () { if (ac) ac.abort(); }, 5000);
    return w.fetch('/status.json?m=' + Math.floor(Date.now() / 60000), { cache: 'no-store', credentials: 'omit', signal: ac ? ac.signal : undefined }).then(function (r) {
      w.clearTimeout(tm);
      return (r.ok ? r.json() : Promise.resolve(null)).catch(function () { return null; }).then(function (j) {
        var s = function (v) { return typeof v === 'string' ? v.trim().slice(0, 300) : ''; };
        var on = !!(j && j.on === true && (s(j.ar) || s(j.en))), el = $('outage'), tx = $('outage-t');
        if (el && tx) {
          if (on) { tx.setAttribute('data-ar', s(j.ar) || s(j.en)); tx.setAttribute('data-en', s(j.en) || s(j.ar)); tx.textContent = tx.getAttribute(lang === 'en' ? 'data-en' : 'data-ar'); }
          el.hidden = !on;
        }
        return true;
      });
    }, function () { w.clearTimeout(tm); return false; });
  }

  // ---------- the theme ----------
  function sysDark() { try { return !!(w.matchMedia && w.matchMedia('(prefers-color-scheme: dark)').matches); } catch (e) { return false; } }
  function theme() { var s = kept('localStorage', TH); return s === 'dark' || s === 'light' ? s : sysDark() ? 'dark' : 'light'; }
  function applyTheme() {
    var th = theme();
    root.setAttribute('data-theme', th);
    $('theme').setAttribute('aria-label', t(th === 'dark' ? 'light' : 'dark'));
  }

  // ---------- the language: every [data-en] element holds text only; its Arabic is kept in data-ar the first time ----------
  function setLang(l, keep) {
    lang = l;
    root.lang = l;
    root.dir = l === 'ar' ? 'rtl' : 'ltr';
    d.title = t('title');
    var els = d.querySelectorAll('[data-en]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.getAttribute('data-ar') == null) el.setAttribute('data-ar', el.textContent);
      el.textContent = el.getAttribute(l === 'en' ? 'data-en' : 'data-ar');
    }
    $('l-ar').setAttribute('aria-pressed', l === 'ar' ? 'true' : 'false');
    $('l-en').setAttribute('aria-pressed', l === 'en' ? 'true' : 'false');
    $('langs').setAttribute('aria-label', t('langs'));
    $('guide-x').setAttribute('aria-label', t('close'));
    // the link to copy or share has no language: it opens in the reader's own
    var u = $('url');
    u.value = w.location.origin + '/get/' + (MN ? '?r=mn' : '');
    u.setAttribute('aria-label', t('link'));
    applyTheme();
    lines();
    if (g.err) err(g.err.at, g.err.k, g.err.v, g.err.raw);
    if (!$('g-code').hidden) tick();
    if (keep) try { w.history.replaceState(null, '', w.location.pathname + (MN ? '?r=mn&l=' : '?l=') + l); } catch (e) { /* ok */ }
  }

  var timer = 0;
  function toast(x) {
    var el = $('toast');
    el.textContent = x;
    el.hidden = false;
    w.clearTimeout(timer);
    timer = w.setTimeout(function () { el.hidden = true; }, 3200);
  }
  var copyTimer = 0;
  function copied() {
    var c = $('copy-t');
    c.textContent = t('copied');
    w.clearTimeout(copyTimer);
    copyTimer = w.setTimeout(function () { c.textContent = c.getAttribute(lang === 'en' ? 'data-en' : 'data-ar'); }, 2500);
  }
  // the clipboard, else the selected field and the old copy command; the link stays in the field to copy by hand
  function copy() {
    var u = $('url');
    var byHand = function () {
      var ok = false;
      try { u.focus(); u.select(); u.setSelectionRange(0, u.value.length); ok = d.execCommand('copy'); } catch (e) { ok = false; }
      if (ok) copied();
    };
    if (nav.clipboard && nav.clipboard.writeText) nav.clipboard.writeText(u.value).then(copied, byHand);
    else byHand();
  }

  // ---------- screens ----------
  var SCREENS = ['g-num', 'g-ok', 'g-code', 'g-no', 'dl', 'inapp', 'pc', 'link'];
  function screen(id, focusEl) {
    for (var i = 0; i < SCREENS.length; i++) hide(SCREENS[i]);
    show(id);
    if (id !== 'g-code') stopTick();
    try { w.scrollTo(0, 0); } catch (e) { /* ok */ }
    if (focusEl) { var f = typeof focusEl === 'string' ? $(focusEl) : $(id).querySelector('h1'); if (f) try { f.focus({ preventScroll: true }); } catch (e) { /* ok */ } }
  }

  // ---------- the gate ----------
  var g = { phone: '', sentAt: 0, wait: 0, left: TRIES, bad: 0, busy: false, err: null, signed: false, mt: '', end: '' };
  // an error line (at: ph, ok, otp) from a key of S (with values) or the server's own text (raw)
  function err(at, k, v, raw) {
    g.err = k || raw ? { at: at, k: k, v: v, raw: raw } : null;
    var x = raw || (k ? t(k, v) : '');
    $(at + '-err-t').textContent = x;
    $(at + '-err').hidden = !x;
    if (at === 'otp') { if (x) $('otp').setAttribute('aria-invalid', 'true'); else $('otp').removeAttribute('aria-invalid'); }
    if (at === 'ph') $('ph').parentNode.classList.toggle('bad', !!x);
  }
  function clearErr() { ['ph', 'ok', 'otp'].forEach(function (a) { $(a + '-err').hidden = true; }); $('otp').removeAttribute('aria-invalid'); $('ph').parentNode.classList.remove('bad'); g.err = null; }
  // a local or server failure in words (the shell's netToast): no connection, busy, the limits, else the server's text
  function netErr(at, r) {
    var c = r.code;
    // no connection only when this site does not answer either (r.down: the phone is online and the server is not)
    if (c === 'net' && !r.down) err(at, 'noNet');
    else if (c === 'busy') err(at, 'busy');
    else if (c === 'budget' || c === 'limit') err(at, 'limit');
    else if (r.msg && !r.local) err(at, '', null, r.msg);
    else err(at, c === 'net' || c === 'timeout' || c === 'fail' ? 'down' : 'fail');
  }
  function busy(id, on) {
    g.busy = on;
    var b = $(id);
    if (!b) return;
    b.disabled = on;
    if (on) b.setAttribute('aria-busy', 'true'); else b.removeAttribute('aria-busy');
  }
  function save() {
    if (MN) ss(SSM, { mt: g.mt, end: g.end, at: now(), sentAt: g.sentAt, wait: g.wait });
    else ss(SS, { phone: g.phone, at: now(), sentAt: g.sentAt, wait: g.wait, left: g.left, bad: g.bad });
  }
  // back from WhatsApp, or a reload: the code step again while it lives
  function resume() {
    if (MN) return mnResume();
    var o = ss(SS), age = o ? now() - Number(o.at) : -1;
    if (!o || !/^05\d{8}$/.test(String(o.phone)) || !(age >= 0 && age < LIFE) || !(Number(o.sentAt) > 0)) { if (o) ss(SS, null); return false; }
    g.phone = o.phone; g.sentAt = Number(o.sentAt); g.wait = Number(o.wait) || 0;
    g.left = Number.isInteger(o.left) ? o.left : TRIES; g.bad = Number(o.bad) || 0;
    openCode(false);
    if (g.left <= 0) { err('otp', 'noTries'); $('otp').disabled = true; }
    return true;
  }
  function numStep(focus) {
    clearErr();
    hide('limited');
    screen('g-num', focus ? 'ph' : null);
  }
  function limited() {
    ss(SS, null); ss(SSM, null);
    numStep(false);
    show('limited');
  }
  function refuse(msg) {
    ss(SS, null); ss(SSM, null);
    $('no-msg').textContent = msg;
    screen('g-no', true);
  }
  function numNext() {
    if (MN) { milNext(); return; }
    var v = phoneOf($('ph').value);
    if (!v) { err('ph', 'phoneBad'); try { $('ph').focus(); } catch (e) { /* ok */ } return; }
    g.phone = v;
    $('ok-num').textContent = masked(v);
    clearErr();
    screen('g-ok', true);
  }
  // a=login: the code goes by WhatsApp (the answer is the same neutral «sent» for any number); again: the resend on the code step
  async function send(again) {
    if (MN) { await mnSend(again); return; }
    if (g.busy) return;
    var at = again ? 'otp' : 'ok', btn = again ? 'resend' : 'ok-yes';
    busy(btn, true);
    var r;
    try { r = await api.login(g.phone); } catch (e) { r = { code: 'fail', local: true }; }
    busy(btn, false);
    if (r.code === 'sent') {
      var wt = Number(r.wait != null ? r.wait : r.res && r.res.wait);
      g.sentAt = now(); g.wait = wt > 0 ? wt * 1000 : 0; g.left = TRIES; g.bad = 0;
      save();
      if (again) { toast(t('resent')); $('otp').disabled = false; }
      openCode(true);
      return;
    }
    if (r.code === 'limit') { limited(); return; }
    if (r.code === 'bad') { numStep(true); err('ph', 'phoneBad'); return; }
    if (r.code === 'off' || r.code === 'origin' || r.code === 'upgrade') { refuse(r.msg || t('fail')); return; }
    netErr(at, r);
  }

  var ticker = 0;
  function stopTick() { if (ticker) { w.clearInterval(ticker); ticker = 0; } }
  function tick() {
    var el = now() - g.sentAt, exp = CODE_LIFE - el, wait = Math.max(RESEND, g.wait) - el, tt = $('timer-t');
    while (tt.firstChild) tt.removeChild(tt.firstChild);
    if (exp <= 0) tt.textContent = t('timeUp');
    else if (wait > 0) {
      tt.appendChild(d.createTextNode(t('resendIn')));
      var b = d.createElement('b');
      b.textContent = count('sec', Math.ceil(wait / 1000));
      tt.appendChild(b);
    }
    $('resend').hidden = exp > 0 && wait > 0;
    $('nohint').hidden = el < HINT;
  }
  function openCode(focus) {
    $('code-num').textContent = MN ? g.end : masked(g.phone);
    $('dom').textContent = CFG.DOMAIN || w.location.host;
    $('otp').value = '';
    $('otp').disabled = false;
    clearErr();
    screen('g-code', focus ? 'otp' : null);
    tick();
    stopTick();
    ticker = w.setInterval(tick, 500);
  }
  // a=otp with the phone-made ds and device key (the shell's api.otp): in (signed in), mfa (a right code; staff finish with their password
  // inside the app), else the shell's refusals
  async function verify() {
    if (MN) { await mnVerify(); return; }
    var inp = $('otp'), v = toLatin(inp.value).replace(/\D/g, '').slice(0, 6);
    if (g.busy) return;
    if (v.length !== 6) { err('otp', 'codeShort'); try { inp.focus(); } catch (e) { /* ok */ } return; }
    busy('verify', true);
    var r;
    try { r = await api.otp(g.phone, v); } catch (e) { r = { code: 'fail', local: true }; }
    if (r.code === 'in' || r.code === 'mfa') { await passed(r.code === 'in'); busy('verify', false); return; }
    busy('verify', false);
    var c = r.code;
    if (c === 'inactive' || c === 'suspended') { refuse(r.msg || t(c)); return; }
    if (c === 'limit') { limited(); return; }
    if (c === 'off' || c === 'origin' || c === 'upgrade') { refuse(r.msg || t('fail')); return; }
    inp.value = '';
    if (c === 'bad') {
      var left = Number.isInteger(r.left) ? r.left : r.res && Number.isInteger(r.res.left) ? r.res.left : TRIES - g.bad - 1;
      g.bad++; g.left = Math.max(0, left);
      save();
      if (g.left > 0) { err('otp', 'bad', { n: count('tries', g.left) }); try { inp.focus(); } catch (e) { /* ok */ } } else { err('otp', 'noTries'); inp.disabled = true; }
      return;
    }
    if (c === 'expired') { err('otp', 'expired'); return; }
    if (c === 'refused') { if (r.msg) err('otp', '', null, r.msg); else err('otp', 'refused'); return; }
    netErr('otp', r);
  }
  // the gate is passed. iPhone and iPad: the installed app keeps its own storage, apart from Safari's, so the session just made would only
  // sit in Safari (a device row nobody uses): it is signed out here (a=logout), and the app asks for its own code once installed
  async function passed(signed) {
    ss(SS, null); ss(SSM, null);
    if (signed && ios && !MN) { try { await api.signOut(false); } catch (e) { /* the phone wipes itself whatever the answer */ } }
    g.signed = signed && !ios;
    ss(OK, now());
    download(true);
  }
  async function paste() {
    var x = '';
    try { x = String(await nav.clipboard.readText()); } catch (e) { x = ''; }
    var c = (/(?:^|\D)(\d{6})(?!\d)/.exec(toLatin(x)) || ['', ''])[1];
    if (!c) { toast(t('noPaste')); return; }
    $('otp').value = c;
    verify();
  }
  function openWa() {
    save();
    try { w.location.assign('whatsapp://'); } catch (e) { /* no WhatsApp */ }
  }

  // ---------- the coordinators' gate (MN v1, /get/?r=mn) ----------
  // the coordinator's words in place of the team's (data-mn-ar / data-mn-en), before the first setLang; the number field takes digits
  function mnWords() {
    var els = d.querySelectorAll('[data-mn-ar]');
    for (var i = 0; i < els.length; i++) { els[i].setAttribute('data-ar', els[i].getAttribute('data-mn-ar')); els[i].setAttribute('data-en', els[i].getAttribute('data-mn-en')); }
    hide('ph-cc');
    var ph = $('ph');
    ph.setAttribute('type', 'text'); ph.setAttribute('autocomplete', 'off'); ph.setAttribute('placeholder', ''); ph.setAttribute('maxlength', '14');
    hide('ok-br'); hide('ok-num');
  }
  // one line in both languages (setLang switches it): the sentence of the «هل هذا رقمك؟» step with the end of his registered number
  function both(el, k, v) { el.setAttribute('data-ar', fill(S.ar[k], v)); el.setAttribute('data-en', fill(S.en[k], v)); el.textContent = el.getAttribute(lang === 'en' ? 'data-en' : 'data-ar'); }
  // the device id (as the app's ctx.mn.dv: 32 random bytes, base64url) kept in the record with the key mn; the portal binds the step and the session to it
  function newDv() {
    var b = new Uint8Array(32), x = '';
    w.crypto.getRandomValues(b);
    for (var i = 0; i < b.length; i++) x += String.fromCharCode(b[i]);
    return w.btoa(x).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  async function mnRec() {
    var r = null;
    try { r = store ? await store.get('mn') : null; } catch (e) { r = null; }
    r = r && typeof r === 'object' ? r : {};
    if (!DV_RE.test(String(r.dv || ''))) { r = { dv: newDv() }; try { if (store) await store.set('mn', r); } catch (e) { /* this tab only */ } }
    return r;
  }
  // a POST to the portal as the app makes it (views/coord.js post): its JSON answer, else {code: net | timeout | fail, local}
  async function mnPost(a, f) {
    var rec = await mnRec(), body = new w.URLSearchParams();
    body.set('fmt', 'app'); body.set('a', a); body.set('l', lang); body.set('dv', rec.dv);
    Object.keys(f || {}).forEach(function (k) { body.set(k, f[k]); });
    var ac = typeof w.AbortController === 'function' ? new w.AbortController() : null;
    var tm = w.setTimeout(function () { if (ac) ac.abort(); }, 20000);
    try {
      var res = await w.fetch(CFG.MN_URL, { method: 'POST', body: body, mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: ac ? ac.signal : undefined });
      var j = null;
      try { j = JSON.parse(await res.text()); } catch (e) { j = null; }
      w.clearTimeout(tm);
      return j && typeof j === 'object' && typeof j.code === 'string' ? j : { code: 'fail', local: true };
    } catch (e) {
      w.clearTimeout(tm);
      var up = false;
      try { up = await siteStatus(); } catch (e2) { up = false; }
      return { code: e && e.name === 'AbortError' ? 'timeout' : 'net', down: !!up, local: true };
    }
  }
  var mnEnd = function (v) { return String(v == null ? '' : v).replace(/\D/g, '').slice(-4); };
  var mnTkOk = function (v) { return typeof v === 'string' && v.length > 4 && v.length <= 400; };
  function mnStart() { ss(SSM, null); g.mt = ''; numStep(true); err('ph', 'start'); }
  // the military number: digits (Arabic digits too), «هل هذا رقمك؟» with the end of his registered number, or «غير موجود»
  async function milNext() {
    if (g.busy) return;
    var m = toLatin($('ph').value).replace(/[\s\-_.\/]/g, '');
    if (!/^\d{2,12}$/.test(m)) { err('ph', 'milBad'); try { $('ph').focus(); } catch (e) { /* ok */ } return; }
    busy('ph-next', true);
    var r = await mnPost('mlook', { mil: m });
    busy('ph-next', false);
    if (r.code === 'who' && mnTkOk(r.mt) && mnEnd(r.end)) {
      g.mt = r.mt; g.end = mnEnd(r.end);
      both($('ok-say'), 'who', { e: g.end });
      clearErr();
      screen('g-ok', true);
      return;
    }
    if (r.code === 'nomil') { err('ph', 'nomil'); return; }
    if (r.code === 'lock' || r.code === 'limit') { limited(); return; }
    netErr('ph', r);
  }
  async function mnSend(again) {
    if (g.busy) return;
    var at = again ? 'otp' : 'ok', btn = again ? 'resend' : 'ok-yes';
    busy(btn, true);
    var r = await mnPost('msend', { mt: g.mt });
    busy(btn, false);
    if (r.code === 'sent') {
      if (mnTkOk(r.mt)) g.mt = r.mt;
      if (mnEnd(r.end)) g.end = mnEnd(r.end);
      var wt = Number(r.wait);
      g.sentAt = now(); g.wait = wt > 0 ? wt * 1000 : 0;
      save();
      if (again) toast(t('resent'));
      $('otp').disabled = false;
      openCode(true);
      return;
    }
    if (r.code === 'start') { mnStart(); return; }
    if (r.code === 'lock' || r.code === 'limit') { limited(); return; }
    if ((r.code === 'wait' || r.code === 'day') && r.msg) { err(at, '', null, r.msg); return; }
    netErr(at, r);
  }
  // a right code: his record as the app keeps it; on iPhone and iPad the installed app has its own storage, so only the device id stays
  async function mnVerify() {
    var inp = $('otp'), v = toLatin(inp.value).replace(/\D/g, '').slice(0, 6);
    if (g.busy) return;
    if (v.length !== 6) { err('otp', 'codeShort'); try { inp.focus(); } catch (e) { /* ok */ } return; }
    busy('verify', true);
    var r = await mnPost('mcode', { mt: g.mt, v: v });
    if (r.code === 'in' && typeof r.tok === 'string' && r.tok) {
      var rec = await mnRec(), keep = !ios;
      if (keep) {
        var me = r.me && typeof r.me === 'object' ? r.me : {}, s = function (x, n) { return String(x == null ? '' : x).trim().slice(0, n); };
        try { await store.set('mn', { dv: rec.dv, tok: r.tok, exp: Number(r.exp) || now() + 864e5, me: { name: s(me.name, 80), rank: s(me.rank, 40), unit: s(me.unit, 200), l: me.l === 'en' ? 'en' : 'ar' } }); } catch (e) { keep = false; }
      }
      await passed(keep);
      busy('verify', false);
      return;
    }
    busy('verify', false);
    var c = r.code;
    if (c === 'start') { mnStart(); return; }
    if (c === 'lock' || c === 'limit') { limited(); return; }
    inp.value = '';
    if (c === 'bad') { if (r.msg) err('otp', '', null, r.msg); else err('otp', 'mbad'); try { inp.focus(); } catch (e) { /* ok */ } return; }
    if (c === 'expired') { err('otp', 'expired'); return; }
    netErr('otp', r);
  }
  // back from WhatsApp, or a reload: the code step again while the step lives (the portal's ticket, mil_tk_m)
  function mnResume() {
    var o = ss(SSM), age = o ? now() - Number(o.at) : -1;
    if (!o || !mnTkOk(o.mt) || !mnEnd(o.end) || !(age >= 0 && age < LIFE) || !(Number(o.sentAt) > 0)) { if (o) ss(SSM, null); return false; }
    g.mt = o.mt; g.end = mnEnd(o.end); g.sentAt = Number(o.sentAt); g.wait = Number(o.wait) || 0;
    openCode(false);
    return true;
  }

  // ---------- the download page ----------
  function lines() {
    $('guide-line').textContent = t('guideLine');
    $('and-line').textContent = t(CFG.ANDROID_APK_URL ? 'andApk' : 'andWeb');
    $('ios-line').textContent = t(CFG.IOS_MANIFEST_URL ? 'iosEnt' : 'iosWeb');
  }
  function download(focus) {
    screen('dl', focus ? true : null);
    lines();
    $('mine-and').hidden = !android;
    $('mine-ios').hidden = !ios;
    // Android: the file when one is set, else the web app; on another phone the button shows the Android steps
    var apk = android && !!CFG.ANDROID_APK_URL;
    $('apk').hidden = !apk;
    $('install').hidden = apk;
    if (apk) $('apk').setAttribute('href', CFG.ANDROID_APK_URL);
    // the web app installed here opens with the session this browser holds
    if (android && !apk && g.signed) show('and-in');
    if (MN && ios) show('mn-ios');
    // iPhone: the enterprise build's install dialog when its manifest is set, else the Add to Home Screen steps
    var ent = ios && !!CFG.IOS_MANIFEST_URL && !!CFG.IOS_LINK;
    $('ios-get').hidden = !ent;
    $('ios-btn').hidden = ent;
    if (ent) $('ios-get').setAttribute('href', CFG.IOS_LINK);
  }

  // ---------- the guide sheet ----------
  var opener = null;
  function arrow(cls, keyFrom) {
    var a = $('arrow'), k = $('arrow-key'), src = d.querySelector(keyFrom);
    while (k.firstChild) k.removeChild(k.firstChild);
    if (src) k.appendChild(src.cloneNode(true));
    a.className = 'arrow ' + cls + ' ' + dir;
    a.hidden = false;
  }
  function tab(which) {
    var on = which === 'ios';
    $('t-ios').setAttribute('aria-selected', on ? 'true' : 'false');
    $('t-and').setAttribute('aria-selected', on ? 'false' : 'true');
    $('ios').hidden = !on;
    $('p-and').hidden = on;
    var ent = !!CFG.IOS_MANIFEST_URL, v = ios ? iosv : '27';
    ['ios27', 'ios26', 'ios18', 'ios-ent'].forEach(function (id) { hide(id); });
    show(ent ? 'ios-ent' : 'ios' + v);
    $('ios-older').hidden = ent || ios;
    $('and-file').hidden = !CFG.ANDROID_APK_URL;
    $('and-web').hidden = !!CFG.ANDROID_APK_URL;
    // the arrow at Safari's own button, on an iPhone (an iPad's bar is at the top)
    var point = on && iphone && !ent;
    $('guide').classList.toggle('pointing', point);
    if (point) arrow('p' + iosv, '#ios' + iosv + ' .key svg');
    else if (!sam) hide('arrow');
  }
  function openGuide(which, from) {
    opener = from || null;
    show('guide');
    root.classList.add('lock');
    tab(which);
    try { $('guide-t').focus({ preventScroll: true }); } catch (e) { /* ok */ }
  }
  function closeGuide() {
    hide('guide');
    root.classList.remove('lock');
    if (!sam) hide('arrow');
    if (opener) try { opener.focus({ preventScroll: true }); } catch (e) { /* ok */ }
  }

  // ---------- Android: the browser's install dialog, else its own menu ----------
  var bip = null, asked = false;
  w.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); bip = e; if (asked) helpOff(); });
  w.addEventListener('appinstalled', function () { bip = null; done(); });
  // the line under the button, scrolled into view (the Android card may sit low on a short phone)
  function into(id) {
    var el = $(id), reduce = !!(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches);
    try { el.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }); } catch (e) { /* old browsers */ }
  }
  function help() {
    asked = true;
    if (sam) { show('and-sam'); arrow('psam', '#and-sam .key svg'); into('and-sam'); return; }
    show('and-menu');
    into('and-menu');
    $('arrow-up').className = 'arrow up ' + dir;
    show('arrow-up');
    // the arrow points at ⋮ above the page: the bar's buttons step aside
    hide('tools');
  }
  function helpOff() { hide('and-menu'); hide('and-sam'); hide('arrow-up'); hide('arrow'); show('tools'); }
  function done() {
    helpOff();
    hide('install');
    hide('apk');
    hide('and-apk');
    show('and-done');
  }
  function install() {
    if (!android) { openGuide('and', $('install')); return; }
    var e = bip;
    if (!e) { help(); return; }
    bip = null;
    try {
      Promise.resolve(e.prompt()).then(function () { return e.userChoice; })
        .then(function (c) { if (c && c.outcome === 'accepted') done(); else help(); }, help);
    } catch (er) { help(); }
  }

  function init() {
    if (MN) mnWords();
    setLang(lang, false);
    $('l-ar').addEventListener('click', function () { if (lang !== 'ar') setLang('ar', true); });
    $('l-en').addEventListener('click', function () { if (lang !== 'en') setLang('en', true); });
    $('theme').addEventListener('click', function () { kept('localStorage', TH, theme() === 'dark' ? 'light' : 'dark'); applyTheme(); });
    try { w.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); } catch (e) { /* old browsers keep the first */ }
    $('copy').addEventListener('click', copy);
    $('ph').addEventListener('input', function () { if (g.err) clearErr(); hide('limited'); });
    $('ph').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); numNext(); } });
    $('ph-next').addEventListener('click', numNext);
    $('ok-yes').addEventListener('click', function () { send(false); });
    $('ok-no').addEventListener('click', function () { if (MN) { g.mt = ''; numStep(true); err('ph', 'notMe'); return; } $('ph').value = ''; g.phone = ''; numStep(true); });
    $('otp').addEventListener('input', function () {
      var inp = $('otp'), v = toLatin(inp.value).replace(/\D/g, '').slice(0, 6);
      if (inp.value !== v) inp.value = v;
      if (g.err && g.err.at === 'otp' && v) err('otp', '');
      if (v.length === 6) verify();
    });
    $('otp').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); verify(); } });
    $('verify').addEventListener('click', verify);
    $('resend').addEventListener('click', function () { send(true); });
    $('paste').addEventListener('click', paste);
    $('openwa').addEventListener('click', openWa);
    $('change').addEventListener('click', function () { ss(SS, null); ss(SSM, null); numStep(true); });
    $('no-back').addEventListener('click', function () { numStep(true); });
    $('guide-btn').addEventListener('click', function () { openGuide(ios || !android ? 'ios' : 'and', $('guide-btn')); });
    $('ios-btn').addEventListener('click', function () { openGuide('ios', $('ios-btn')); });
    $('install').addEventListener('click', install);
    $('apk').addEventListener('click', function () { w.setTimeout(function () { show('and-apk'); into('and-apk'); }, 50); });
    $('t-ios').addEventListener('click', function () { tab('ios'); });
    $('t-and').addEventListener('click', function () { tab('and'); });
    $('guide-x').addEventListener('click', closeGuide);
    $('guide-scrim').addEventListener('click', closeGuide);
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('guide').hidden) closeGuide(); });
    siteStatus();

    if (inApp && (ios || android)) {
      screen('inapp');
      show(ios ? 'inapp-ios' : 'inapp-and');
      show(ios ? 'inapp-ios-how' : 'inapp-and-how');
      show('link');
      return;
    }
    if (!ios && !android) { screen('pc'); show('link'); return; }
    // the app's own worker (same scope as the app opening it later), for browsers that still ask for one before they offer the install
    if (android && 'serviceWorker' in nav) nav.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () { /* the button still works */ });
    var ok = ss(OK);
    if (typeof ok === 'number' && now() - ok >= 0 && now() - ok < OK_LIFE) { download(false); return; }
    if (!api) { refuse(t('fail')); return; }
    // the coordinators' gate: this phone already holds a live coordinator session (the app's record mn)
    if (MN) {
      Promise.resolve(store.get('mn')).then(function (r) {
        if (r && typeof r === 'object' && typeof r.tok === 'string' && r.tok && Number(r.exp) > now() && DV_RE.test(String(r.dv || ''))) { g.signed = true; download(false); return; }
        if (!resume()) numStep(false);
      }, function () { if (!resume()) numStep(false); });
      return;
    }
    // this phone already holds the app's session (the installed app shares this browser's storage on Android): it is verified
    api.signedInfo().then(function (info) {
      if (info && info.exp > now()) { g.signed = true; download(false); return; }
      if (!resume()) numStep(false);
    }, function () { if (!resume()) numStep(false); });
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init); else init();
})();
