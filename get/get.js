// get.js: the one-button install page /get/ (zeno 2026-10-21: open the link, one button, save, done). Android: one «تنزيل التطبيق»
// button opens the browser's install dialog (beforeinstallprompt); without it (not offered yet, dismissed, Samsung Internet), the line for
// the browser's own menu with an arrow at it. iPhone in Safari: Apple lets no page add itself, so one line and a big arrow at Safari's own
// button for its version (the Version/ token, as the shell's install guide: 27 «≡» in the address bar, 26 «⋯», older Share; the bar
// follows the phone's language, not the page's). Inside another app or browser: open it in Safari or Chrome, with the link to copy. Opened
// from the home screen it goes to the app. ?l=en or ?l=ar picks the language, else the phone's (as the app); the button at the top switches.
// No network call besides /sw.js on Android.
'use strict';
(function () {
  var w = window, d = document, nav = w.navigator, ua = String(nav.userAgent || '');
  var standalone = !!((w.matchMedia && w.matchMedia('(display-mode: standalone)').matches) || nav.standalone === true);
  if (standalone) { w.location.replace('/'); return; }

  var ios = /iPhone|iPad|iPod/.test(ua) || (nav.platform === 'MacIntel' && Number(nav.maxTouchPoints) > 1);
  var iphone = ios && /iPhone|iPod/.test(ua);
  var android = !ios && /Android/.test(ua);
  // where nothing installs: Facebook, Instagram, WhatsApp, the Google app, an Android WebView; on iOS a page view without Safari's token,
  // and the other browsers (the shell's guide sends them to Safari too)
  var inApp = /FBAN|FBAV|Instagram|WhatsApp|GSA\/|Line\/|Snapchat|; wv\)/.test(ua) || (ios && (!/Safari\//.test(ua) || /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)));
  var sam = android && /SamsungBrowser/.test(ua);
  var m = /Version\/(\d+)/.exec(ua), n = m ? Number(m[1]) : 0;
  var iosv = n >= 27 ? '27' : n >= 26 ? '26' : '18';
  var dir = /^(?:ar|he|fa|ur)\b/i.test(String(nav.language || '')) ? 'rtl' : 'ltr';
  var TITLE = { ar: 'تنزيل تطبيق الإعلام الأمني', en: 'Download Security Media' };
  var COPIED = { ar: 'نُسخ الرابط', en: 'Link copied' };
  var q = null;
  try { q = new w.URLSearchParams(w.location.search); } catch (e) { q = null; }
  // ?l= first, then the phone's language as the app itself does (English only for an English phone)
  var ql = q ? q.get('l') : '';
  var lang = ql === 'en' || ql === 'ar' ? ql : /^en\b/i.test(String(nav.language || '')) ? 'en' : 'ar';
  var bip = null, asked = false, timer = 0;

  w.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); bip = e; if (asked) helpOff(); });
  w.addEventListener('appinstalled', function () { bip = null; done(); });

  var $ = function (id) { return d.getElementById(id); };
  function show(id) { var el = $(id); if (el) el.hidden = false; }
  function hide(id) { var el = $(id); if (el) el.hidden = true; }

  // every [data-en] element holds text only; its Arabic is kept in data-ar the first time
  function setLang(l, keep) {
    lang = l;
    var r = d.documentElement;
    r.lang = l;
    r.dir = l === 'ar' ? 'rtl' : 'ltr';
    d.title = TITLE[l];
    var els = d.querySelectorAll('[data-en]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.getAttribute('data-ar') == null) el.setAttribute('data-ar', el.textContent);
      el.textContent = el.getAttribute(l === 'en' ? 'data-en' : 'data-ar');
    }
    var b = $('lang');
    b.textContent = l === 'en' ? 'العربية' : 'English';
    b.setAttribute('lang', l === 'en' ? 'ar' : 'en');
    // the link to copy or share has no language: it opens in the reader's own
    var u = $('url');
    u.value = w.location.origin + '/get/';
    u.setAttribute('aria-label', l === 'en' ? 'Link' : 'الرابط');
    if (keep) try { w.history.replaceState(null, '', w.location.pathname + '?l=' + l); } catch (e) { /* ok */ }
  }

  function copied() {
    var t = $('copy-t');
    t.textContent = COPIED[lang];
    w.clearTimeout(timer);
    timer = w.setTimeout(function () { t.textContent = t.getAttribute(lang === 'en' ? 'data-en' : 'data-ar'); }, 2500);
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

  // the big arrow at the bottom (iPhone Safari, Samsung Internet's «≡»), with the button it points at drawn above it
  function arrow(cls, keyFrom) {
    var a = $('arrow'), k = $('arrow-key'), src = d.querySelector(keyFrom);
    while (k.firstChild) k.removeChild(k.firstChild);
    if (src) k.appendChild(src.cloneNode(true));
    a.className = 'arrow ' + cls + ' ' + dir;
    a.hidden = false;
  }
  // no install dialog: the browser's own menu
  function help() {
    asked = true;
    if (sam) { show('and-sam'); arrow('psam', '#and-sam .key svg'); return; }
    show('and-menu');
    $('arrow-up').className = 'arrow up ' + dir;
    show('arrow-up');
    hide('lang');
  }
  function helpOff() { hide('and-menu'); hide('and-sam'); hide('arrow-up'); hide('arrow'); show('lang'); }
  function done() {
    helpOff();
    hide('install');
    hide('and-note');
    show('and-done');
  }
  function install() {
    var e = bip;
    if (!e) { help(); return; }
    bip = null;
    try {
      Promise.resolve(e.prompt()).then(function () { return e.userChoice; })
        .then(function (c) { if (c && c.outcome === 'accepted') done(); else help(); }, help);
    } catch (er) { help(); }
  }

  function init() {
    setLang(lang, false);
    $('lang').addEventListener('click', function () { setLang(lang === 'en' ? 'ar' : 'en', true); });
    $('copy').addEventListener('click', copy);
    if (inApp && (ios || android)) {
      show('inapp');
      show(ios ? 'inapp-ios' : 'inapp-and');
      show(ios ? 'inapp-ios-how' : 'inapp-and-how');
      show('link');
      return;
    }
    if (ios) {
      show('ios');
      show('ios' + iosv);
      // an iPad's Safari bar is at the top: the line alone
      if (iphone) arrow('p' + iosv, '#ios' + iosv + ' .key svg');
      return;
    }
    if (android) {
      show('and');
      $('install').addEventListener('click', install);
      // the app's own worker (same scope as the app opening it later), for browsers that still ask for one before they offer the install
      if ('serviceWorker' in nav) nav.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () { /* the button still works */ });
      return;
    }
    show('pc');
    show('link');
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init); else init();
})();
