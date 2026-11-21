// Modern JSON-backed localization helper for all LumaDock renderer windows.
(() => {
  'use strict';

  const normalizeLang = value => {
    const s = String(value || '').trim().toLowerCase();
    return s === 'tr' || s.startsWith('tr-') || s.startsWith('tr_') ? 'tr' : 'en';
  };

  const getBridge = () => window.lumadock || window.settingsApp || window.buddy || null;

  const resolveKey = (obj, key) => {
    if (!obj || typeof key !== 'string') return undefined;
    let cur = obj;
    for (const part of key.split('.')) {
      if (cur == null || typeof cur !== 'object' || !Object.hasOwn(cur, part)) return undefined;
      cur = cur[part];
    }
    return cur;
  };

  const formatTemplate = (template, params) => {
    if (typeof template !== 'string' || !params || typeof params !== 'object') return template;
    return template.replace(/\{(\w+)\}/g, (match, k) => (
      Object.hasOwn(params, k) && params[k] != null ? String(params[k]) : match
    ));
  };

  const bridge = getBridge();
  const initialBundle = (() => {
    try { return bridge?.i18nBundle?.() || null; } catch { return null; }
  })();

  let catalogs = initialBundle?.catalogs || { en: {}, tr: {} };
  let currentLang = (() => {
    if (initialBundle?.lang) return normalizeLang(initialBundle.lang);
    try {
      const saved = JSON.parse(localStorage.getItem('lumadock-fun-v1') || '{}');
      if (saved && saved.lang) return normalizeLang(saved.lang);
    } catch {}
    return normalizeLang(navigator.language);
  })();

  const listeners = new Set();

  const applyHtmlLang = () => {
    try {
      if (document.documentElement) document.documentElement.lang = currentLang;
    } catch {}
  };

  const getLang = () => currentLang;
  const locale = langOverride => (normalizeLang(langOverride || currentLang) === 'tr' ? 'tr-TR' : 'en-US');

  const t = (key, params, langOverride) => {
    const lang = normalizeLang(langOverride || currentLang);
    const raw = resolveKey(catalogs[lang], key) ?? resolveKey(catalogs.en, key);
    if (typeof raw !== 'string') return raw !== undefined ? raw : String(key);
    return formatTemplate(raw, params);
  };

  const tn = (keyBase, count, params, langOverride) => {
    const n = Number(count) || 0;
    const formKey = n === 1 ? `${keyBase}_one` : `${keyBase}_other`;
    return t(formKey, { count: n, ...(params || {}) }, langOverride);
  };

  const bindDom = (root = document) => {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    for (const el of root.querySelectorAll('[data-i18n]')) {
      const key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key);
    }
    for (const el of root.querySelectorAll('[data-i18n-placeholder]')) {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) el.setAttribute('placeholder', t(key));
    }
    for (const el of root.querySelectorAll('[data-i18n-title]')) {
      const key = el.getAttribute('data-i18n-title');
      if (key) el.setAttribute('title', t(key));
    }
    for (const el of root.querySelectorAll('[data-i18n-aria-label]')) {
      const key = el.getAttribute('data-i18n-aria-label');
      if (key) el.setAttribute('aria-label', t(key));
    }
  };

  const setLang = (nextLang, { persist = true } = {}) => {
    const next = normalizeLang(nextLang);
    const changed = currentLang !== next;
    currentLang = next;
    applyHtmlLang();
    if (persist) {
      try { bridge?.i18nSetLang?.(next); } catch {}
    }
    if (changed) {
      bindDom(document);
      for (const fn of listeners) {
        try { fn(next); } catch {}
      }
    }
    return next;
  };

  const onChange = fn => {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  };

  try {
    bridge?.onI18nChanged?.(nextLang => {
      setLang(nextLang, { persist: false });
    });
  } catch {}

  window.addEventListener('storage', e => {
    if (e.key !== 'lumadock-fun-v1' || !e.newValue) return;
    try {
      const parsed = JSON.parse(e.newValue);
      if (parsed?.lang) setLang(parsed.lang, { persist: false });
    } catch {}
  });

  applyHtmlLang();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      applyHtmlLang();
      bindDom(document);
    }, { once: true });
  } else {
    bindDom(document);
  }

  const api = {
    t,
    tn,
    locale,
    getLang,
    setLang,
    onChange,
    bindDom,
    catalog: () => catalogs[currentLang] || catalogs.en || {},
    catalogs: () => catalogs
  };

  window.__lumadockI18n = api;
  window.__lumadockT = t;
  window.__lumadockTn = tn;
  window.__lumadockLang = getLang;
  window.__lumadockLocale = locale;
  window.__lumadockBindI18n = bindDom;
})();
