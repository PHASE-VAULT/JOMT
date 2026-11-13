/* UGTG i18n: English source strings are the keys; js/i18n/<lang>.js files add dictionaries with
   UGTG.addLang(code, { 'English text': 'Translation' }). Missing entries fall back to English.
   U.t('Exported {0}', name) fills {0}, {1}… placeholders. The chosen language is kept in localStorage. */
(function () {
  'use strict';
  const U = window.UGTG;
  const KEY = 'ugtg.lang';

  // [code, native name, flag svg]
  const svg = (inner) => `<svg viewBox="0 0 30 20" preserveAspectRatio="none" aria-hidden="true">${inner}</svg>`;
  U.LANGS = [
    ['en', 'English', svg('<rect width="30" height="20" fill="#012169"/><path d="M0 0l30 20M30 0L0 20" stroke="#fff" stroke-width="4"/><path d="M0 0l30 20M30 0L0 20" stroke="#c8102e" stroke-width="1.6"/><path d="M15 0v20M0 10h30" stroke="#fff" stroke-width="6.5"/><path d="M15 0v20M0 10h30" stroke="#c8102e" stroke-width="3.8"/>')],
    ['de', 'Deutsch', svg('<rect width="30" height="6.67" fill="#000"/><rect y="6.67" width="30" height="6.67" fill="#dd0000"/><rect y="13.33" width="30" height="6.67" fill="#ffce00"/>')],
    ['fr', 'Français', svg('<rect width="10" height="20" fill="#0055a4"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#ef4135"/>')],
    ['es', 'Español', svg('<rect width="30" height="20" fill="#aa151b"/><rect y="5" width="30" height="10" fill="#f1bf00"/>')],
    ['it', 'Italiano', svg('<rect width="10" height="20" fill="#009246"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#ce2b37"/>')],
  ];
  U.I18N = U.I18N || {};
  U.addLang = (code, dict) => { U.I18N[code] = Object.assign(U.I18N[code] || {}, dict); };

  let lang = 'en';
  try {
    const saved = localStorage.getItem(KEY);
    if (U.LANGS.some((l) => l[0] === saved)) lang = saved;
  } catch (e) { /* storage unavailable: English */ }
  document.documentElement.lang = lang;

  U.lang = () => lang;
  U.setLang = (code) => {
    if (!U.LANGS.some((l) => l[0] === code)) return;
    lang = code;
    document.documentElement.lang = code;
    try { localStorage.setItem(KEY, code); } catch (e) { /* not remembered */ }
  };

  U.t = (s, ...args) => {
    if (typeof s !== 'string') return s;
    const d = lang !== 'en' && U.I18N[lang];
    let r = (d && d[s]) || s;
    if (args.length) r = r.replace(/\{(\d+)\}/g, (m, i) => (args[i] !== undefined ? args[i] : m));
    return r;
  };

  /* static markup: data-i18n (text), data-i18n-html (markup with <kbd> etc.), data-i18n-title,
     data-i18n-aria (aria-label). The English source is read once from the element itself. */
  U.applyI18n = (root) => {
    const r = root || document;
    for (const e of r.querySelectorAll('[data-i18n]')) {
      if (!e.dataset.i18n) e.dataset.i18n = e.textContent.trim();
      e.textContent = U.t(e.dataset.i18n);
    }
    for (const e of r.querySelectorAll('[data-i18n-html]')) {
      if (!e.dataset.i18nHtml) e.dataset.i18nHtml = e.innerHTML.trim();
      e.innerHTML = U.t(e.dataset.i18nHtml);
    }
    for (const e of r.querySelectorAll('[data-i18n-title]')) {
      if (!e.dataset.i18nTitle) e.dataset.i18nTitle = e.title;
      e.title = U.t(e.dataset.i18nTitle);
    }
    for (const e of r.querySelectorAll('[data-i18n-aria]')) {
      if (!e.dataset.i18nAria) e.dataset.i18nAria = e.getAttribute('aria-label');
      e.setAttribute('aria-label', U.t(e.dataset.i18nAria));
    }
  };
})();
