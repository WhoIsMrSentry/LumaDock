'use strict';

const fs = require('node:fs');
const path = require('node:path');

const LOCALES_DIR = path.join(__dirname, '..', 'locales');
const SUPPORTED_LANGS = ['en', 'tr'];

let catalogsCache = null;
let currentLang = null;
let configuredUserData = null;
const listeners = new Set();

function normalizeLang(lang) {
  const s = String(lang || '').trim().toLowerCase();
  if (s === 'tr' || s.startsWith('tr-') || s.startsWith('tr_')) return 'tr';
  return 'en';
}

function loadCatalog(lang) {
  const safe = normalizeLang(lang);
  const filePath = path.join(LOCALES_DIR, `${safe}.json`);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

function getCatalogs(force = false) {
  if (!catalogsCache || force) {
    catalogsCache = {
      en: loadCatalog('en'),
      tr: loadCatalog('tr')
    };
  }
  return catalogsCache;
}

function defaultExtrasPath(userDataDir) {
  if (userDataDir) return path.join(userDataDir, 'extras.json');
  if (configuredUserData) return path.join(configuredUserData, 'extras.json');
  const appData = process.env.APPDATA || process.env.XDG_CONFIG_HOME || '';
  if (!appData) return '';
  return path.join(appData, 'lumadock-assistant-electron', 'extras.json');
}

function detectLanguage(userDataDir) {
  const cfgPath = defaultExtrasPath(userDataDir);
  if (cfgPath) {
    try {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (parsed && (parsed.lang === 'en' || parsed.lang === 'tr')) return parsed.lang;
    } catch {}
  }
  return 'en';
}

function getLanguage() {
  if (!currentLang) currentLang = detectLanguage();
  return currentLang;
}

function setLanguage(lang, { persist = false, userDataDir } = {}) {
  const next = normalizeLang(lang);
  const changed = currentLang !== next;
  currentLang = next;
  if (persist) {
    const cfgPath = defaultExtrasPath(userDataDir);
    if (cfgPath) {
      try {
        let cfg = {};
        try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch {}
        cfg.lang = next;
        fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
        fs.writeFileSync(cfgPath, JSON.stringify(cfg));
      } catch {}
    }
  }
  if (changed) {
    for (const fn of listeners) {
      try { fn(next); } catch {}
    }
  }
  return next;
}

function initI18n({ userData } = {}) {
  if (userData) configuredUserData = userData;
  currentLang = detectLanguage(configuredUserData);
  return currentLang;
}

function onLanguageChange(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function resolveKey(obj, key) {
  if (!obj || typeof key !== 'string') return undefined;
  let cur = obj;
  for (const part of key.split('.')) {
    if (cur == null || typeof cur !== 'object' || !Object.hasOwn(cur, part)) return undefined;
    cur = cur[part];
  }
  return cur;
}

function formatTemplate(template, params) {
  if (typeof template !== 'string') return template;
  if (!params || typeof params !== 'object') return template;
  return template.replace(/\{(\w+)\}/g, (match, k) => (Object.hasOwn(params, k) && params[k] != null ? String(params[k]) : match));
}

function translate(lang, key, params) {
  const catalogs = getCatalogs();
  const safeLang = normalizeLang(lang);
  const raw = resolveKey(catalogs[safeLang], key) ?? resolveKey(catalogs.en, key);
  if (typeof raw !== 'string') return raw !== undefined ? raw : String(key);
  return formatTemplate(raw, params);
}

function translatePlural(lang, keyBase, count, params) {
  const n = Number(count) || 0;
  const formKey = n === 1 ? `${keyBase}_one` : `${keyBase}_other`;
  return translate(lang, formKey, { count: n, ...(params || {}) });
}

function t(key, params, langOverride) {
  return translate(langOverride || getLanguage(), key, params);
}

function tn(keyBase, count, params, langOverride) {
  return translatePlural(langOverride || getLanguage(), keyBase, count, params);
}

function getBundle(langOverride) {
  return {
    lang: normalizeLang(langOverride || getLanguage()),
    catalogs: getCatalogs()
  };
}

function registerI18nIpc(ipcMain, { BrowserWindow } = {}) {
  if (!ipcMain) return;
  ipcMain.on('i18n:get-bundle', event => {
    event.returnValue = getBundle();
  });
  ipcMain.handle?.('i18n:get', () => ({ ok: true, ...getBundle() }));
  ipcMain.handle?.('i18n:set-lang', (_event, lang) => {
    const next = setLanguage(lang, { persist: true });
    if (BrowserWindow) {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('i18n:lang-changed', next);
        }
      }
    }
    return { ok: true, lang: next };
  });
}

module.exports = {
  SUPPORTED_LANGS,
  normalizeLang,
  getCatalogs,
  detectLanguage,
  getLanguage,
  setLanguage,
  initI18n,
  onLanguageChange,
  resolveKey,
  formatTemplate,
  translate,
  translatePlural,
  t,
  tn,
  getBundle,
  registerI18nIpc
};
