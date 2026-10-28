// Uptime check of the public site, every 5 minutes (uptime.yml). Static files only: it never calls the sign-in API.
//   1. curl (20 s timeout, 2 retries) each URL and checks its status, size and content.
//   2. Keeps the history in STATUS_DIR/uptime (the status branch): daily counts, incidents, the last result, a shields.io badge.
//   3. Down: opens one issue «🔴 الموقع متوقف» (label عطل), or comments on the open one when what fails changes.
//      Back up: comments «✅ عاد الموقع» with the downtime and closes it.
//   4. Writes a table to the job summary.
// Env: SITE, STATUS_DIR, GH_TOKEN (issues), GITHUB_* (run link), DRY_RUN=1 (no issues).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SITE = (process.env.SITE || 'https://shj-security-media-services.github.io').replace(/\/+$/, '');
const DIR = path.join(process.env.STATUS_DIR || 'status', 'uptime');
const DRY = process.env.DRY_RUN === '1';
const LABEL = 'عطل';
const TITLE = '🔴 الموقع متوقف';
const RUN = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : '';
const KEEP_DAYS = 120;

const text = (b) => b.toString('utf8');
const json = (b) => JSON.parse(text(b));
const CHECKS = [
  { id: 'home', name: 'الصفحة الرئيسية · Home', path: '/', test: (b) => b.length > 1000 && text(b).includes('name="build"') },
  { id: 'get', name: 'صفحة التنزيل · Install page', path: '/get/', test: (b) => b.length > 1000 && text(b).includes('id="g-num"') },
  { id: 'manifest', name: 'Manifest', path: '/manifest.webmanifest', test: (b) => !!json(b).name },
  { id: 'sw', name: 'Service worker', path: '/sw.js', test: (b) => b.length > 1000 },
  { id: 'version', name: 'version.json', path: '/version.json', test: (b) => typeof json(b).build === 'string' },
  { id: 'apk', name: 'تطبيق أندرويد · Android APK', path: '/app/security-media.apk', test: (b) => b.length > 500 * 1024 && b[0] === 0x50 && b[1] === 0x4b, need: '> 500 KB, zip' },
  { id: 'assetlinks', name: 'assetlinks.json', path: '/.well-known/assetlinks.json', test: (b) => JSON.stringify(json(b)).includes('ae.shj.securitymedia'), need: 'JSON with ae.shj.securitymedia' },
];

function probe(c) {
  const tmp = path.join(os.tmpdir(), 'uptime-' + c.id);
  try { fs.rmSync(tmp, { force: true }); } catch { /* none */ }
  const r = spawnSync('curl', ['-sS', '-L', '-o', tmp, '-w', '%{http_code} %{time_total} %{size_download}', '--max-time', '20',
    '--retry', '2', '--retry-delay', '3', '--retry-all-errors', '-A', 'site-uptime-check (GitHub Actions)', SITE + c.path], { encoding: 'utf8' });
  const [code, t, size] = String(r.stdout || '').trim().split(/\s+/);
  const out = { id: c.id, name: c.name, path: c.path, code: Number(code) || 0, ms: Math.round(Number(t || 0) * 1000), bytes: Number(size) || 0 };
  if (out.code !== 200) { out.ok = false; out.why = out.code ? 'HTTP ' + out.code : (String(r.stderr || '').trim().split('\n').pop() || 'no answer').slice(0, 120); return out; }
  let body = Buffer.alloc(0);
  try { body = fs.readFileSync(tmp); } catch { /* empty */ }
  try { out.ok = !!c.test(body); } catch { out.ok = false; }
  if (!out.ok) out.why = 'unexpected content' + (c.need ? ' (need ' + c.need + ')' : '');
  return out;
}

const read = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch { return d; } };
const write = (f, v) => fs.writeFileSync(path.join(DIR, f), JSON.stringify(v, null, 1) + '\n');
const dubai = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d)) + ' (UAE)';
function dur(ms) {
  const m = Math.max(1, Math.round(ms / 60000));
  if (m < 60) return `${m} دقيقة · ${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return `${h} ساعة ${r} دقيقة · ${h} h ${r} min`;
}
function gh(args, input) {
  if (DRY) { console.log('[dry] gh ' + args.join(' ')); return ''; }
  const r = spawnSync('gh', args, { encoding: 'utf8', input });
  if (r.status !== 0) throw new Error('gh ' + args.slice(0, 2).join(' ') + ' failed: ' + String(r.stderr).trim().slice(0, 300));
  return String(r.stdout).trim();
}
// the open «🔴 الموقع متوقف» issue (other issues with the label are left alone)
const openIssue = () => {
  const n = gh(['issue', 'list', '--label', LABEL, '--state', 'open', '--limit', '20', '--json', 'number,title', '--jq', `map(select(.title == "${TITLE}"))[0].number // empty`]);
  return n ? Number(n) : null;
};

// ---------- 1. the checks ----------
const now = Date.now();
const results = CHECKS.map(probe);
const failing = results.filter((r) => !r.ok);
const up = failing.length === 0;
const table = ['| الفحص · Check | الرابط · Path | الحالة · Status | HTTP | الزمن · Time | الحجم · Size |', '|---|---|---|---|---|---|']
  .concat(results.map((r) => `| ${r.name} | \`${r.path}\` | ${r.ok ? '✅' : '❌ ' + r.why} | ${r.code || '-'} | ${r.ms} ms | ${r.bytes.toLocaleString('en-US')} B |`)).join('\n');
