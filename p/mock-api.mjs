/* SPA80 mock API v1 (?mock=1). Synthetic, in-memory, no network.
   Returns the same envelope as the real webhook: {ok, op, lang, data, ts}.
   All names are fictional; no phone numbers or real people. */
import {px4PrefixMatch} from './search.mjs';
import {cleanParams} from './shapes.mjs';

const STAGES = [
  ['new', {ar: 'جديد', en: 'New'}],
  ['review', {ar: 'قيد المراجعة', en: 'In review'}],
  ['assigned', {ar: 'مُسند', en: 'Assigned'}],
  ['done', {ar: 'مكتمل', en: 'Done'}]
];
const LABEL = new Map(STAGES);
const PAGE = 4;

export const dubaiDate = (ms = Date.now()) => new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(ms));

function seed(nowMs) {
  const day = n => dubaiDate(nowMs + n * 86_400_000);
  const rows = [
    ['T-1001', 'new', 0, '09:00', ['مصور تجريبي ١']],
    ['T-1002', 'review', 0, '13:30', []],
    ['T-1003', 'assigned', 1, '10:00', ['مصور تجريبي ١', 'مصور تجريبي ٢']],
    ['T-1004', 'assigned', 3, '16:00', ['مصور تجريبي ٣']],
    ['T-1005', 'done', -2, '11:00', ['مصور تجريبي ٢']],
    ['T-1006', 'new', 5, '08:30', []],
    ['T-1007', 'review', 2, '18:00', []]
  ];
  return rows.map(([id, stage, offset, time, photographers], i) => ({
    id, ref: id, stage, date: day(offset), time, photographers,
    title: {ar: 'تغطية تجريبية ' + (i + 1), en: 'Demo coverage ' + (i + 1)},
    entity: {ar: 'جهة تجريبية ' + String.fromCharCode(0x0623 + (i % 3)), en: 'Demo entity ' + 'ABC'[i % 3]},
    updated_ms: nowMs - i * 3_600_000
  }));
}

const wait = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(new Error('ABORTED'));
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('ABORTED')); }, {once: true});
});

export function createMockApi({lang = 'ar', latency = 200, now = Date.now} = {}) {
  const language = lang === 'en' ? 'en' : 'ar';
  const rows = seed(now());
  const stats = {reads: 0};
  const item = r => ({id: r.id, ref: r.ref, title: r.title[language], stage: r.stage,
    stage_label: LABEL.get(r.stage)[language], date: r.date, time: r.time,
    entity: r.entity[language], photographers: [...r.photographers], updated_ms: r.updated_ms});
  const envelope = (op, data) => ({status: 200, body: {ok: true, op, lang: language, data, ts: now()}});
  async function read(op, params = {}, {signal} = {}) {
    stats.reads++;
    await wait(latency, signal);
    const p = cleanParams(op, params), today = dubaiDate(now());
    if (op === 'home') {
      const counts = {};
      for (const [stage] of STAGES) counts[stage] = rows.filter(r => r.stage === stage).length;
      return envelope(op, {counts, today: rows.filter(r => r.date === today).length, upcoming: rows.filter(r => r.date > today).length});
    }
    if (op === 'list') {
      const found = rows.filter(r => (!p.stage || r.stage === p.stage) &&
        (!p.when || (p.when === 'today' ? r.date === today : r.date > today)) &&
        (!p.q || px4PrefixMatch(p.q, [r.ref, r.title.ar, r.title.en, r.entity.ar, r.entity.en].join(' '))));
      const start = /^\d{1,4}$/.test(p.cursor || '') ? Number(p.cursor) : 0;
      const page = found.slice(start, start + PAGE).map(item);
      return envelope(op, {items: page, nextCursor: start + PAGE < found.length ? String(start + PAGE) : null});
    }
    if (op === 'order') {
      const r = rows.find(x => x.id === p.id);
      if (!r) return {status: 404};
      const base = item(r);
      return envelope(op, {
        order: {...base, location: language === 'en' ? 'Demo venue' : 'موقع تجريبي', notes: language === 'en' ? 'Fictional record.' : 'سجل خيالي.'},
        slots: r.photographers.map((name, i) => ({name, response: language === 'en' ? (i ? 'Pending' : 'Accepted') : (i ? 'بانتظار الرد' : 'مقبول'), spec: language === 'en' ? 'Photography' : 'تصوير فوتوغرافي'}))
      });
    }
    return {status: 400};
  }
  return {read, getStats: () => ({...stats})};
}
