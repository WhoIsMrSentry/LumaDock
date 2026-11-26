'use strict';
// Extras for the island (main process): file tray, calendar (ICS + meeting URL), weather (Open-Meteo),
// volume monitoring/control, mic/cam privacy indicator, fullscreen detection, downloads watcher & CPU/RAM telemetry.
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { setupDevTools } = require('./dev-tools-main.cjs');
const { setupStudio } = require('./studio-main.cjs');
const { setupGitHub } = require('./github-main.cjs');
const { setupPowerTools } = require('./power-tools-main.cjs');

const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const BLANK_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function setup(electron) {
  const { app, ipcMain, shell, nativeImage, BrowserWindow, dialog } = electron;
  const i18n = require('../shared/i18n.cjs');
  const file = name => path.join(app.getPath('userData'), name);
  const readJson = (name, fallback) => { try { return JSON.parse(fs.readFileSync(file(name), 'utf8')); } catch { return fallback; } };
  const writeJson = (name, value) => { try { fs.writeFileSync(file(name), JSON.stringify(value)); } catch {} };
  const trusted = event => {
    try { return path.resolve(fileURLToPath(event.sender.getURL())).toLowerCase() === path.join(__dirname, '..', '..', 'mascot.html').toLowerCase(); }
    catch { return false; }
  };
  const trustedBoth = event => {
    try {
      const p = path.resolve(fileURLToPath(event.sender.getURL())).toLowerCase();
      return p === path.join(__dirname, '..', '..', 'mascot.html').toLowerCase() || p === path.join(__dirname, '..', '..', 'settings-app.html').toLowerCase();
    } catch { return false; }
  };
  const handle = (channel, fn) => ipcMain.handle(channel, async (event, payload) => {
    if (!trusted(event)) return { ok: false, error: i18n.t('common.accessDenied') };
    try { return { ok: true, ...(await fn(payload, event)) }; } catch (error) { return { ok: false, error: error.message }; }
  });
  const handleBoth = (channel, fn) => ipcMain.handle(channel, async (event, payload) => {
    if (!trustedBoth(event)) return { ok: false, error: i18n.t('common.accessDenied') };
    try { return { ok: true, ...(await fn(payload, event)) }; } catch (error) { return { ok: false, error: error.message }; }
  });
  const send = (channel, data) => { for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed() && trusted({ sender: win.webContents })) win.webContents.send(channel, data); };

  // ---------- file tray: remembers paths of files you drop on the island ----------
  let tray = readJson('tray.json', []).filter(p => typeof p === 'string' && fs.existsSync(p));
  const icons = new Map();
  const trayView = async () => ({ files: await Promise.all(tray.map(async p => {
    let icon = icons.get(p);
    if (!icon) { try { icon = await app.getFileIcon(p, { size: 'normal' }); icons.set(p, icon); } catch {} }
    let size = 0; try { size = fs.statSync(p).size; } catch {}
    return { path: p, name: path.basename(p), icon: icon ? icon.toDataURL() : '', size };
  })) });
  handle('extras:tray-get', trayView);
  handle('extras:tray-add', async payload => {
    for (const p of (Array.isArray(payload?.paths) ? payload.paths : []).slice(0, 20)) {
      if (typeof p === 'string' && path.isAbsolute(p) && fs.existsSync(p) && !tray.includes(p)) tray.unshift(p);
    }
    tray = tray.slice(0, 24); writeJson('tray.json', tray); return trayView();
  });
  handle('extras:tray-pick-files', async () => {
    const pick = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] });
    if (pick.canceled || !pick.filePaths?.length) return { cancelled: true, ...(await trayView()) };
    for (const p of pick.filePaths.slice(0, 20)) {
      if (typeof p === 'string' && path.isAbsolute(p) && fs.existsSync(p) && !tray.includes(p)) tray.unshift(p);
    }
    tray = tray.slice(0, 24); writeJson('tray.json', tray);
    return trayView();
  });
  handle('extras:tray-remove', async payload => { tray = tray.filter(p => p !== payload?.path); writeJson('tray.json', tray); return trayView(); });
  handle('extras:tray-open', async payload => {
    if (!tray.includes(payload?.path)) throw new Error(i18n.t('extras.fileNotInTray'));
    const problem = await shell.openPath(payload.path); if (problem) throw new Error(problem); return {};
  });
  ipcMain.on('extras:tray-drag', (event, p) => {
    if (!trusted(event) || !tray.includes(p) || !fs.existsSync(p)) return;
    event.sender.startDrag({ file: p, icon: icons.get(p) || nativeImage.createFromDataURL(BLANK_PNG) });
  });

  // ---------- settings for calendar, weather and language ----------
  let config = readJson('extras.json', { calendarUrl: '', city: '', lang: 'en' });
  handle('extras:config', async payload => {
    if (payload && typeof payload === 'object') {
      if (typeof payload.calendarUrl === 'string') {
        const url = payload.calendarUrl.trim().replace(/^webcal:/i, 'https:');
        if (url && !/^https:\/\//i.test(url)) throw new Error(i18n.t('extras.invalidCalendarUrl'));
        config.calendarUrl = url; calendarCache = null;
      }
      if (typeof payload.city === 'string') { config.city = payload.city.trim().slice(0, 80); weatherCache = null; }
      if (payload.lang === 'tr' || payload.lang === 'en') {
        config.lang = payload.lang;
        weatherCache = null;
        i18n.setLanguage(payload.lang, { persist: false });
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) win.webContents.send('i18n:lang-changed', payload.lang);
        }
      }
      writeJson('extras.json', config);
    }
    return { config };
  });

  // ---------- calendar: next event from an ICS link (with meeting URL detection) ----------
  let calendarCache = null;
  handle('extras:calendar', async () => {
    if (!config.calendarUrl) return { next: null };
    if (!calendarCache || Date.now() - calendarCache.at > 10 * 60000) {
      const res = await fetch(config.calendarUrl, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(i18n.t('extras.calendarUnreachable', { status: res.status }));
      calendarCache = { at: Date.now(), events: parseIcs(await res.text()) };
    }
    const now = Date.now();
    const next = calendarCache.events.map(e => ({ ...e, start: nextStart(e, now) })).filter(e => e.start && e.start + (e.duration || 0) > now)
      .sort((a, b) => a.start - b.start)[0] || null;
    return { next: next && { title: next.title, start: next.start, duration: next.duration || 0, allDay: next.allDay, url: next.url || '' } };
  });

  // ---------- weather (Open-Meteo, no account needed) ----------
  let weatherCache = null;
  handle('extras:weather', async () => {
    if (!config.city) return { weather: null };
    const lang = config.lang === 'tr' ? 'tr' : 'en';
    if (!weatherCache || Date.now() - weatherCache.at > 15 * 60000 || weatherCache.lang !== lang) {
      const geo = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=${lang}&name=` + encodeURIComponent(config.city), { signal: AbortSignal.timeout(8000) })).json();
      const place = geo?.results?.[0]; if (!place) throw new Error(i18n.t('extras.cityNotFound'));
      const data = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=3`, { signal: AbortSignal.timeout(8000) })).json();
      const cur = data.current || {}, daily = data.daily || {};
      const forecast = Array.isArray(daily.time) ? daily.time.map((dt, i) => ({
        date: dt,
        code: Number(daily.weather_code?.[i] ?? cur.weather_code ?? 0),
        max: Math.round(Number(daily.temperature_2m_max?.[i] ?? cur.temperature_2m ?? 0)),
        min: Math.round(Number(daily.temperature_2m_min?.[i] ?? cur.temperature_2m ?? 0))
      })) : [];
      weatherCache = {
        at: Date.now(),
        lang,
        weather: {
          place: place.name,
          temp: Math.round(cur.temperature_2m),
          feelsLike: Number.isFinite(cur.apparent_temperature) ? Math.round(cur.apparent_temperature) : Math.round(cur.temperature_2m),
          humidity: Number.isFinite(cur.relative_humidity_2m) ? Math.round(cur.relative_humidity_2m) : null,
          wind: Number.isFinite(cur.wind_speed_10m) ? Math.round(cur.wind_speed_10m) : null,
          code: cur.weather_code,
          day: cur.is_day === 1,
          forecast
        }
      };
    }
    return { weather: weatherCache.weather };
  });

  // ---------- volume + privacy (mic/cam) + fullscreen watcher ----------
  let volumeChild = null, stopping = false, hasClipSeqWatcher = false, lastClipSeq = '', clipReadTimer = null;
  const volCmdFile = path.join(os.tmpdir(), 'lumadock-vol-cmd.txt');
  function writeVolCmd(cmd) {
    try { fs.appendFileSync(volCmdFile, cmd + '\n', 'utf8'); } catch {}
  }
  handle('extras:volume-set', async payload => {
    const lvl = Math.max(0, Math.min(100, Math.round(Number(payload) || 0)));
    writeVolCmd(`set ${lvl}`);
    return { level: lvl };
  });
  handle('extras:volume-step', async payload => {
    const delta = Math.max(-50, Math.min(50, Math.round(Number(payload) || 0)));
    if (delta) writeVolCmd(`step ${delta}`);
    return { delta };
  });
  handle('extras:volume-mute', async () => { writeVolCmd('mute'); return {}; });

  let clipOwnerProcess = '';
  function scheduleClipRead(owner = '') {
    clipOwnerProcess = owner || '';
    clearTimeout(clipReadTimer);
    clipReadTimer = setTimeout(() => { readClipboard(clipOwnerProcess).catch(() => {}); }, 120);
  }

  function startVolume() {
    if (process.platform !== 'win32' || volumeChild || stopping) return;
    volumeChild = spawn(POWERSHELL, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, '..', 'native', 'volume-watch.ps1'), '-Parent', String(process.pid)],
      { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'ignore'] });
    hasClipSeqWatcher = true;
    let buffer = '';
    volumeChild.stdout.on('data', chunk => {
      buffer += chunk.toString();
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end).trim();
        buffer = buffer.slice(end + 1);
        if (!line) continue;
        if (line.startsWith('P ')) {
          const [, m, c] = line.split(' ');
          const priv = { mic: m === '1', cam: c === '1' };
          send('extras:privacy', priv);
          studio?.onPrivacyChange?.(priv);
        } else if (line.startsWith('F ')) {
          const fsActive = line.split(' ')[1] === '1';
          app.emit('lumadock-fullscreen', fsActive);
          send('extras:fullscreen', { fullscreen: fsActive });
        } else if (line.startsWith('A ')) {
          const peak = Number(line.slice(2));
          if (Number.isFinite(peak)) send('extras:audio-peak', { peak: Math.max(0, Math.min(100, peak)) });
        } else if (line.startsWith('C ')) {
          const rawSeq = line.slice(2).trim();
          const barIdx = rawSeq.indexOf('|');
          const seq = barIdx >= 0 ? rawSeq.slice(0, barIdx) : rawSeq;
          const owner = barIdx >= 0 ? rawSeq.slice(barIdx + 1) : '';
          if (seq && seq !== lastClipSeq) {
            const first = lastClipSeq === '';
            lastClipSeq = seq;
            if (!first) scheduleClipRead(owner);
          }
        } else if (line.startsWith('W ')) {
          const parts = line.slice(2).split('|');
          if (parts.length >= 3) {
            studio?.onForegroundWindow?.({ hwnd: parts[0], pid: Number(parts[1]) || 0, process: parts[2] || '', title: parts.slice(3).join('|') || '' });
          }
        } else if (line.startsWith('N ')) {
          const [, rxS, txS] = line.split(' ');
          const rx = Number(rxS), tx = Number(txS);
          if (Number.isFinite(rx) && Number.isFinite(tx)) {
            app.emit('lumadock-net-bytes', { rx, tx, at: Date.now() });
          }
        } else {
          const [level, muted] = line.split(' ');
          if (level !== undefined && level !== '' && /^\d+$/.test(level)) {
            send('extras:volume', { level: Number(level), muted: muted === '1' });
          }
        }
      }
    });
    volumeChild.on('exit', () => {
      volumeChild = null;
      hasClipSeqWatcher = false;
      if (!stopping && !app.isQuitting) setTimeout(startVolume, 3000);
    });
  }

  // ---------- Bluetooth battery levels (headphones, mouse, ...) every 5 minutes ----------
  const BT_SCRIPT = `$k='{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2'
Get-PnpDevice -Class Bluetooth -Status OK -ErrorAction SilentlyContinue | ForEach-Object {
  $b = (Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName $k -ErrorAction SilentlyContinue).Data
  if ($b -ne $null) { "$b|$($_.FriendlyName)" } }`;
  function readBluetooth() {
    if (process.platform !== 'win32') return;
    const child = spawn(POWERSHELL, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', BT_SCRIPT], { windowsHide: true, shell: false });
    let out = ''; child.stdout.on('data', d => { out += d; });
    child.on('exit', () => {
      const devices = out.split(/\r?\n/).map(line => line.split('|')).filter(([b, n]) => n && /^\d+$/.test(b)).map(([b, n]) => ({ name: n.trim(), battery: Number(b) }));
      send('extras:bluetooth', { devices });
    });
    child.on('error', () => {});
  }

  // ---------- System telemetry (CPU% + RAM%) ----------
  let lastCpu = os.cpus().map(c => ({ ...c.times }));
  handle('extras:system-stats', async () => {
    const cur = os.cpus();
    let idle = 0, total = 0;
    for (let i = 0; i < cur.length; i++) {
      const prev = lastCpu[i] || cur[i].times;
      const now = cur[i].times;
      const dIdle = Math.max(0, now.idle - prev.idle);
      const dTotal = Math.max(0, (now.user - prev.user) + (now.nice - prev.nice) + (now.sys - prev.sys) + (now.irq - prev.irq) + dIdle);
      idle += dIdle; total += dTotal;
    }
    lastCpu = cur.map(c => ({ ...c.times }));
    const cpuPct = total > 0 ? Math.min(100, Math.max(0, Math.round((1 - idle / total) * 100))) : 0;
    const totalMem = os.totalmem(), freeMem = os.freemem(), usedMem = totalMem - freeMem;
    const memPct = totalMem > 0 ? Math.round((usedMem / totalMem) * 100) : 0;
    return {
      cpuPct,
      memPct,
      memUsedGb: Number((usedMem / 1073741824).toFixed(1)),
      memTotalGb: Number((totalMem / 1073741824).toFixed(1))
    };
  });

  // ---------- Downloads watcher ----------
  let dlWatcher = null, dlTimer = null, lastActiveTemps = new Set(), seenCompleted = new Set();
  const dlRateMap = new Map();
  function scanDownloads() {
    try {
      const dir = app.getPath('downloads');
      if (!dir || !fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const active = [];
      const currentTemps = new Set();
      let completed = null;
      const now = Date.now();
      for (const e of entries) {
        if (!e.isFile()) continue;
        const full = path.join(dir, e.name);
        if (/\.(crdownload|part|opdownload|tmp)$/i.test(e.name)) {
          let size = 0;
          try { size = fs.statSync(full).size; } catch {}
          const prev = dlRateMap.get(full);
          const speedBps = prev && size >= prev.size && now > prev.at
            ? Math.round(((size - prev.size) / (now - prev.at)) * 1000)
            : (prev?.speedBps || 0);
          dlRateMap.set(full, { size, at: now, speedBps });
          const clean = e.name.replace(/\.(crdownload|part|opdownload|tmp)$/i, '');
          currentTemps.add(clean);
          active.push({ name: clean || e.name, path: full, size, speedBps });
        } else if (lastActiveTemps.has(e.name) && !seenCompleted.has(full)) {
          let st = null;
          try { st = fs.statSync(full); } catch {}
          if (st && now - st.mtimeMs < 30000) {
            seenCompleted.add(full);
            completed = { name: e.name, path: full, size: st.size, at: now };
          }
        }
      }
      for (const key of dlRateMap.keys()) {
        if (!active.some(a => a.path === key)) dlRateMap.delete(key);
      }
      if (active.length || lastActiveTemps.size || completed) {
        send('extras:downloads', { active: active.slice(0, 4), completed });
      }
      lastActiveTemps = currentTemps;
    } catch {}
  }
  function startDownloadsWatcher() {
    try {
      const dir = app.getPath('downloads');
      if (!dir || !fs.existsSync(dir) || dlWatcher) return;
      dlWatcher = fs.watch(dir, { persistent: false }, () => {
        clearTimeout(dlTimer);
        dlTimer = setTimeout(scanDownloads, 350);
      });
      dlWatcher.on('error', () => { try { dlWatcher?.close(); } catch {} dlWatcher = null; });
    } catch {}
  }
  handle('extras:download-open', async payload => {
    const dir = fs.realpathSync(app.getPath('downloads'));
    const target = fs.realpathSync(String(payload?.path || ''));
    const rel = path.relative(dir, target);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(i18n.t('extras.fileOutsideDownloads'));
    }
    const err = await shell.openPath(target);
    if (err) throw new Error(err);
    return {};
  });

  // ---------- clipboard history: last 10 copied texts & screenshots/images (memory only) ----------
  let clips = [], lastClipText = '', lastClipImgHash = '';
  const clipsView = () => ({
    clips: clips.map(c => c.kind === 'image'
      ? { kind: 'image', thumbUrl: c.thumbUrl, width: c.width, height: c.height, hash: c.hash, ocrText: c.ocrText || '', qrText: c.qrText || '', text: `${c.width}×${c.height}` }
      : { kind: 'text', text: c.text.slice(0, 400), long: c.text.length > 400 })
  });
  let clipReading = false, suppressClipHistoryUntil = 0;
  async function readClipboard(ownerProc = '') {
    if (clipReading) return;
    clipReading = true;
    try {
      let fmts = [];
      try { fmts = electron.clipboard.availableFormats() || []; } catch {}
      const wantsText = !fmts.length || fmts.some(f => f.includes('text'));
      const wantsImage = fmts.some(f => f.startsWith('image/'));

      if (wantsText) {
        let text = '';
        try {
          const r = electron.clipboard.readText();
          text = typeof r === 'string' ? r : r && typeof r.then === 'function' ? await r : '';
        } catch {}
        if (typeof text === 'string' && text && text !== lastClipText) {
          lastClipText = text;
          if (Date.now() < suppressClipHistoryUntil) return;
          const res = studio?.onClipboardText?.(text, ownerProc);
          if (res?.skip) return;
          if (text.trim() && text.length <= 20000) {
            clips = [{ kind: 'text', text, kindTag: res?.analysis?.badge || '' }, ...clips.filter(c => c.kind !== 'text' || c.text !== text)].slice(0, 10);
            send('extras:clips', clipsView());
            return;
          }
        }
      }
      if (!wantsImage) return;
      try {
        const img = electron.clipboard.readImage();
        if (img && !img.isEmpty()) {
          const size = img.getSize();
          if (!size.width || !size.height) return;
          // Fast bitmap signature BEFORE expensive PNG resize/encode so unchanged images never burn CPU
          const bmp = img.getBitmap();
          const mid = Math.max(0, (bmp.length >> 1) - 1024);
          const preSig = `${size.width}x${size.height}:${bmp.length}:${crypto.createHash('sha1').update(bmp.subarray(0, 2048)).update(bmp.subarray(mid, mid + 2048)).update(bmp.subarray(Math.max(0, bmp.length - 2048))).digest('hex')}`;
          if (preSig === lastClipImgHash) return;
          lastClipImgHash = preSig;
          const capped = size.width > 1400 ? img.resize({ width: 1400, quality: 'good' }) : img;
          const png = capped.toPNG();
          if (png.length > 0 && png.length <= 8 * 1024 * 1024) {
            const hash = crypto.createHash('sha1').update(png).digest('hex').slice(0, 16);
            const thumb = (size.width > 260 ? img.resize({ width: 260, quality: 'good' }) : img).toDataURL();
            const entry = { kind: 'image', png, thumbUrl: thumb, width: size.width, height: size.height, hash, sig: preSig, ocrText: '', qrText: '' };
            clips = [entry, ...clips.filter(c => c.kind !== 'image' || c.hash !== hash)].slice(0, 10);
            send('extras:clips', clipsView());
          }
        }
      } catch {}
    } finally {
      clipReading = false;
    }
  }
  handle('extras:clips-get', async () => clipsView());
  handle('extras:clips-copy', async payload => {
    const item = clips[Number(payload?.index)];
    if (!item) throw new Error(i18n.t('common.notFound'));
    if (item.kind === 'image') {
      electron.clipboard.writeImage(nativeImage.createFromBuffer(item.png));
      lastClipImgHash = item.sig || item.hash;
    } else {
      electron.clipboard.writeText(item.text);
      lastClipText = item.text;
    }
    clips = [item, ...clips.filter(c => c !== item)];
    return clipsView();
  });
  handle('extras:clips-clear', async () => { clips = []; return clipsView(); });

  const devTools = setupDevTools(electron, {
    handle,
    send,
    readJson,
    writeJson,
    getTray: () => tray,
    onAppQuit: fn => app.on('before-quit', fn)
  });
  app.lumadockRecordColor = devTools.recordColor;
  const studio = setupStudio(electron, { handle, send, readJson, writeJson, devTools, writeVolCmd });
  setupGitHub(electron, {
    handleBoth,
    send,
    readJson,
    writeJson,
    resolvedRepoDir: devTools.resolveActiveRepoDir
  });
  setupPowerTools(electron, {
    handle,
    send,
    readJson,
    writeJson,
    devTools,
    suppressClipHistory: (ms = 2500) => { suppressClipHistoryUntil = Date.now() + ms; },
    onAppQuit: fn => app.on('before-quit', fn)
  });

  handle('extras:clip-ocr', async payload => {
    const idx = Number(payload?.index);
    const item = clips[idx];
    if (!item || item.kind !== 'image' || !item.png) throw new Error(i18n.t('common.notFound'));
    const tmp = path.join(os.tmpdir(), `lumadock-clip-ocr-${idx}-${Date.now()}.png`);
    fs.writeFileSync(tmp, item.png);
    try {
      const r = await devTools.runOcrFromFile(tmp, i18n.getLanguage());
      if (r.ok) {
        item.ocrText = r.text || '';
        if (payload?.copy !== false && r.text) {
          electron.clipboard.writeText(r.text);
          lastClipText = r.text;
        }
      }
      return { ...r, ...clipsView() };
    } finally {
      try { fs.rmSync(tmp, { force: true }); } catch {}
    }
  });
  handle('extras:clip-set-qr', async payload => {
    const item = clips[Number(payload?.index)];
    if (item && item.kind === 'image' && typeof payload?.qrText === 'string') {
      item.qrText = payload.qrText.slice(0, 1000);
    }
    return clipsView();
  });

  // ---------- quick note: one note saved on this PC ----------
  handle('extras:note-get', async () => ({ text: readJson('note.json', { text: '' }).text || '' }));
  handle('extras:note-set', async payload => { writeJson('note.json', { text: String(payload?.text || '').slice(0, 20000) }); return {}; });
  handle('extras:copy-text', async payload => {
    const text = String(payload?.text || '').slice(0, 50000);
    if (!text) return {};
    electron.clipboard.writeText(text);
    lastClipText = text;
    return {};
  });

  // ---------- keyboard shortcuts: Ctrl+Alt+1..8, Space, S (Snip), P (Pin), H (Shield) ----------
  const SHORTCUTS = { 1: 'home', 2: 'spotify', 3: 'claude', 4: 'focus', 5: 'clips', 6: 'note', 7: 'github', 8: 'weather', Space: 'command' };
  app.on('will-quit', () => {
    try {
      for (const n of Object.keys(SHORTCUTS)) electron.globalShortcut.unregister('CommandOrControl+Alt+' + n);
      electron.globalShortcut.unregister('CommandOrControl+Alt+S');
      electron.globalShortcut.unregister('CommandOrControl+Alt+P');
      electron.globalShortcut.unregister('CommandOrControl+Alt+H');
    } catch {}
  });

  app.whenReady().then(() => {
    // Only poll clipboard on non-Windows or if volume-watch sequence watcher is inactive
    const poll = setInterval(() => { if (!hasClipSeqWatcher) readClipboard().catch(() => {}); }, 1800); poll.unref?.();
    const dlPoll = setInterval(() => { if (lastActiveTemps.size) scanDownloads(); }, 1800); dlPoll.unref?.();
    for (const [n, view] of Object.entries(SHORTCUTS)) {
      try {
        electron.globalShortcut.register('CommandOrControl+Alt+' + n, () => {
          const isl = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && trusted({ sender: w.webContents }));
          if (isl) {
            if (isl.isMinimized()) isl.restore();
            if (view === 'command') { isl.show(); isl.focus(); }
            else isl.showInactive();
          }
          send('extras:shortcut', view);
        });
      } catch {}
    }
    try {
      electron.globalShortcut.register('CommandOrControl+Alt+S', () => { studio?.startSnip?.().catch(() => {}); });
      electron.globalShortcut.register('CommandOrControl+Alt+P', () => { studio?.togglePinActiveWindow?.().catch(() => {}); });
      electron.globalShortcut.register('CommandOrControl+Alt+H', () => { studio?.toggleShield?.(); });
    } catch {}
    // Never capture screen video/DXGI desktop frames in background from transparent overlay window
    electron.session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => callback({}));
    startVolume();
    startDownloadsWatcher();
    setTimeout(readBluetooth, 15000); const bt = setInterval(readBluetooth, 5 * 60000); bt.unref?.();
  });
  app.on('before-quit', () => {
    stopping = true;
    try { studio?.closeAll?.(); } catch {}
    try { volumeChild?.kill(); } catch {}
    try { dlWatcher?.close(); } catch {}
  });
}

