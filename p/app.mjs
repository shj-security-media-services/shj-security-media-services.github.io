/* SPA80 app v1. Rendering uses createElement/textContent only; API strings never become HTML or URLs. */
import {createController} from './core.mjs';
import {createRealApi} from './api-real.mjs';
import {createMockApi} from './mock-api.mjs';
import {createIndexedDBStorage} from './cache.mjs';
import {createTokenStore, captureTokenFromLocation, safeSessionStorage} from './token.mjs';
import {validStage, validId, WHEN} from './shapes.mjs';
import {WRITE_ENABLED, THEME_KEY, MOCK_DB_NAME} from './config.mjs';

const WORDS = {
  ar: {
    brand: 'لوحة الطلبات', sub: 'الواجهة السريعة', home: 'نظرة عامة', list: 'الطلبات', order: 'تفاصيل الطلب',
    menu: 'التنقل الرئيسي', skip: 'انتقل إلى المحتوى', mock: 'بيانات تجريبية',
    dark: 'داكن', light: 'فاتح', switchTheme: 'تبديل المظهر',
    hello: 'نظرة عامة على الطلبات', tagline: 'اضغط أي رقم لعرض الطلبات المطابقة.',
    total: 'جميع الطلبات', today: 'طلبات اليوم', upcoming: 'الطلبات القادمة', stages: 'حسب المرحلة', browse: 'عرض',
    search: 'بحث', searchHint: 'المرجع أو العنوان أو الجهة', stage: 'المرحلة', anyStage: 'كل المراحل',
    when: 'الموعد', anyWhen: 'كل المواعيد', apply: 'تطبيق', clear: 'مسح',
    results: 'النتائج', noResults: 'لا توجد طلبات مطابقة', noResultsText: 'جرّب عبارة أقصر أو مرحلة أخرى.',
    next: 'الصفحة التالية', prev: 'الصفحة السابقة', page: 'صفحة',
    open: 'فتح الطلب', ref: 'المرجع', date: 'التاريخ', time: 'الوقت', entity: 'الجهة', photographers: 'المصورون',
    title: 'العنوان', stage_label: 'المرحلة', id: 'المعرّف', location: 'الموقع', notes: 'ملاحظات',
    none: '—', back: 'العودة إلى الطلبات', slots: 'المصورون والردود', slotName: 'الاسم', slotResponse: 'الرد', slotSpec: 'التخصص',
    noSlots: 'لا يوجد مصورون مسجلون.', readOnly: 'عرض فقط حالياً. القرارات والتكليف والحفظ تتم من اللوحة.',
    decision: 'القرار', approve: 'قبول', reject: 'رفض', assign: 'تكليف', save: 'حفظ', writeUnavailable: 'الحفظ غير متاح بعد.',
    loading: 'جارٍ تحميل البيانات…', refreshing: 'جارٍ التحديث…', stale: 'نسخة محفوظة في الذاكرة', ready: 'البيانات جاهزة',
    refresh: 'تحديث', retry: 'إعادة المحاولة', readError: 'تعذّر تحميل البيانات. يمكنك المحاولة مجدداً.',
    invalid: 'وصلت بيانات غير متوقعة من الخادم.', forbidden: 'لا تملك صلاحية عرض هذه البيانات.',
    locked: 'افتح الواجهة من زر «⚡ الواجهة السريعة» داخل اللوحة',
    notFound: 'مسار غير متاح', notFoundText: 'اختر شاشة من القائمة.', updatedAt: 'آخر تحديث',
    footer: 'الواجهة السريعة • عرض فقط', mockFooter: 'وضع تجريبي • بيانات خيالية'
  },
  en: {
    brand: 'Orders panel', sub: 'Quick view', home: 'Overview', list: 'Orders', order: 'Order details',
    menu: 'Main navigation', skip: 'Skip to content', mock: 'Demo data',
    dark: 'Dark', light: 'Light', switchTheme: 'Switch appearance',
    hello: 'Orders overview', tagline: 'Select any number to see the matching orders.',
    total: 'All orders', today: 'Today', upcoming: 'Upcoming', stages: 'By stage', browse: 'View',
    search: 'Search', searchHint: 'Reference, title or entity', stage: 'Stage', anyStage: 'All stages',
    when: 'When', anyWhen: 'Any date', apply: 'Apply', clear: 'Clear',
    results: 'Results', noResults: 'No matching orders', noResultsText: 'Try a shorter search or another stage.',
    next: 'Next page', prev: 'Previous page', page: 'Page',
    open: 'Open order', ref: 'Reference', date: 'Date', time: 'Time', entity: 'Entity', photographers: 'Photographers',
    title: 'Title', stage_label: 'Stage', id: 'ID', location: 'Location', notes: 'Notes',
    none: '—', back: 'Back to orders', slots: 'Photographers and responses', slotName: 'Name', slotResponse: 'Response', slotSpec: 'Specialty',
    noSlots: 'No photographers recorded.', readOnly: 'Read-only for now. Decisions, assignment and saving happen in the panel.',
    decision: 'Decision', approve: 'Approve', reject: 'Reject', assign: 'Assign', save: 'Save', writeUnavailable: 'Saving is not available yet.',
    loading: 'Loading data…', refreshing: 'Refreshing…', stale: 'Copy held in memory', ready: 'Data is ready',
    refresh: 'Refresh', retry: 'Try again', readError: 'Data could not be loaded. You can try again.',
    invalid: 'The server returned unexpected data.', forbidden: 'You are not allowed to view this data.',
    locked: 'Open this view from the «⚡ Quick view» button inside the panel.',
    notFound: 'Page unavailable', notFoundText: 'Choose a screen from the menu.', updatedAt: 'Last updated',
    footer: 'Quick view • read-only', mockFooter: 'Demo mode • fictional data'
  }
};
const KNOWN_FIELDS = ['ref', 'title', 'stage_label', 'date', 'time', 'entity', 'photographers', 'location', 'notes'];
const HIDDEN_FIELDS = new Set(['stage', 'updated_ms']);