results.forEach((r) => console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.path} ${r.code} ${r.ms}ms ${r.bytes}B${r.why ? ' ' + r.why : ''}`));

// ---------- 2. the history ----------
fs.mkdirSync(DIR, { recursive: true });
const day = new Date(now).toISOString().slice(0, 10);
const daily = read('daily.json', {});
daily[day] = daily[day] || { n: 0, ok: 0 };
daily[day].n += 1;
if (up) daily[day].ok += 1;
const cutoff = new Date(now - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
for (const k of Object.keys(daily)) if (k < cutoff) delete daily[k];
const pctOver = (days) => {
  const from = new Date(now - (days - 1) * 86400000).toISOString().slice(0, 10);
  let n = 0, ok = 0;
  for (const [k, v] of Object.entries(daily)) if (k >= from) { n += v.n; ok += v.ok; }
  return n ? (100 * ok) / n : null;
};
const p1 = pctOver(1), p7 = pctOver(7), p30 = pctOver(30);
const fmt = (p) => (p == null ? '-' : (p >= 99.995 ? '100' : p.toFixed(2)) + '%');

// ---------- 3. the issue ----------
const state = read('state.json', { down: false, since: null, issue: null, failing: [] });
const incidents = read('incidents.json', []);
const failIds = failing.map((r) => r.id).sort();
let note = '';
try {
  if (!up) {
    const body = (head) => `${head}\n\n${table}\n\n` +
      `بدأ التوقف · Down since: ${dubai(state.down && state.since ? state.since : now)}\n\n${RUN ? `[سجل الفحص · Check run](${RUN})\n\n` : ''}` +
      'يُفحص الموقع كل 5 دقائق، وسيُغلق هذا البلاغ تلقائياً عند عودته. · Checked every 5 minutes; this issue closes itself when the site is back.';
    let n = openIssue();
    if (!state.down) { state.down = true; state.since = now; state.failing = []; }
    if (!n) {
      const url = gh(['issue', 'create', '--title', TITLE, '--label', LABEL, '--body-file', '-'],
        body('تعذّر الوصول إلى جزء من الموقع أو جاء بمحتوى غير متوقع. · Part of the site did not answer or answered with unexpected content.'));
      n = Number((url.match(/\/issues\/(\d+)/) || [])[1]) || null;
      note = `opened issue #${n}`;
    } else if (failIds.join(',') !== (state.failing || []).join(',')) {
      gh(['issue', 'comment', String(n), '--body-file', '-'], body('تغيّر ما يتعطل في الموقع: · What fails changed:'));
      note = `commented on issue #${n}`;
    } else note = `issue #${n} already open`;
    state.issue = n;
    state.failing = failIds;
  } else if (state.down || openIssue()) {
    const n = state.issue || openIssue();
    const since = state.since || now;
    const text = `✅ عاد الموقع · The site is back\n\nمدة التوقف · Downtime: ${dur(now - since)} (${dubai(since)} → ${dubai(now)})\n\n${table}\n\n${RUN ? `[سجل الفحص · Check run](${RUN})` : ''}`;
    if (n) {
      gh(['issue', 'comment', String(n), '--body-file', '-'], text);
      gh(['issue', 'close', String(n), '--reason', 'completed']);
      note = `closed issue #${n}`;
    }
    incidents.push({ start: new Date(since).toISOString(), end: new Date(now).toISOString(), minutes: Math.round((now - since) / 60000), issue: n, failing: state.failing });
    Object.assign(state, { down: false, since: null, issue: null, failing: [] });
  }
} catch (e) {
  console.log('::warning title=Uptime::' + String(e.message).replace(/\n/g, ' '));
}
if (note) console.log(note);

write('daily.json', daily);
write('state.json', state);
write('incidents.json', incidents.slice(-200));
write('last.json', { at: new Date(now).toISOString(), up, failing: failIds, uptime: { '24h': p1, '7d': p7, '30d': p30 }, checks: results, run: RUN });
const color = p30 == null ? 'lightgrey' : p30 >= 99.9 ? 'brightgreen' : p30 >= 99 ? 'green' : p30 >= 95 ? 'yellow' : 'red';
write('badge.json', { schemaVersion: 1, label: 'uptime 30d', message: fmt(p30), color });

// ---------- 4. the summary ----------
const sum = [`### ${up ? '✅ الموقع يعمل · Site up' : '🔴 الموقع متوقف · Site down'}`, '', table, '',
  `نسبة التوفر · Uptime: 24h **${fmt(p1)}** · 7d **${fmt(p7)}** · 30d **${fmt(p30)}**`, note ? `\n${note}` : ''].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, sum + '\n');
if (!up) console.log(`::warning title=Uptime::down: ${failing.map((r) => r.path + ' ' + r.why).join('; ')}`);
console.log(`uptime 24h ${fmt(p1)} 7d ${fmt(p7)} 30d ${fmt(p30)}`);