// ---------- ICS reader: SUMMARY, DTSTART, DTEND, LOCATION/DESCRIPTION/URL meeting links & DAILY/WEEKLY repeats ----------
const MEETING_RE = /https:\/\/(?:meet\.google\.com|[\w.-]*zoom\.us|teams\.microsoft\.com|teams\.live\.com|discord\.gg|whereby\.com|[\w.-]*webex\.com)\/[^\s<>"')\\]+/i;
function parseIcs(text) {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/), events = [];
  let event = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') event = {};
    else if (line === 'END:VEVENT') { if (event?.start) events.push(event); event = null; }
    else if (event) {
      const colon = line.indexOf(':'); if (colon < 0) continue;
      const head = line.slice(0, colon), value = line.slice(colon + 1), name = head.split(';')[0];
      if (name === 'SUMMARY') event.title = value.replace(/\\([,;\\])/g, '$1').replace(/\\n/gi, ' ').slice(0, 120);
      if (name === 'DTSTART') { event.start = icsDate(value); event.allDay = /VALUE=DATE(?!-)/.test(head) || /^\d{8}$/.test(value); }
      if (name === 'DTEND') event.end = icsDate(value);
      if (name === 'RRULE') event.rrule = value;
      if (!event.url && ['LOCATION', 'DESCRIPTION', 'URL', 'X-GOOGLE-CONFERENCE', 'CONFERENCE'].includes(name)) {
        const cleanVal = value.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1');
        const m = MEETING_RE.exec(cleanVal);
        if (m) event.url = m[0].slice(0, 400);
      }
    }
  }
  for (const e of events) e.duration = e.end ? Math.max(0, e.end - e.start) : 0;
  return events.filter(e => e.start).slice(0, 5000);
}
function icsDate(value) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/.exec(value); if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00', s = '00', z] = m;
  return z ? Date.UTC(+y, mo - 1, +d, +h, +mi, +s) : new Date(+y, mo - 1, +d, +h, +mi, +s).getTime();
}
function nextStart(event, now) {
  if (!event.rrule) return event.start;
  const freq = /FREQ=(DAILY|WEEKLY)/.exec(event.rrule)?.[1]; if (!freq) return event.start;
  const until = /UNTIL=(\w+)/.exec(event.rrule)?.[1], end = until ? icsDate(until) : Infinity;
  const step = (freq === 'DAILY' ? 1 : 7) * 86400000 * Number(/INTERVAL=(\d+)/.exec(event.rrule)?.[1] || 1);
  if (event.start + event.duration > now) return event.start;
  const next = event.start + Math.ceil((now - event.duration - event.start) / step) * step;
  return next <= end ? next : null;
}

if (process.versions.electron) setup(require('electron'));
module.exports = { parseIcs, nextStart, icsDate };