export function parseRoute(hash) {
  if (hash === '' || hash === '#' || hash === '#/' || hash === '#/home') return {screen: 'home'};
  if (hash === '#/list') return {screen: 'list', stage: '', when: ''};
  let m = /^#\/list\/when\/([a-z]+)$/.exec(hash);
  if (m) return WHEN.includes(m[1]) ? {screen: 'list', stage: '', when: m[1]} : null;
  m = /^#\/list\/stage\/([^/?#&]{1,400})$/.exec(hash);
  if (m) { let s; try { s = decodeURIComponent(m[1]); } catch { return null; } return validStage(s) ? {screen: 'list', stage: s, when: ''} : null; }
  m = /^#\/order\/([^/?#&]{1,240})$/.exec(hash);
  if (m) { let id; try { id = decodeURIComponent(m[1]); } catch { return null; } return validId(id) ? {screen: 'order', id} : null; }
  return null;
}
export const listHref = ({stage = '', when = ''} = {}) => stage ? '#/list/stage/' + encodeURIComponent(stage) : when ? '#/list/when/' + when : '#/list';
export const orderHref = id => '#/order/' + encodeURIComponent(id);

export function readThemePreference(win) {
  try { const v = win.localStorage.getItem(THEME_KEY); return v === 'light' || v === 'dark' ? v : null; } catch { return null; }
}
export function deviceTheme(win) {
  try { return win.matchMedia?.('(prefers-color-scheme: light)')?.matches ? 'light' : 'dark'; } catch { return 'dark'; }
}

