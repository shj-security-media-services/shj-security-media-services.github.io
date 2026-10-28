// Visual check of the site's public pages: Playwright chromium screenshots of / and /get/ on an iPhone (390x844, iOS Safari UA) and an
// Android phone (360x780, Chrome Android UA), light and dark, Arabic and English, compared with the baselines by pixelmatch, plus axe-core
// on every screen (reported, never failing).
// SAFETY: every request that leaves the site's own origin is aborted (the sign-in API on the n8n host above all: it sends WhatsApp codes
// to real people). Nothing is typed and no button is pressed.
// Env: SITE (origin), SHOTS (new screenshots), BASELINE (current baselines, may be empty), DIFFS, RESULT (json), SUMMARY (markdown).
// Exit 0 always when the screenshots were taken; the workflow decides from RESULT.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const SITE = (process.env.SITE || 'https://shj-security-media-services.github.io').replace(/\/+$/, '');
const ORIGIN = new URL(SITE).origin;
const SHOTS = process.env.SHOTS || 'vis/shots';
const BASELINE = process.env.BASELINE || 'vis/baseline';
const DIFFS = process.env.DIFFS || 'vis/diffs';
const RESULT = process.env.RESULT || 'vis/result.json';
const SUMMARY = process.env.SUMMARY || 'vis/summary.md';
const THRESHOLD = 0.1; // pixelmatch per-pixel colour threshold
const MAX_RATIO = 0.005; // a screen changed when more than 0.5% of its pixels differ
const FIXED_TIME = new Date('2026-01-04T05:00:00Z'); // Sunday 09:00 in Dubai
const N8N = /(^|\.)n8n\.cloud$/i;

const PAGES = [
  { id: 'home', path: '/' },
  { id: 'get', path: '/get/' },
];
const DEVICES = [
  {
    id: 'iphone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  },
  {
    id: 'android', viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  },
];
const SCHEMES = ['light', 'dark'];
// both pages pick the language from navigator.language (English only for an English phone), so the context's locale picks it
const LANGS = [
  { id: 'ar', locale: 'ar-AE' },
  { id: 'en', locale: 'en-US' },
];
const FREEZE = '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;' +
  'transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}';

const blocked = {};
const mkdir = (d) => fs.mkdirSync(d, { recursive: true });
[SHOTS, DIFFS, path.dirname(RESULT), path.dirname(SUMMARY)].forEach(mkdir);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newContext(browser, dev, scheme, lang) {
  const ctx = await browser.newContext({
    viewport: dev.viewport, isMobile: dev.isMobile, hasTouch: dev.hasTouch, deviceScaleFactor: dev.deviceScaleFactor, userAgent: dev.userAgent,
    colorScheme: scheme, locale: lang.locale, timezoneId: 'Asia/Dubai', reducedMotion: 'reduce',
    serviceWorkers: 'block', bypassCSP: true, // the pages' CSP forbids the injected freeze style and axe
  });
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.origin === ORIGIN) return route.continue();
    const k = N8N.test(u.hostname) ? u.hostname + ' (sign-in API)' : u.hostname;
    blocked[k] = (blocked[k] || 0) + 1;
    return route.abort('blockedbyclient');
  });
  await ctx.addInitScript((css) => {
    const add = () => { const s = document.createElement('style'); s.setAttribute('data-visual-check', ''); s.textContent = css; (document.head || document.documentElement).appendChild(s); };
    if (document.documentElement) add(); else document.addEventListener('DOMContentLoaded', add);
  }, FREEZE);
  return ctx;
}

// load the page and take screenshots until two in a row are identical (at most 6)
async function capture(page, url) {
  await page.clock.install({ time: FIXED_TIME });
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => document.fonts && document.fonts.ready.then(() => true));
  await sleep(1500);
  let prev = null;
  for (let i = 0; i < 6; i++) {
    const buf = await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide', scale: 'css' });
    if (prev && Buffer.compare(prev, buf) === 0) return { buf, stable: true };
    prev = buf;
    await sleep(700);
  }
  return { buf: prev, stable: false };
}

// pixel difference of two PNG buffers; different sizes compare on the larger canvas (the missing area counts as changed)
function compare(aBuf, bBuf) {
  const a = PNG.sync.read(aBuf), b = PNG.sync.read(bBuf);
  const w = Math.max(a.width, b.width), h = Math.max(a.height, b.height);
  const pad = (p) => {
    if (p.width === w && p.height === h) return p.data;
    const out = new PNG({ width: w, height: h });
    out.data.fill(0);
    PNG.bitblt(p, out, 0, 0, p.width, p.height, 0, 0);
    return out.data;
  };
  const diff = new PNG({ width: w, height: h });
  const n = pixelmatch(pad(a), pad(b), diff.data, w, h, { threshold: THRESHOLD, includeAA: false });
  return { pixels: n, ratio: n / (w * h), sameSize: a.width === b.width && a.height === b.height, size: [b.width, b.height], diff: PNG.sync.write(diff) };
}

function axeOf(res) {
  const by = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  const rules = [];
  for (const v of res.violations) {
    const imp = v.impact || 'minor';
    by[imp] = (by[imp] || 0) + 1;
    rules.push({ id: v.id, impact: imp, nodes: v.nodes.length, help: v.help });
  }
  return { ...by, rules };
}

