import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import config from '../data.mjs';
const require = createRequire(path.join(process.cwd(), '.github/tools/package.json'));
const { chromium } = require('playwright');
const output = path.resolve('a1-results');
const root = process.cwd();
let server, browser, origin;
const timings = [], network = [];
const types = { '.html':'text/html', '.mjs':'application/javascript', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.webp':'image/webp', '.png':'image/png', '.woff2':'font/woff2' };

before(async () => {
  await mkdir(output, { recursive: true });
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      let file = path.resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
      if (!file.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
      if (pathname.startsWith('/__ref__/')) {
        const name = pathname.endsWith('panel.html') ? 'panel.html' : 'app.html';
        let html = await readFile(path.join(process.env.A1_REFERENCE_DIR, name), 'utf8');
        html = html.replace(/<link[^>]*https:\/\/fonts\.[^>]*>/g, '');
        const css = await readFile(path.join(root, 'app.c763769565.css'), 'utf8');
        const fonts = [...css.matchAll(/@font-face\{[^}]+\}/g)].map(x => x[0].replaceAll('url(fonts/', 'url(/fonts/')).join('');
        response.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Content-Security-Policy':"connect-src 'none'; form-action 'none'; object-src 'none'" });
        response.end('<style>' + fonts + '</style>' + html); return;
      }
      const body = await readFile(file);
      response.writeHead(200, { 'Content-Type': (types[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' });
      response.end(body);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});
after(async () => {
  await writeFile(path.join(output, 'performance.json'), JSON.stringify({ targetMs:config.limits.navigationTargetMs, clickToPaintMs:timings, externalRequests:network }, null, 2));
  await browser?.close();
  await new Promise(resolve => server?.close(resolve));
});
async function context(options = {}) {
  const ctx = await browser.newContext({ viewport:{ width:390,height:844 }, serviceWorkers:'block', ...options });
  await ctx.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    network.push(route.request().url()); return route.abort();
  });
  return ctx;
}
async function loaded(ctx, query = 'role=ph&lang=en&theme=light', hash = '') {
  const page = await ctx.newPage();
  await page.goto(origin + '/a1/?' + query + hash);
  await page.locator('.hello').waitFor();
  await page.evaluate(() => document.fonts.ready);
  return page;
}
for (const role of Object.keys(config.roles)) for (const lang of config.languages) for (const theme of ['light','dark']) for (const width of [390,1280]) {
  test(`home ${role} ${lang} ${theme} ${width}`, async () => {
    const ctx = await context({ viewport:{ width,height:width === 390 ? 844 : 900 } });
    try {
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(origin + `/a1/?role=${role}&lang=${lang}&theme=${theme}`);
      await page.locator('.hello').waitFor(); await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('.tabbar .tab').count(), 4);
      assert.equal(await page.locator('.launch .lic').count(), config.roles[role].shortcuts.length);
      assert.equal(await page.locator('html').getAttribute('dir'), lang === 'ar' ? 'rtl' : 'ltr');
      assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
      const dimensions = await page.evaluate(() => ({ width:innerWidth, scroll:document.documentElement.scrollWidth, app:document.getElementById('app').getBoundingClientRect().width }));
      assert.ok(dimensions.scroll <= dimensions.width);
      assert.ok(dimensions.app <= dimensions.width);
      if (lang === 'en') assert.doesNotMatch(await page.locator('#app').innerText(), /[\u0600-\u06ff]/);
      await page.screenshot({ path:path.join(output, `${role}-${width}-${lang}-${theme}.png`) });
      await page.getByRole('heading', { name:config.copy.waiting[lang],exact:true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path:path.join(output, `${role}-${width}-${lang}-${theme}-waiting.png`) });
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
}
for (const role of Object.keys(config.roles)) {
  test(`${role}: local shortcuts, tab navigation and click-to-paint budget`, async () => {
    const ctx = await context();
    try {
      const page = await loaded(ctx, `role=${role}&lang=en&theme=light`);
      const initialRequests = await page.evaluate(() => performance.getEntriesByType('resource').length);
      await page.evaluate(() => {
        document.addEventListener('click', () => {
          const start = performance.now();
          requestAnimationFrame(() => requestAnimationFrame(() => { document.documentElement.dataset.clickPaint = String(performance.now() - start); }));
        }, { once:true,capture:true });
      });
      await page.locator('.launch .lic').first().click();
      await page.getByRole('heading', { name:config.copy.later.en }).waitFor();
      await page.waitForFunction(() => !!document.documentElement.dataset.clickPaint);
      const time = await page.locator('html').getAttribute('data-click-paint');
      timings.push({ role,ms:Number(time) });
      assert.ok(Number(time) < config.limits.navigationTargetMs, time);
      assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').length), initialRequests);
      await page.getByRole('button', {name:'Home',exact:true}).last().click();
      await page.locator('.hello').waitFor();
      await page.locator('.tabbar .tab').nth(1).click();
      await page.waitForFunction(tab => document.querySelector('.tabbar [aria-current=page]')?.textContent === tab, config.services[config.roles[role].tab].title.en);
      assert.equal(await page.locator('.tabbar [aria-current=page]').innerText(), config.services[config.roles[role].tab].title.en);
      assert.equal(await page.getByRole('button',{name:/Accept|Approve|Send|Reject|Cancel/}).count(),0);
    } finally { await ctx.close(); }
  });
}
test('search services, work records and mil; empty and markup results stay text', async () => {
  const ctx = await context();
  try {
    const page = await loaded(ctx);
    await page.getByRole('button',{name:config.copy.search.en,exact:true}).click();
    const input = page.getByRole('searchbox');
    await input.fill('90001'); assert.equal(await page.locator('.a1-result').count(),1);
    await input.fill('demo event'); assert.equal(await page.locator('.a1-result').count(),1);
    await input.fill('heading out'); assert.equal(await page.locator('.a1-result').count(),1);
    await input.fill('<img src=x onerror=alert(1)>'); assert.equal(await page.locator('.a1-result').count(),0);
    assert.equal(await page.locator('.a1-search img').count(),0);
    assert.ok(await page.getByText('No results',{exact:true}).isVisible());
  } finally { await ctx.close(); }
});
test('mobile controls translate the app, contain keyboard focus and close with Escape', async () => {
  const ctx = await context();
  try {
    const page = await loaded(ctx);
    await page.getByRole('button',{name:'DEMO',exact:true}).click();
    assert.equal(await page.locator('#app').getAttribute('inert'),'');
    await page.getByRole('button',{name:'Close',exact:true}).focus();
    await page.keyboard.press('Tab'); assert.equal(await page.locator('#demo-role').evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#app').getAttribute('inert'),null);
    await page.getByRole('button',{name:'DEMO',exact:true}).click();
    await page.getByLabel('Language',{exact:true}).selectOption('ar');
    assert.equal(await page.locator('html').getAttribute('lang'),'ar');
    await page.getByRole('button',{name:'DEMO',exact:true}).click();
    await page.getByLabel('دور العرض التجريبي',{exact:true}).selectOption('req');
    assert.equal(await page.locator('.view').getAttribute('data-role'),'req');
  } finally { await ctx.close(); }
});
test('cached DEMO identifiers restore; blocked storage still renders immediately', async () => {
  const ctx = await context();
  try {
    const page = await loaded(ctx);
    await page.waitForFunction(() => !!document.getElementById('app').dataset.cache);
    await page.reload(); await page.waitForFunction(() => document.getElementById('app').dataset.cache === 'restored');
  } finally { await ctx.close(); }
  const denied = await context();
  try {
    await denied.addInitScript(() => { Object.defineProperty(window,'indexedDB',{get(){throw new DOMException('Disabled','SecurityError');}}); });
    const page = await loaded(denied);
    assert.ok(await page.locator('.hello').isVisible());
    await page.waitForFunction(() => document.getElementById('app').dataset.cache === 'bundled');
  } finally { await denied.close(); }
});
test('system theme, invalid role/route and browser history', async () => {
  const ctx = await context({colorScheme:'dark'});
  try {
    const page = await loaded(ctx,'role=__proto__&lang=en&theme=auto','#/bad-route');
    assert.equal(await page.locator('.view').getAttribute('data-role'),'ph');
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()),'#14110e');
    await page.getByRole('button',{name:config.copy.search.en,exact:true}).click();
    await page.getByRole('searchbox').waitFor();
    await page.goBack(); await page.locator('.hello').waitFor();
  } finally { await ctx.close(); }
});
test('open both authoritative mockups in Chromium for visual review', async () => {
  const ctx = await context({viewport:{width:1280,height:1000}});
  try {
    const page = await ctx.newPage();
    for (const name of ['app','panel']) {
      await page.goto(origin + `/__ref__/${name}.html` + (name === 'app' ? '#d-ph' : ''));
      await page.locator(name === 'app' ? '#app' : '#page').waitFor(); await page.evaluate(() => document.fonts.ready);
      await page.screenshot({path:path.join(output,`reference-${name}.png`)});
    }
  } finally { await ctx.close(); }
});
test('all browser requests stayed on the test origin', () => assert.deepEqual(network, []));
