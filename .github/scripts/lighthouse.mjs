// Lighthouse (mobile) on / and /get/ (lighthouse.yml). The sign-in API host is blocked (blockedUrlPatterns), so no code is ever sent.
// Writes the reports to OUT, the 4 scores per page to the job summary (AR + EN), a warning when accessibility < 90 or performance < 70,
// and RESULT (json, for the status branch and the weekly report). Never fails on scores.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SITE = (process.env.SITE || 'https://shj-security-media-services.github.io').replace(/\/+$/, '');
const OUT = process.env.OUT || 'lh';
const RESULT = process.env.RESULT || path.join(OUT, 'lighthouse.json');
const LH = process.env.LIGHTHOUSE || 'lighthouse@13.5.0';
const BLOCK = ['*ahmedzenary.app.n8n.cloud*', '*.n8n.cloud*'];
const PAGES = [{ id: 'home', path: '/' }, { id: 'get', path: '/get/' }];
const CATS = [
  ['performance', 'الأداء', 'Performance'],
  ['accessibility', 'سهولة الوصول', 'Accessibility'],
  ['best-practices', 'أفضل الممارسات', 'Best practices'],
  ['seo', 'محركات البحث', 'SEO'],
];
fs.mkdirSync(OUT, { recursive: true });

function run(pg) {
  const base = path.join(OUT, pg.id);
  const args = ['--yes', LH, SITE + pg.path, '--quiet', '--output=json', '--output=html', `--output-path=${base}`,
    '--chrome-flags=--headless=new --no-sandbox --disable-gpu', '--max-wait-for-load=60000',
    ...BLOCK.map((b) => `--blocked-url-patterns=${b}`)];
  for (let i = 1; i <= 2; i++) {
    const r = spawnSync('npx', args, { encoding: 'utf8', stdio: ['ignore', 'inherit', 'inherit'], timeout: 240000 });
    if (r.status === 0 && fs.existsSync(base + '.report.json')) return JSON.parse(fs.readFileSync(base + '.report.json', 'utf8'));
    console.log(`lighthouse ${pg.path}: attempt ${i} failed (${r.status})`);
  }
  return null;
}

const pages = [];
for (const pg of PAGES) {
  const rep = run(pg);
  const rec = { path: pg.path, ok: !!rep };
  if (rep) {
    for (const [k] of CATS) rec[k] = rep.categories[k] && rep.categories[k].score != null ? Math.round(rep.categories[k].score * 100) : null;
    const reqs = (rep.audits['network-requests'] && rep.audits['network-requests'].details && rep.audits['network-requests'].details.items) || [];
    rec.requests = reqs.length;
    rec.n8nRequests = reqs.filter((x) => /n8n\.cloud/i.test(String(x.url))).length; // blocked ones show as failed requests
    rec.lcp = rep.audits['largest-contentful-paint'] && rep.audits['largest-contentful-paint'].displayValue;
    rec.cls = rep.audits['cumulative-layout-shift'] && rep.audits['cumulative-layout-shift'].displayValue;
    rec.tbt = rep.audits['total-blocking-time'] && rep.audits['total-blocking-time'].displayValue;
    rec.lighthouse = rep.lighthouseVersion;
    if (rec.accessibility != null && rec.accessibility < 90) console.log(`::warning title=Lighthouse ${pg.path}::accessibility ${rec.accessibility} < 90`);
    if (rec.performance != null && rec.performance < 70) console.log(`::warning title=Lighthouse ${pg.path}::performance ${rec.performance} < 70`);
  } else console.log(`::warning title=Lighthouse ${pg.path}::Lighthouse could not run on this page`);
  pages.push(rec);
  console.log(JSON.stringify(rec));
}

const run_ = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : '';
fs.writeFileSync(RESULT, JSON.stringify({ at: new Date().toISOString(), commit: process.env.GITHUB_SHA || '', run: run_, pages }, null, 1) + '\n');

const dot = (v, warn) => (v == null ? '-' : `${v >= 90 ? '🟢' : v >= warn ? '🟠' : '🔴'} ${v}`);
const L = ['### Lighthouse (جوال · mobile)', '',
  '| الصفحة · Page | ' + CATS.map(([, ar, en]) => `${ar} · ${en}`).join(' | ') + ' | LCP | TBT | CLS |',
  '|---|' + CATS.map(() => '---').join('|') + '|---|---|---|'];
for (const p of pages) {
  L.push(`| \`${p.path}\` | ${p.ok ? CATS.map(([k]) => dot(p[k], k === 'performance' ? 70 : k === 'accessibility' ? 90 : 50)).join(' | ') : 'تعذّر القياس · failed | | |'} | ${p.lcp || '-'} | ${p.tbt || '-'} | ${p.cls || '-'} |`);
}
L.push('', 'تنبيه إذا قلّت سهولة الوصول عن 90 أو الأداء عن 70 (لا يفشل الفحص). · Warns when accessibility < 90 or performance < 70 (never fails).',
  'درجة محركات البحث منخفضة عمداً: الصفحات `noindex` و robots.txt يمنع الفهرسة. · SEO is low on purpose: the pages are `noindex` and robots.txt disallows crawling.',
  `طلبات خادم تسجيل الدخول (محجوبة) · Sign-in API requests (blocked): ${pages.map((p) => `\`${p.path}\` ${p.n8nRequests ?? '-'}`).join(', ')}`,
  'التقارير الكاملة في ملف «lighthouse-reports» أسفل صفحة التشغيل. · Full reports: the «lighthouse-reports» artifact of this run.');
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, L.join('\n') + '\n');
