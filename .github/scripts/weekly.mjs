// Weekly report (weekly-report.yml, Sunday 05:00 UTC): one issue «📋 التقرير الأسبوعي — <date>» (label تقرير) with the week's uptime and
// incidents, the latest Lighthouse, visual, link and Scorecard results and the week's commits; the previous report issue is closed.
// Reads the status branch (STATUS_DIR) and the repository (git log). Env: GH_TOKEN, GITHUB_*, DRY_RUN=1 (print only).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const DIR = process.env.STATUS_DIR || 'status';
const REPO = process.env.GITHUB_REPOSITORY || 'shj-security-media-services/shj-security-media-services.github.io';
const SERVER = process.env.GITHUB_SERVER_URL || 'https://github.com';
const DRY = process.env.DRY_RUN === '1';
const LABEL = 'تقرير';
const TITLE = '📋 التقرير الأسبوعي';
const now = Date.now();
const WEEK = 7 * 86400000;
const since = now - WEEK;

const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch { return null; } };
const sh = (cmd, args) => { const r = spawnSync(cmd, args, { encoding: 'utf8' }); return r.status === 0 ? String(r.stdout).trim() : ''; };
const gh = (args, input) => {
  if (DRY) { console.log('[dry] gh ' + args.join(' ')); return ''; }
  const r = spawnSync('gh', args, { encoding: 'utf8', input });
  if (r.status !== 0) throw new Error('gh failed: ' + String(r.stderr).trim().slice(0, 300));
  return String(r.stdout).trim();
};
const date = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', dateStyle: 'medium' }).format(new Date(d));
const when = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d));
const fresh = (x) => x && x.at && new Date(x.at).getTime() >= since;
const L = [];

// ---------- uptime ----------
const daily = read('uptime/daily.json') || {};
const incidents = (read('uptime/incidents.json') || []).filter((i) => new Date(i.end).getTime() >= since);
const state = read('uptime/state.json') || {};
let n = 0, ok = 0;
const from = new Date(since + 86400000).toISOString().slice(0, 10);
for (const [k, v] of Object.entries(daily)) if (k >= from) { n += v.n; ok += v.ok; }
const pct = n ? (100 * ok) / n : null;
L.push('## 🟢 التوفر · Uptime');
L.push(pct == null ? 'لا توجد بيانات بعد · no data yet' :
  `**${pct >= 99.995 ? '100' : pct.toFixed(2)}%** خلال 7 أيام (${n.toLocaleString('en-US')} فحصاً، كل 5 دقائق) · over 7 days (${n.toLocaleString('en-US')} checks)`);
