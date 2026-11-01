/* SPA80 shapes v1. Pure validators that map the API data shape to view models.
   Output uses arrays of pairs (not objects keyed by API strings) so keys such as
   "__proto__" from a response can never touch an object prototype. */
export const OPS = Object.freeze(['home', 'list', 'order']);
export const WHEN = Object.freeze(['today', 'upcoming']);

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v, max = 500) => typeof v === 'string' ? v.slice(0, max)
  : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
const count = v => Number.isSafeInteger(v) && v >= 0 ? v
  : typeof v === 'string' && /^\d{1,9}$/.test(v) ? Number(v) : null;

export const validStage = v => typeof v === 'string' && v.length > 0 && v.length <= 60 &&
  /^[\p{L}\p{N}_ -]+$/u.test(v) && v.trim() === v;
export const validId = v => typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(v);
const idOf = v => typeof v === 'number' && Number.isSafeInteger(v) ? String(v) : typeof v === 'string' ? v : '';

export function normalizeHome(d) {
  if (!isObj(d) || !isObj(d.counts)) return null;
  const counts = [];
  for (const [stage, value] of Object.entries(d.counts)) {
    const n = count(value);
    if (n === null) return null;
    if (validStage(stage)) counts.push({stage, n});
    if (counts.length >= 50) break;
  }
  const today = count(d.today ?? 0), upcoming = count(d.upcoming ?? 0);
  if (today === null || upcoming === null) return null;
  return {counts, total: counts.reduce((sum, row) => sum + row.n, 0), today, upcoming};
}

export function normalizeItem(it) {
  if (!isObj(it)) return null;
  const id = idOf(it.id);
  if (!validId(id)) return null;
  const photographers = Array.isArray(it.photographers)
    ? it.photographers.map(name => text(name, 120)).filter(Boolean).slice(0, 20) : [];
  return {
    id, ref: text(it.ref, 80), title: text(it.title, 300), stage: text(it.stage, 60),
    stage_label: text(it.stage_label, 120), date: text(it.date, 40), time: text(it.time, 40),
    entity: text(it.entity, 200), photographers,
    updated_ms: Number.isFinite(it.updated_ms) ? it.updated_ms : null
  };
}

export function normalizeList(d) {
  if (!isObj(d) || !Array.isArray(d.items)) return null;
  const items = [], seen = new Set();
  for (const raw of d.items.slice(0, 200)) {
    const item = normalizeItem(raw);
    if (item && !seen.has(item.id)) { seen.add(item.id); items.push(item); }
  }
  const c = d.nextCursor;
  const nextCursor = (typeof c === 'string' && c.length > 0 && c.length <= 500) ? c
    : (typeof c === 'number' && Number.isFinite(c)) ? String(c) : null;
  return {items, nextCursor};
}

const primitive = v => typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v));
export function normalizeOrder(d) {
  if (!isObj(d) || !isObj(d.order)) return null;
  const o = d.order, fields = [];
  for (const [key, value] of Object.entries(o)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(key)) continue;
    if (primitive(value)) fields.push([key, text(String(value), 2000)]);
    else if (Array.isArray(value) && value.every(primitive)) fields.push([key, value.slice(0, 50).map(x => text(String(x), 200)).join('، ')]);
    if (fields.length >= 80) break;
  }
  const slots = Array.isArray(d.slots) ? d.slots.filter(isObj).slice(0, 50).map(s => ({
    name: text(s.name, 120), response: text(s.response, 120), spec: text(s.spec, 300)
  })) : [];
  const id = idOf(o.id);
  return {
    id: validId(id) ? id : '', ref: text(o.ref, 80), title: text(o.title, 300),
    stage: text(o.stage, 60), stage_label: text(o.stage_label, 120), fields, slots
  };
}

const NORMALIZERS = {home: normalizeHome, list: normalizeList, order: normalizeOrder};

// Envelope {ok, op, lang, data, ts}. Returns {op, lang, ts, data} or null.
export function normalizeEnvelope(op, body) {
  if (!OPS.includes(op) || !isObj(body) || body.ok !== true) return null;
  if (body.op !== undefined && body.op !== op) return null;
  const data = NORMALIZERS[op](body.data);
  if (!data) return null;
  const ts = Number.isFinite(body.ts) ? body.ts : typeof body.ts === 'string' ? body.ts.slice(0, 40) : null;
  return {op, lang: body.lang === 'en' ? 'en' : 'ar', ts, data};
}

// Only these params are ever sent, per op.
export function cleanParams(op, params = {}) {
  const p = isObj(params) ? params : {}, out = {};
  if (op === 'list') {
    const q = typeof p.q === 'string' ? p.q.trim().slice(0, 100) : '';
    if (q) out.q = q;
    if (validStage(p.stage)) out.stage = p.stage;
    if (WHEN.includes(p.when)) out.when = p.when;
    if (typeof p.cursor === 'string' && p.cursor && p.cursor.length <= 500) out.cursor = p.cursor;
  } else if (op === 'order') {
    const id = idOf(p.id);
    if (validId(id)) out.id = id;
  }
  return out;
}