export function mountApp({document: doc = document, window: win = window} = {}) {
  const root = doc.getElementById('app');
  if (!root) throw new Error('APP_ROOT_MISSING');
  const announcer = doc.getElementById('announcer');
  const query = new URLSearchParams(win.location.search);
  const mock = query.get('mock') === '1';
  const tokens = createTokenStore({storage: safeSessionStorage(win)});
  captureTokenFromLocation({location: win.location, history: win.history, store: tokens}); // always strip #s= from the URL
  const api = mock ? createMockApi({lang: query.get('lang') === 'en' ? 'en' : 'ar'}) : createRealApi({getToken: tokens.get});
  const storage = mock ? createIndexedDBStorage({dbName: MOCK_DB_NAME}) : null;

  let language = 'ar', state = null, validRoute = true, currentHash = null, headingFocus = true, lastAnnouncement = '';
  let filters = {q: '', stage: '', when: ''}, cursors = [];
  const stageLabels = new Map();
  let themePref = readThemePreference(win), theme = themePref || deviceTheme(win);
  const t = key => Object.hasOwn(WORDS[language], key) ? WORDS[language][key] : key;
  const fmt = n => new Intl.NumberFormat(language === 'en' ? 'en-GB' : 'ar-AE').format(n);

  function el(tag, props = {}, ...children) {
    const node = doc.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') node.className = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(typeof c === 'string' || typeof c === 'number' ? doc.createTextNode(String(c)) : c);
    return node;
  }
  const button = (label, onClick, cls = 'button', extra = {}) => el('button', {type: 'button', class: cls, onclick: onClick, ...extra}, label);
  const announce = msg => { if (msg && msg !== lastAnnouncement) { lastAnnouncement = msg; if (announcer) announcer.textContent = msg; } };
  const stageName = (stage, label) => label || stageLabels.get(stage) || stage || t('none');

  function applyTheme() {
    doc.documentElement.dataset.theme = theme;
    doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0B0908' : '#F6F3EF');
  }
  applyTheme();
  try {
    win.matchMedia?.('(prefers-color-scheme: light)')?.addEventListener?.('change', () => {
      if (!themePref) { theme = deviceTheme(win); applyTheme(); renderShell(); }
    });
  } catch {}

  const brand = el('div', {class: 'brand'}), nav = el('nav', {class: 'nav'}), utilities = el('div', {class: 'utilities'});
  const main = el('main', {id: 'main', class: 'main', tabindex: '-1'}), footer = el('footer', {class: 'footer'});
  root.replaceChildren(el('header', {class: 'topbar'}, brand, nav, utilities), main, footer);

  function renderShell() {
    doc.documentElement.lang = language;
    doc.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    const skip = doc.querySelector('.skip'); if (skip) skip.textContent = t('skip');
    brand.replaceChildren(el('img', {src: './icon.svg', alt: '', width: '42', height: '42'}),
      el('div', {}, el('strong', {}, t('brand')), el('span', {class: 'brand-sub'}, t('sub'))));
    nav.setAttribute('aria-label', t('menu'));
    nav.replaceChildren(...['home', 'list'].map(s => {
      const selected = s === 'list' ? state?.screen === 'list' || state?.screen === 'order' : state?.screen === s;
      return el('a', {href: s === 'home' ? '#/home' : '#/list', class: 'nav-link', 'aria-current': selected ? 'page' : null,
        onclick: () => { if (s === 'list') { filters = {q: '', stage: '', when: ''}; cursors = []; if (win.location.hash === '#/list') loadList(); } }}, t(s));
    }));
    utilities.replaceChildren(...[mock ? el('span', {class: 'demo-badge'}, t('mock')) : null,
      button(theme === 'dark' ? t('light') : t('dark'), () => {
        theme = theme === 'dark' ? 'light' : 'dark'; themePref = theme;
        try { win.localStorage.setItem(THEME_KEY, theme); } catch {}
        applyTheme(); renderShell(); doc.getElementById('theme-button')?.focus();
      }, 'utility-button', {id: 'theme-button', 'aria-label': t('switchTheme'), 'aria-pressed': theme === 'dark' ? 'true' : 'false'})].filter(Boolean));
    footer.replaceChildren(el('span', {}, mock ? t('mockFooter') : t('footer')));
  }
  const titleBlock = (title, subtitle, action) => el('div', {class: 'page-heading'},
    el('div', {}, el('h1', {id: 'screen-title', tabindex: '-1'}, title), subtitle ? el('p', {class: 'lead'}, subtitle) : null), action);
  const badge = (stage, label) => el('span', {class: 'status'}, stageName(stage, label));
  const notice = (msg, tone = 'neutral', action) => el('div', {class: 'notice notice-' + tone, role: tone === 'error' ? 'alert' : null}, el('span', {}, msg), action);
  const refreshButton = () => button(t('refresh'), () => controller.refresh(), 'button button-quiet', {id: 'refresh-button', disabled: !!(state.loading || state.refreshing)});

  function stat(label, n, href, cls, onclick) {
    return el('a', {href, class: 'stat ' + cls, onclick},
      el('span', {class: 'stat-label'}, label), el('strong', {class: 'stat-number'}, fmt(n)), el('span', {class: 'stat-action'}, t('browse')));
  }
  function homeView(d) {
    const go = f => () => { filters = {q: '', stage: '', when: '', ...f}; cursors = []; };
    return [titleBlock(t('hello'), t('tagline'), refreshButton()),
      el('section', {'aria-label': t('home')}, el('div', {class: 'stats'},
        stat(t('total'), d.total, '#/list', 'stat-all', go({})),
        stat(t('today'), d.today, listHref({when: 'today'}), 'stat-pending', go({when: 'today'})),
        stat(t('upcoming'), d.upcoming, listHref({when: 'upcoming'}), 'stat-approved', go({when: 'upcoming'})))),
      el('section', {'aria-labelledby': 'stages-title', class: 'stage-section'},
        el('h2', {id: 'stages-title', class: 'section-label'}, t('stages')),
        el('div', {class: 'stats stage-stats'}, d.counts.map(({stage, n}) => stat(stageName(stage), n, listHref({stage}), 'stat-stage', go({stage})))))];
  }
  function field(label, control) { return el('div', {class: 'field'}, el('label', {for: control.id}, label), control); }
  function select(id, value, choices) {
    const s = el('select', {id, name: id});
    for (const [v, label] of choices) s.append(el('option', {value: v}, label));
    s.value = value; return s;
  }
  function knownStages() {
    const home = controller.peek('home');
    const list = home ? home.data.counts.map(c => c.stage) : [...stageLabels.keys()];
    if (filters.stage && !list.includes(filters.stage)) list.push(filters.stage);
    return list;
  }
  function submitFilters(next) {
    filters = next; cursors = [];
    const href = listHref(filters);
    if (win.location.hash !== href) win.location.hash = href; // route() loads
    else loadList();
  }
  function loadList() { controller.load('list', {...filters, cursor: cursors[cursors.length - 1] || ''}); }
  function listView(d) {
    for (const it of d.items) if (it.stage && it.stage_label) stageLabels.set(it.stage, it.stage_label);
    const q = el('input', {id: 'search-input', type: 'search', name: 'q', maxlength: '100', placeholder: t('searchHint'), autocomplete: 'off'});
    q.value = filters.q;
    q.addEventListener('input', () => { filters.q = q.value; });
    const stage = select('stage-filter', filters.stage, [['', t('anyStage')], ...knownStages().map(s => [s, stageName(s)])]);
    const when = select('when-filter', filters.when, [['', t('anyWhen')], ['today', t('today')], ['upcoming', t('upcoming')]]);
    const form = el('form', {class: 'filter-form filter-form-3', role: 'search', onsubmit: e => {
      e.preventDefault();
      const s = stage.value, w = when.value;
      submitFilters({q: q.value.trim().slice(0, 100), stage: s, when: s ? '' : w}); // route carries one filter; stage wins
    }}, field(t('search'), q), field(t('stage'), stage), field(t('when'), when),
    el('div', {class: 'filter-actions'}, el('button', {type: 'submit', class: 'button button-primary'}, t('apply')),
      button(t('clear'), () => submitFilters({q: '', stage: '', when: ''}), 'button button-quiet')));
    const results = d.items.length ? el('ul', {class: 'order-list'}, d.items.map(row => el('li', {},
      el('article', {class: 'order-card'},
        el('div', {class: 'order-card-top'}, el('span', {class: 'reference', dir: 'ltr'}, row.ref || row.id), badge(row.stage, row.stage_label)),
        el('h2', {}, el('a', {href: orderHref(row.id)}, row.title || row.ref || row.id)),
        el('p', {class: 'order-date'}, el('bdi', {dir: 'ltr'}, [row.date, row.time].filter(Boolean).join(' ') || t('none'))),
        row.entity ? el('p', {class: 'fine'}, row.entity) : null,
        row.photographers.length ? el('p', {class: 'fine'}, t('photographers') + ': ' + row.photographers.join('، ')) : null,
        el('div', {class: 'order-card-bottom'}, el('a', {href: orderHref(row.id), class: 'text-link'}, t('open')))))))
      : el('div', {class: 'empty'}, el('h2', {}, t('noResults')), el('p', {}, t('noResultsText')));
    const pager = el('div', {class: 'pager'},
      cursors.length ? button(t('prev'), () => { cursors.pop(); loadList(); }, 'button button-quiet', {id: 'prev-page'}) : null,
      el('span', {class: 'count'}, t('page') + ' ' + fmt(cursors.length + 1)),
      d.nextCursor ? button(t('next'), () => { cursors.push(d.nextCursor); loadList(); }, 'button button-quiet', {id: 'next-page'}) : null);
    return [titleBlock(t('list'), null, refreshButton()), form,
      el('section', {'aria-labelledby': 'results-title'},
        el('div', {class: 'results-heading'}, el('h2', {id: 'results-title'}, t('results')),
          el('span', {class: 'count'}, fmt(d.items.length))), results, pager)];
  }
  function writeControls(o) {
    // Hidden unless WRITE_ENABLED; no write call exists in the API client yet.
    const off = () => announce(t('writeUnavailable'));
    return el('section', {class: 'panel write-panel'}, el('h2', {}, t('decision')),
      el('div', {class: 'filter-actions'}, button(t('approve'), off), button(t('reject'), off), button(t('assign'), off),
        button(t('save'), off, 'button button-primary', {'data-order': o.id})));
  }
  function orderView(o) {
    const byKey = new Map(o.fields);
    const facts = el('dl', {class: 'facts'});
    const add = (label, value, dir) => { if (value) facts.append(el('div', {}, el('dt', {}, label), el('dd', {dir}, value))); };
    for (const k of KNOWN_FIELDS) add(t(k), k === 'stage_label' ? stageName(o.stage, byKey.get(k)) : byKey.get(k), ['ref', 'date', 'time'].includes(k) ? 'ltr' : null);
    for (const [k, v] of o.fields) if (!KNOWN_FIELDS.includes(k) && !HIDDEN_FIELDS.has(k) && k !== 'id') add(Object.hasOwn(WORDS[language], k) ? WORDS[language][k] : k.replace(/_/g, ' '), v);
    const slots = o.slots.length ? el('table', {class: 'slots'},
      el('thead', {}, el('tr', {}, el('th', {scope: 'col'}, t('slotName')), el('th', {scope: 'col'}, t('slotResponse')), el('th', {scope: 'col'}, t('slotSpec')))),
      el('tbody', {}, o.slots.map(s => el('tr', {}, el('td', {}, s.name || t('none')), el('td', {}, s.response || t('none')), el('td', {}, s.spec || t('none'))))))
      : el('p', {class: 'fine'}, t('noSlots'));
    return [el('a', {href: '#/list', class: 'back-link'}, t('back')),
      titleBlock(o.title || o.ref || o.id || t('order'), null, badge(o.stage, o.stage_label)),
      el('div', {class: 'detail-grid'},
        el('section', {class: 'panel', 'aria-label': t('order')}, facts),
        el('section', {class: 'panel', 'aria-labelledby': 'slots-title'}, el('h2', {id: 'slots-title'}, t('slots')), slots)),
      WRITE_ENABLED ? writeControls(o) : notice(t('readOnly'))];
  }
  function errorMessage(code) {
    return code === 'UNAUTHORIZED' ? t('locked') : code === 'FORBIDDEN' ? t('forbidden') : code === 'INVALID_RESPONSE' ? t('invalid') : t('readError');
  }
  function render(next) {
    state = next;
    if (!validRoute) return;
    language = state.lang === 'en' ? 'en' : 'ar';
    if (state.screen === 'home' && state.data) for (const c of state.data.counts) if (!stageLabels.has(c.stage)) stageLabels.set(c.stage, c.stage);
    const active = doc.activeElement, focusId = active?.id || null;
    renderShell();
    main.setAttribute('aria-busy', state.loading || state.refreshing ? 'true' : 'false');
    const out = [];
    if (state.data) {
      if (state.screen === 'home') out.push(...homeView(state.data));
      if (state.screen === 'list') out.push(...listView(state.data));
      if (state.screen === 'order') out.push(...orderView(state.data));
    } else {
      out.push(titleBlock(t(state.screen || 'home'), null));
      if (state.loading) out.push(el('div', {class: 'loading-panel'}, el('p', {}, t('loading'))));
    }
    if (state.error) {
      const locked = state.error.code === 'UNAUTHORIZED';
      out.push(notice(errorMessage(state.error.code), 'error', locked ? null : button(t('retry'), () => controller.refresh(), 'button button-quiet', {id: 'retry-load'})));
    } else {
      const progress = state.loading ? 'loading' : state.refreshing ? 'refreshing' : state.stale ? 'stale' : 'ready';
      let stamp = '';
      if (Number.isFinite(state.ts)) { try { stamp = ' • ' + t('updatedAt') + ': ' + new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'ar-AE', {timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short'}).format(new Date(state.ts)); } catch {} }
      out.push(el('p', {class: 'data-status'}, el('span', {class: 'status-dot', 'aria-hidden': 'true'}), t(progress) + stamp));
    }
    main.replaceChildren(...out.filter(Boolean));
    doc.title = t(state.screen || 'home') + ' • ' + t('brand');
    if (headingFocus && (state.data || state.error)) { main.querySelector('h1')?.focus(); headingFocus = false; }
    else if (focusId) { const r = doc.getElementById(focusId); if (r && !r.disabled) r.focus(); }
    announce(state.error ? errorMessage(state.error.code) : state.loading ? t('loading') : state.refreshing ? t('refreshing') : t('ready'));
  }
  function route() {
    const hash = win.location.hash;
    if (hash === '#main') { main.focus(); return; }
    if (hash.startsWith('#s=')) {
      const before = tokens.get();
      captureTokenFromLocation({location: win.location, history: win.history, store: tokens});
      if (tokens.get() !== before) controller.clear(); // new token: drop the old in-memory data
      currentHash = null;
      if (win.location.hash.startsWith('#s=')) return; // URL could not be cleaned; never loop
      return route();
    }
    if (hash === currentHash) return;
    currentHash = hash;
    const target = parseRoute(hash);
    if (!target) {
      validRoute = false; renderShell();
      main.replaceChildren(titleBlock(t('notFound'), t('notFoundText')), el('a', {href: '#/home', class: 'button button-primary'}, t('home')));
      main.querySelector('h1')?.focus(); return;
    }
    validRoute = true; headingFocus = true;
    if (!mock && !tokens.get()) { controller.lock('UNAUTHORIZED'); return; } // no request without a token
    if (target.screen === 'home') controller.load('home');
    else if (target.screen === 'order') controller.load('order', {id: target.id});
    else {
      if (filters.stage !== target.stage || filters.when !== target.when) { filters = {...filters, stage: target.stage, when: target.when}; cursors = []; }
      loadList();
    }
  }
  const controller = createController({api, mode: mock ? 'mock' : 'real', storage, onChange: render, onUnauthorized: () => tokens.clear()});
  render(controller.snapshot());
  win.addEventListener('hashchange', route);
  route();
  return {controller, destroy() { win.removeEventListener('hashchange', route); controller.destroy(); }};
}

if (typeof window !== 'undefined' && typeof document !== 'undefined' && document.getElementById('app')) {
  mountApp();
  window.addEventListener('load', () => {
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('./sw.js', {scope: './'}).catch(() => {});
    }
  }, {once: true});
}