if (state.down) L.push(`\n🔴 **الموقع متوقف الآن** منذ ${when(state.since)} · **down now** since ${when(state.since)}${state.issue ? ` (#${state.issue})` : ''}`);
if (incidents.length) {
  L.push('', '| بدأ · Start | انتهى · End | المدة · Minutes | ما تعطل · Failing | |', '|---|---|---|---|---|');
  for (const i of incidents) L.push(`| ${when(i.start)} | ${when(i.end)} | ${i.minutes} | ${(i.failing || []).join(', ')} | ${i.issue ? '#' + i.issue : ''} |`);
} else L.push('', 'لا توقف هذا الأسبوع · no incidents this week');

// ---------- the latest runs of each check ----------
function lastRun(file) {
  const out = sh('gh', ['run', 'list', '--workflow', file, '--limit', '1', '--json', 'conclusion,status,url,createdAt,event']);
  try { return JSON.parse(out)[0] || null; } catch { return null; }
}
const mark = (r) => (!r ? '—' : r.status !== 'completed' ? '⏳' : r.conclusion === 'success' ? '✅' : r.conclusion === 'failure' ? '❌' : '⚪ ' + r.conclusion);
const runCell = (r) => (r ? `${mark(r)} [${date(r.createdAt)}](${r.url})` : '—');

L.push('', '## 🚦 Lighthouse');
const lh = read('lighthouse.json');
if (lh && lh.pages) {
  L.push(`آخر قياس · latest: ${when(lh.at)} ([run](${lh.run}))`, '', '| الصفحة · Page | الأداء · Perf | الوصول · A11y | الممارسات · BP | SEO |', '|---|---|---|---|---|');
  for (const p of lh.pages) L.push(`| \`${p.path}\` | ${p.performance ?? '-'} | ${p.accessibility ?? '-'} | ${p['best-practices'] ?? '-'} | ${p.seo ?? '-'} |`);
} else L.push('لا توجد نتيجة بعد · no result yet');

L.push('', '## 🎨 الفحص البصري · Visual');
const vis = read('visual.json');
if (vis) {
  const o = { same: '✅ مطابق للمرجع · matches the baselines', created: '🆕 أُنشئ المرجع · baselines created', accepted: '✅ اعتُمد مرجع جديد · new baselines accepted', changed: '🎨 تغيّر الشكل · changed', failed: '❌ تعذّر الفحص · failed' };
  L.push(`${o[vis.outcome] || vis.outcome}: ${vis.total} شاشة · screens, ${vis.changed} تغيّرت · changed${vis.flaky ? `, ${vis.flaky} غير مستقرة · flaky` : ''} — ${when(vis.at)} ([run](${vis.run}))`);
  if (vis.axe) L.push(`axe-core: ${vis.axe.critical} critical · ${vis.axe.serious} serious · ${vis.axe.moderate} moderate · ${vis.axe.minor} minor` +
    (vis.rules && vis.rules.length ? ` (${vis.rules.map((r) => '`' + r.id + '`').join(', ')})` : ''));
} else L.push('لا توجد نتيجة بعد · no result yet');

L.push('', '## 🔗 الروابط · Links');
const lk = read('links.json');
if (lk) L.push(`${lk.outcome === 'ok' ? '✅ كل الروابط تعمل · all links work' : '❌ روابط مكسورة · broken links'}: ${lk.total ?? '?'} رابطاً · links, ${lk.errors ?? '?'} أخطاء · errors — ${when(lk.at)} ([run](${lk.run}))`);
else L.push('لا توجد نتيجة بعد · no result yet');

L.push('', '## 🛡️ OpenSSF Scorecard');
let sc = null;
try {
  const r = spawnSync('curl', ['-fsS', '--max-time', '20', `https://api.scorecard.dev/projects/github.com/${REPO}`], { encoding: 'utf8' });
  if (r.status === 0) sc = JSON.parse(r.stdout);
} catch { sc = null; }
sc = sc || read('scorecard.json');
if (sc && sc.score != null) {
  const low = (sc.checks || []).filter((c) => c.score >= 0 && c.score < 5).map((c) => `${c.name} ${c.score}`);
  L.push(`**${sc.score}** / 10 (${date(sc.date || sc.at)}) · [viewer](https://scorecard.dev/viewer/?uri=github.com/${REPO})` + (low.length ? `\n\nأقل من 5 · below 5: ${low.join(', ')}` : ''));
} else L.push('لا توجد نتيجة بعد · no result yet');

L.push('', '## ⚙️ آخر تشغيل لكل فحص · Latest run of each check', '', '| الفحص · Check | النتيجة · Result |', '|---|---|');
for (const [f, name] of [['uptime.yml', 'Uptime'], ['lighthouse.yml', 'Lighthouse'], ['visual.yml', 'Visual'], ['links.yml', 'Links'],
  ['scorecard.yml', 'Scorecard'], ['codeql.yml', 'CodeQL'], ['size.yml', 'Size budget']]) L.push(`| ${name} | ${runCell(lastRun(f))} |`);

// ---------- commits ----------
const log = sh('git', ['log', 'origin/main', `--since=${new Date(since).toISOString()}`, '--no-merges', '--pretty=format:%H%x09%ad%x09%s', '--date=short']);
const commits = log ? log.split('\n') : [];
L.push('', `## 📝 التغييرات · Commits (${commits.length})`);
if (commits.length) {
  for (const c of commits.slice(0, 40)) {
    const [h, d, s] = c.split('\t');
    L.push(`- [\`${h.slice(0, 7)}\`](${SERVER}/${REPO}/commit/${h}) ${d} · ${s.replace(/@/g, '@​')}`);
  }
  if (commits.length > 40) L.push(`- … ${commits.length - 40} more`);
} else L.push('لا تغييرات هذا الأسبوع · no commits this week');

const run = process.env.GITHUB_RUN_ID ? `${SERVER}/${REPO}/actions/runs/${process.env.GITHUB_RUN_ID}` : '';
const head = `تقرير الأسبوع ${date(since)} → ${date(now)} لموقع https://shj-security-media-services.github.io · Week ${date(since)} → ${date(now)}`;
const body = [head, '', ...L, '', run ? `---\n[سجل التقرير · Report run](${run})` : ''].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, body + '\n');
if (DRY) { console.log(body); process.exit(0); }

const title = `${TITLE} — ${new Date(now).toISOString().slice(0, 10)}`;
const prev = gh(['issue', 'list', '--label', LABEL, '--state', 'open', '--limit', '20', '--json', 'number,title', '--jq', `map(select(.title | startswith("${TITLE}"))) | .[].number`]);
const url = gh(['issue', 'create', '--title', title, '--label', LABEL, '--body-file', '-'], body);
console.log('report: ' + url);
for (const p of prev.split('\n').filter(Boolean)) {
  gh(['issue', 'comment', p, '--body', `التقرير الجديد · The new report: ${url}`]);
  gh(['issue', 'close', p, '--reason', 'completed']);
}