const browser = await chromium.launch();
const shots = [];
try {
  for (const pg of PAGES) for (const dev of DEVICES) for (const scheme of SCHEMES) for (const lang of LANGS) {
    const name = `${pg.id}-${dev.id}-${scheme}-${lang.id}`;
    const url = SITE + pg.path;
    // first load: the screenshot and axe
    const ctx = await newContext(browser, dev, scheme, lang);
    const page = await ctx.newPage();
    const first = await capture(page, url);
    let axe = null;
    try { axe = axeOf(await new AxeBuilder({ page }).analyze()); } catch (e) { axe = { error: String(e && e.message || e).slice(0, 200) }; }
    const htmlLang = await page.evaluate(() => document.documentElement.lang + '/' + document.documentElement.dir).catch(() => '?');
    await ctx.close();
    // second load in a fresh context: the same screen must come out the same (no flake)
    const ctx2 = await newContext(browser, dev, scheme, lang);
    const second = await capture(await ctx2.newPage(), url);
    await ctx2.close();
    const again = compare(first.buf, second.buf);
    const flaky = again.ratio > MAX_RATIO / 5 || !again.sameSize;
    fs.writeFileSync(path.join(SHOTS, name + '.png'), first.buf);
    const rec = { name, page: pg.path, device: dev.id, scheme, lang: lang.id, htmlLang, stable: first.stable && second.stable, flaky, flakeRatio: again.ratio, axe };
    const basePath = path.join(BASELINE, name + '.png');
    if (!fs.existsSync(basePath)) rec.status = 'new';
    else {
      const c = compare(fs.readFileSync(basePath), first.buf);
      rec.ratio = c.ratio; rec.pixels = c.pixels; rec.size = c.size;
      rec.status = c.ratio > MAX_RATIO || !c.sameSize ? 'changed' : 'same';
      if (rec.status === 'changed') fs.writeFileSync(path.join(DIFFS, name + '.png'), c.diff);
    }
    shots.push(rec);
    console.log(`${name}: ${rec.status}${rec.ratio != null ? ' ' + (rec.ratio * 100).toFixed(3) + '%' : ''}${flaky ? ' FLAKY ' + (again.ratio * 100).toFixed(3) + '%' : ''} lang=${htmlLang}` +
      (axe && !axe.error ? ` axe c${axe.critical}/s${axe.serious}/m${axe.moderate}/n${axe.minor}` : ' axe error'));
  }
} finally {
  await browser.close();
}

const count = (s) => shots.filter((x) => x.status === s).length;
const axeTotal = { critical: 0, serious: 0, moderate: 0, minor: 0 };
const ruleMap = new Map();
for (const s of shots) {
  if (!s.axe || s.axe.error) continue;
  for (const k of Object.keys(axeTotal)) axeTotal[k] += s.axe[k] || 0;
  for (const r of s.axe.rules) {
    const e = ruleMap.get(r.id) || { ...r, screens: 0, nodes: 0 };
    e.screens += 1; e.nodes += r.nodes; ruleMap.set(r.id, e);
  }
}
const result = {
  site: SITE, at: new Date().toISOString(), total: shots.length, changed: count('changed'), same: count('same'), new: count('new'),
  flaky: shots.filter((s) => s.flaky).length, axe: axeTotal, rules: [...ruleMap.values()], blocked, shots,
};
fs.writeFileSync(RESULT, JSON.stringify(result, null, 1));

const pct = (r) => (r == null ? '' : (r * 100).toFixed(2) + '%');
const icon = { same: '✅', new: '🆕', changed: '🎨' };
const L = [];
L.push(`### الفحص البصري · Visual check`);
L.push(`${shots.length} شاشة · screens: ✅ ${result.same} بلا تغيير / unchanged · 🎨 ${result.changed} تغيّرت / changed · 🆕 ${result.new} جديدة / new` +
  (result.flaky ? ` · ⚠️ ${result.flaky} غير مستقرة / flaky` : ''));
L.push('');
L.push('| الشاشة · Screen | الشكل · Visual | الفرق · Diff | axe critical | serious | moderate | minor |');
L.push('|---|---|---|---|---|---|---|');
for (const s of shots) {
  const a = s.axe && !s.axe.error ? s.axe : { critical: '?', serious: '?', moderate: '?', minor: '?' };
  L.push(`| \`${s.name}\` | ${icon[s.status]}${s.flaky ? ' ⚠️' : ''} | ${pct(s.ratio)} | ${a.critical} | ${a.serious} | ${a.moderate} | ${a.minor} |`);
}
L.push('');
L.push(`#### axe-core: ${axeTotal.critical} critical · ${axeTotal.serious} serious · ${axeTotal.moderate} moderate · ${axeTotal.minor} minor (تنبيه فقط · warning only)`);
if (ruleMap.size) {
  L.push('| القاعدة · Rule | Impact | الشاشات · Screens | العناصر · Nodes | |');
  L.push('|---|---|---|---|---|');
  const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
  for (const r of [...ruleMap.values()].sort((x, y) => order[x.impact] - order[y.impact] || y.screens - x.screens)) {
    L.push(`| \`${r.id}\` | ${r.impact} | ${r.screens} | ${r.nodes} | ${r.help.replace(/\|/g, '/')} |`);
  }
}
L.push('');
const bl = Object.entries(blocked);
L.push(`طلبات خارج الموقع أُوقفت · Requests outside the site blocked: ` + (bl.length ? bl.map(([h, n]) => `\`${h}\` ×${n}`).join(', ') : 'none'));
fs.writeFileSync(SUMMARY, L.join('\n') + '\n');
console.log(`total ${shots.length}: same ${result.same}, changed ${result.changed}, new ${result.new}, flaky ${result.flaky}; axe ${JSON.stringify(axeTotal)}; blocked ${JSON.stringify(blocked)}`);
