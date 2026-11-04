import config from './data.mjs';
import { text, itemsFor, search, initialState, validSnapshot } from './model.mjs';

const state = { ...initialState(config, new URLSearchParams(location.search)), cached: false, query: '' };
const app = document.getElementById('app');
const views = document.getElementById('views');
const tabs = document.getElementById('tabs');
const controls = document.getElementById('demo-controls');
const tr = value => text(value, state.lang);
const t = key => tr(config.copy[key]);
const person = () => config.people.find(p => p.mil === config.roles[state.role].mil);
const paths = {
 home:'M3 10.5 12 3l9 7.5M5 9.5V21h5v-7h4v7h5V9.5',
 camera:'M4 6h4l2-3h4l2 3h4v14H4ZM16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
 orders:'M5 4h14v18H5ZM9 2h6v4H9ZM9 11h6M9 15h6',
 user:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2',
 team:'M13 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0M3 21v-2a7 7 0 0 1 14 0v2M17 4a3 3 0 0 1 0 6M19 14a6 6 0 0 1 3 5v2',
 bell:'M5 16h14l-2-3V8A5 5 0 0 0 7 8v5ZM10 21h4',
 search:'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0M15 15l6 6',
 calendar:'M3 5h18v16H3ZM3 10h18M8 2v6M16 2v6',
 clock:'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M12 6v6l4 2',
 phone:'M7 3H3v4c1 8 6 13 14 14h4v-4l-5-2-2 2-7-7 2-2Z',
 car:'M4 10l2-6h12l2 6M3 10h18v8H3ZM6 18v3M18 18v3M6 14h2M16 14h2',
 alert:'M12 3 2 21h20ZM12 9v5M12 17v1',
 swap:'M3 7h17l-4-4M21 17H4l4 4M20 7l-4 4M4 17l4-4',
 pin:'M19 9c0 6-7 13-7 13S5 15 5 9a7 7 0 0 1 14 0M14 9a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
 award:'M17 8a5 5 0 1 1-10 0 5 5 0 0 1 10 0M8 12l-2 9 6-3 6 3-2-9',
 send:'m2 3 20 9-20 9 4-9ZM6 12h16',
 trend:'M3 19V5M3 19h18M6 15l5-5 4 3 6-8',
 plus:'M12 4v16M4 12h16',check:'m4 12 5 5L20 6',
 back:'m14 5-7 7 7 7',x:'m6 6 12 12M6 18 18 6',info:'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M12 11v6M12 7v1'
};
function node(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (value !== null && value !== undefined) el.setAttribute(key, String(value));
  }
  el.append(...children.flat(Infinity).filter(x => x !== null && x !== undefined));
  return el;
}
function icon(name, size = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'i ' + size);
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', paths[name] || paths.info); svg.append(path); return svg;
}
const button = (label, on, cls = 'btn tonal', ic) => node('button', { type: 'button', class: cls, onclick: on }, ic ? icon(ic, 's') : null, label);
const chip = (label, tone, ic) => node('span', { class: 'chip', 'data-k': tone }, icon(ic, 'xs'), label);
const serviceTitle = id => tr(config.services[id]?.title || config.copy.later);
const openPage = id => navigate('page/' + encodeURIComponent(id));
function section(label, content, count, more) {
  return node('section', { class: 'sec' }, node('div', { class: 'sec-h' }, node('h2', {}, label),
    count ? node('span', { class: 'cnt hot' }, String(count)) : null, more), content);
}
function currentRoute() {
  const route = location.hash.slice(2);
  return /^(home|search|waiting|page\/[a-zA-Z0-9-]+)$/.test(route) ? route : 'home';
}
function navigate(route) {
  if (currentRoute() === route) return;
  location.hash = '/' + route;
}
function waitCard(item) {
  return node('article', { class: 'card' }, node('div', { class: 'fi' },
    node('div', { class: 'fh' }, icon(item.icon, 's'), tr(item.status), node('bdi', { class: 'ref' }, item.id)),
    node('h3', {}, tr(item.title)), node('p', {}, tr(item.sub)),
    button(t('open'), () => openPage(item.id), 'btn ghost sm')));
}
function focal() {
  const role = config.roles[state.role];
  const item = itemsFor(config, state.role).find(x => x.kind === role.focal);
  if (!item) return node('section', { class: 'next' }, node('h2', {}, t('empty')), node('p', {}, t('done')));
  const eyebrow = state.role === 'ph' ? t('next') : state.role === 'lead' || state.role === 'sup' ? t('urgent') : tr(item.status);
  return node('section', { class: 'next', 'aria-label': eyebrow },
    node('div', { class: 'next-h' }, node('span', { class: 'eyebrow' }, eyebrow), chip(tr(item.status), item.tone, item.icon)),
    state.role === 'ph' ? node('div', { class: 'next-time' }, tr(config.focal.time), node('small', {}, tr(config.focal.end))) : null,
    node('h2', {}, tr(item.title)), node('p', { class: 'hint' }, tr(item.sub)),
    node('div', { class: 'btns' }, button(t('open'), () => openPage(item.id), 'btn primary block', item.icon)));
}
function home() {
  const r = config.roles[state.role];
  const waiting = itemsFor(config, state.role).filter(x => !(state.role === 'ph' && x.kind === 'task'));
  const date = new Intl.DateTimeFormat(state.lang === 'ar' ? 'ar-AE' : 'en-GB', {
    dateStyle: 'full', timeZone: config.timeZone
  }).format(new Date(config.date));
  const hero = node('header', { class: 'hero' },
    node('div', { class: 'hero-top' }, node('span', { class: 'seal' }, node('img', { src: '../img/emblem.a90412e02d.webp', alt: '', width: 40, height: 40 })),
      node('div', { class: 'wordmark' }, node('b', {}, t('app')), node('small', {}, t('org'))),
      button('DEMO', openControls, 'ibtn hero-options'),
      node('button', {type:'button',class:'ibtn','aria-label':serviceTitle('alerts'),onclick:()=>openPage('alerts')},icon('bell'))),
    node('h1', { class: 'hello', tabindex: '-1' }, t('greeting') + tr(person().name)),
    node('div', { class: 'hdate' }, date),
    node('div', { class: 'hchips' }, node('span', { class: 'hchip' }, tr(r.title)), node('span', { class: 'demo-tag' }, t('demo'))),
    button(t('search'), () => navigate('search'), 'hsearch', 'search'));
  const shortcuts = r.shortcuts.map(id => button([
    node('span', { class: 'sq', 'data-k': id === 'crisis' ? 'hot' : null }, icon(config.services[id].icon)),
    node('span', {}, serviceTitle(id))
  ], () => openPage(id), 'lic'));
  return [hero, node('div', { class: 'lift' }, focal()),
    section(t('shortcuts'), node('div', { class: 'launch' }, shortcuts)),
    node('div', { class: 'feed' }, section(t('waiting'), waiting.length ?
      node('div', { class: 'stack' }, waiting.slice(0, config.limits.homeWaiting).map(waitCard)) :
      node('div', { class: 'card empty' }, icon('check'), node('b', {}, t('empty')), node('p', {}, t('done'))),
      waiting.length, waiting.length > config.limits.homeWaiting ? button(t('all'), () => navigate('waiting'), 'more') : null)),
    section(t('services'), node('div', { class: 'tiles-a1' }, config.kpis[state.role].map(kpi =>
      button([node('span',{class:'tile-heading'},icon(config.services[kpi.service].icon), node('span', {}, serviceTitle(kpi.service))),
        node('span',{class:'tile-number'},String(kpi.value),node('small',{},tr(kpi.label))),node('span',{class:'tile-sub'},tr(kpi.sub))],
      () => openPage(kpi.service), 'tile-a1')))),
    node('div', { class: 'updated', role: 'status' }, icon('info', 'xs'), navigator.onLine ? t(state.cached ? 'cached' : 'bundled') : t('networkOff'))];
}
function bar(title) {
  const bell = button(icon('bell'), () => openPage('alerts'), 'ibtn'); bell.setAttribute('aria-label', serviceTitle('alerts'));
  const back = button(icon('back'), () => navigate('home'), 'ibtn'); back.setAttribute('aria-label', t('home'));
  return node('header', { class: 'bar' }, node('div', { class: 'bar-in' }, back, node('h1', { tabindex: '-1' }, title), bell));
}
function results(container) {
  const matches = search(config, state.role, state.query, state.lang).slice(0, config.limits.searchResults);
  container.replaceChildren(...matches.map(item => button([
    node('b', {}, tr(item.title)), node('small', {}, tr(item.sub))
  ], () => openPage(item.id), 'a1-result')));
  if (!matches.length) container.append(node('p', { class: 'hint' }, t(state.query.trim() ? 'noResults' : 'searchHint')));
}
function searchView() {
  const output = node('div', { class: 'stack', 'aria-live': 'polite' });
  const input = node('input', { id: 'demo-search', type: 'search', placeholder: t('search'), value: state.query, autocomplete: 'off',
    oninput: event => { state.query = event.target.value; results(output); } });
  results(output);
  return node('section', { class: 'sec a1-search' }, node('label', { for: input.id }, t('searchTitle')), input, output);
}
function placeholder(id) {
  const item = itemsFor(config, state.role).find(x => x.id === id);
  const title = item ? tr(item.title) : serviceTitle(id);
  return [bar(title), node('div', { class: 'scroll' }, section(t('demo'), node('article', { class: 'card a1-notice' },
    icon(item?.icon || config.services[id]?.icon || 'info', 'l'), node('h2', {}, t('later')),
    node('p', {}, t('readOnly')), button(t('home'), () => navigate('home'), 'btn primary', 'home'))))];
}
function render() {
  const started = performance.now();
  const route = currentRoute();
  document.documentElement.lang = state.lang;
  document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
  if (state.theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = state.theme;
  document.title = t('app') + ' · DEMO A-1';
  const view = node('section', { class: 'view', 'data-role': state.role });
  if (route === 'home') view.append(node('div', { class: 'scroll' }, ...home(), node('div', { class: 'pad-b' })));
  else if (route === 'search') view.append(bar(t('searchTitle')), node('div', { class: 'scroll' }, searchView()));
  else if (route === 'waiting') view.append(bar(t('waiting')), node('div', { class: 'scroll feed' }, section(t('waiting'), node('div', { class: 'stack' }, itemsFor(config, state.role).filter(x => !(state.role === 'ph' && x.kind === 'task')).map(waitCard)))));
  else view.append(...placeholder(route.slice('page/'.length)));
  views.replaceChildren(view);
  const second = config.roles[state.role].tab;
  tabs.setAttribute('aria-label', t('app'));
  tabs.replaceChildren(...['home', second, 'alerts', 'account'].map(id => {
    const label = id === 'home' ? t('home') : serviceTitle(id);
    const b = button([node('span', { class: 'pill' }, icon(id === 'home' ? 'home' : config.services[id].icon)), label],
      () => id === 'home' ? navigate('home') : openPage(id), 'tab');
    if (route === 'page/' + id || (id === 'home' && ![second, 'alerts', 'account'].some(key => route === 'page/' + key))) b.setAttribute('aria-current', 'page');
    return b;
  }));
  app.dataset.navMs = (performance.now() - started).toFixed(2);
  const heading = view.querySelector('h1'); if (heading) heading.focus({ preventScroll: true });
}
let previousFocus;
function openControls() {
  previousFocus = document.activeElement;
  controls.firstElementChild.classList.add('open');
  if (matchMedia('(max-width:1119px)').matches) {
    controls.firstElementChild.setAttribute('role', 'dialog');
    controls.firstElementChild.setAttribute('aria-modal', 'true');
    app.inert = true;
  }
  controls.querySelector('select').focus();
}
function closeControls() {
  controls.firstElementChild.classList.remove('open');
  controls.firstElementChild.removeAttribute('role');
  controls.firstElementChild.removeAttribute('aria-modal');
  app.inert = false;
  previousFocus?.focus();
}
function renderControls() {
  const panel = node('aside', { class: 'demo-controls', 'aria-label': t('controls') },
    node('span', { class: 'badge' }, 'DEMO · A-1'), node('h2', {}, t('demoTitle')), node('p', {}, t('readOnly')));
  for (const [key, values] of [['role', Object.keys(config.roles)], ['language', config.languages], ['theme', config.themes]]) {
    const stateKey = key === 'language' ? 'lang' : key;
    const select = node('select', { id: 'demo-' + key, onchange: event => {
      const focusId = event.target.id;
      state[stateKey] = event.target.value;
      const params = new URLSearchParams(location.search);
      for (const k of ['role','lang','theme']) params.set(k, state[k]);
      history.replaceState(null, '', '?' + params + '#/home');
      closeControls(); render(); renderControls();
      // On mobile a language/role change closes the options and returns to the app.
      if (matchMedia('(min-width:1120px)').matches) document.getElementById(focusId).focus();
    } }, values.map(value => node('option', { value, selected: state[stateKey] === value ? '' : null },
      key === 'role' ? tr(config.roles[value].title) : key === 'theme' ? t(value) : value === 'ar' ? (state.lang === 'ar' ? 'العربية' : 'Arabic') : 'English')));
    panel.append(node('label', { for: select.id }, t(key), select));
  }
  panel.append(button(t('close'), closeControls, 'btn tonal close-controls', 'x'));
  controls.replaceChildren(panel);
}
controls.addEventListener('keydown', event => {
  if (event.key === 'Escape') { closeControls(); return; }
  if (event.key !== 'Tab' || !app.inert) return;
  const focusable = [...controls.querySelectorAll('select,button')];
  const first = focusable[0], last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
async function cacheDemo() {
  try {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('gpt-a1-demo', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('demo');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const snapshot = await new Promise((resolve, reject) => {
      const tx = db.transaction('demo', 'readonly'); const request = tx.objectStore('demo').get('snapshot');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    state.cached = validSnapshot(snapshot, config);
    const tx = db.transaction('demo', 'readwrite');
    tx.objectStore('demo').put({ schema: config.schema, ids: config.items.map(x => x.id) }, 'snapshot');
    tx.oncomplete = () => db.close(); tx.onabort = () => db.close();
    // Cache availability never gates the first render or changes work-item state.
  } catch { state.cached = false; }
}
addEventListener('hashchange', render);
addEventListener('online', render);
addEventListener('offline', render);
renderControls(); render();
cacheDemo().then(() => {
  app.dataset.cache = state.cached ? 'restored' : 'bundled';
  const status = views.querySelector('.updated');
  if (status) status.replaceChildren(icon('info', 'xs'), navigator.onLine ? t(state.cached ? 'cached' : 'bundled') : t('networkOff'));
});
