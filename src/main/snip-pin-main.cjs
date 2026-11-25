'use strict';
// One-shot Screen Snip overlay, Fullscreen Magnifier Eyedropper & Screen Ruler,
// Floating Always-on-Top Pinned Reference cards, File/OCR Pickers & Screen Recorder helpers.
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const i18n = require('../shared/i18n.cjs');

function setupSnipAndPin(electron, deps) {
  const { app, BrowserWindow, screen, desktopCapturer, clipboard, nativeImage, ipcMain, dialog } = electron;
  const { handle, send, runOcrFromFile, onAiQuestion } = deps;

  const PRELOAD = path.join(__dirname, 'overlay-preload.js');
  const SNIP_HTML = path.join(__dirname, '..', 'ui', 'snip.html');
  const EYEDROPPER_HTML = path.join(__dirname, '..', 'ui', 'eyedropper.html');
  const PIN_HTML = path.join(__dirname, '..', 'ui', 'pin.html');

  let snipWin = null;
  let snipSnapshot = null; // { image: NativeImage, scaleFactor, displayBounds }
  let eyeWin = null;
  let eyeResolve = null;
  const pins = new Map(); // id -> { win, pngBuffer, dataUrl }

  const closeSnip = () => {
    if (snipWin && !snipWin.isDestroyed()) {
      try { snipWin.close(); } catch {}
    }
    snipWin = null;
    snipSnapshot = null;
  };

  const finishEyedropper = result => {
    const res = eyeResolve;
    eyeResolve = null;
    if (eyeWin && !eyeWin.isDestroyed()) {
      try { eyeWin.close(); } catch {}
    }
    eyeWin = null;
    try { app.emit('lumadock-temp-hide', false); } catch {}
    res?.(result || { ok: false, cancelled: true });
  };

  function createPinWindow(pngBuffer, bounds) {
    if (pins.size >= 6) {
      const oldest = pins.keys().next().value;
      const old = pins.get(oldest);
      if (old?.win && !old.win.isDestroyed()) try { old.win.close(); } catch {}
      pins.delete(oldest);
    }
    const id = crypto.randomBytes(4).toString('hex');
    const dataUrl = nativeImage.createFromBuffer(pngBuffer).toDataURL();
    const w = Math.max(140, Math.min(720, bounds.width + 4));
    const h = Math.max(90, Math.min(540, bounds.height + 4));
    const win = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: w,
      height: h,
      minWidth: 120,
      minHeight: 72,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: true,
      hasShadow: true,
      webPreferences: {
        preload: PRELOAD,
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.loadFile(PIN_HTML);
    win.webContents.once('did-finish-load', () => {
      if (!win.isDestroyed()) win.webContents.send('pin:init', { id, dataUrl, opacity: 1 });
    });
    win.on('closed', () => {
      pins.delete(id);
      send('extras:pins', { count: pins.size });
    });
    pins.set(id, { win, pngBuffer, dataUrl });
    send('extras:pins', { count: pins.size });
    return id;
  }

  async function captureActiveDisplay() {
    const pt = screen.getCursorScreenPoint();
    const disp = screen.getDisplayNearestPoint(pt) || screen.getPrimaryDisplay();
    const sf = disp.scaleFactor || 1;
    try { app.emit('lumadock-temp-hide', true); } catch {}
    await new Promise(r => setTimeout(r, 120));
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: Math.round(disp.bounds.width * sf), height: Math.round(disp.bounds.height * sf) }
    });
    const match = sources.find(s => String(s.display_id) === String(disp.id)) || sources[0];
    if (!match || match.thumbnail.isEmpty()) {
      try { app.emit('lumadock-temp-hide', false); } catch {}
      throw new Error('Screen capture unavailable.');
    }
    return { pt, disp, sf, match };
  }

  async function startSnip(options = {}) {
    if (snipWin && !snipWin.isDestroyed()) { snipWin.focus(); return { ok: true }; }
    const { disp, sf, match } = await captureActiveDisplay();
    snipSnapshot = {
      image: match.thumbnail,
      scaleFactor: sf,
      displayBounds: disp.bounds
    };

    snipWin = new BrowserWindow({
      x: disp.bounds.x,
      y: disp.bounds.y,
      width: disp.bounds.width,
      height: disp.bounds.height,
      frame: false,
      transparent: false,
      backgroundColor: '#000000',
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      enableLargerThanScreen: true,
      webPreferences: {
        preload: PRELOAD,
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    snipWin.setAlwaysOnTop(true, 'screen-saver');
    snipWin.loadFile(SNIP_HTML);
    snipWin.webContents.once('did-finish-load', () => {
      if (!snipWin || snipWin.isDestroyed()) return;
      snipWin.webContents.send('snip:init', {
        imageDataUrl: match.thumbnail.toDataURL(),
        scaleFactor: sf,
        autoAction: String(options?.autoAction || ''),
        labels: {
          hint: i18n.t('snip.hint'),
          pin: i18n.t('snip.pin'),
          framed: i18n.t('snip.framed'),
          copy: i18n.t('common.copy'),
          ocr: 'OCR',
          ai: 'AI'
        }
      });
    });
    snipWin.on('closed', () => {
      snipWin = null;
      try { app.emit('lumadock-temp-hide', false); } catch {}
    });
    return { ok: true };
  }

  async function startEyedropper(initialMode = 'picker') {
    if (eyeWin && !eyeWin.isDestroyed()) {
      eyeWin.focus();
      return { ok: false, cancelled: true };
    }
    const { pt, disp, match } = await captureActiveDisplay();
    return new Promise(resolve => {
      eyeResolve = resolve;
      eyeWin = new BrowserWindow({
        x: disp.bounds.x,
        y: disp.bounds.y,
        width: disp.bounds.width,
        height: disp.bounds.height,
        frame: false,
        transparent: false,
        backgroundColor: '#000000',
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        enableLargerThanScreen: true,
        webPreferences: {
          preload: PRELOAD,
          contextIsolation: true,
          nodeIntegration: false
        }
      });
      eyeWin.setAlwaysOnTop(true, 'screen-saver');
      eyeWin.loadFile(EYEDROPPER_HTML);
      eyeWin.webContents.once('did-finish-load', () => {
        if (!eyeWin || eyeWin.isDestroyed()) return;
        eyeWin.webContents.send('eyedropper:init', {
          imageDataUrl: match.thumbnail.toDataURL(),
          mode: initialMode === 'ruler' ? 'ruler' : 'picker',
          cursorX: pt.x - disp.bounds.x,
          cursorY: pt.y - disp.bounds.y,
          labels: {
            picker: i18n.t('home.appsLabels.picker'),
            ruler: i18n.t('studio.rulerBtn'),
            pickerHint: i18n.t('studio.pickerHint'),
            rulerHint: i18n.t('studio.rulerHint')
          }
        });
      });
      eyeWin.on('closed', () => {
        eyeWin = null;
        if (eyeResolve) finishEyedropper({ ok: false, cancelled: true });
        else try { app.emit('lumadock-temp-hide', false); } catch {}
      });
    });
  }
  app.lumadockStartEyedropper = startEyedropper;

  ipcMain.handle('eyedropper:complete', async (_e, payload) => {
    const cleanHex = /^#[0-9A-F]{6}$/i.test(String(payload?.hex || '')) ? String(payload.hex).toUpperCase() : '';
    if (!cleanHex) { finishEyedropper({ ok: false, cancelled: true }); return { ok: false }; }
    clipboard.writeText(cleanHex);
    const rgb = String(payload?.rgb || `${Number(payload?.r) || 0}, ${Number(payload?.g) || 0}, ${Number(payload?.b) || 0}`);
    try { app.lumadockRecordColor?.(cleanHex, rgb); } catch {}
    const out = { ok: true, hex: cleanHex, rgb, hsl: String(payload?.hsl || ''), r: Number(payload?.r) || 0, g: Number(payload?.g) || 0, b: Number(payload?.b) || 0 };
    finishEyedropper(out);
    send('extras:toast', { text: i18n.t('home.copiedColor', { hex: cleanHex }) });
    return out;
  });
  ipcMain.handle('eyedropper:cancel', async () => { finishEyedropper({ ok: false, cancelled: true }); return { ok: true }; });
  ipcMain.handle('eyedropper:ruler-copy', async (_e, payload) => {
    const txt = String(payload?.text || '').slice(0, 80);
    if (txt) {
      clipboard.writeText(txt);
      send('extras:toast', { text: `${txt} (${i18n.t('common.copiedCheck')})` });
    }
    return { ok: true };
  });

  ipcMain.handle('snip:cancel', async () => { closeSnip(); return { ok: true }; });
  ipcMain.handle('snip:complete', async (_event, payload) => {
    if (!snipSnapshot) { closeSnip(); return { ok: false }; }
    const { image, displayBounds } = snipSnapshot;
    const imgSize = image.getSize();
    const scaleX = imgSize.width / Math.max(1, displayBounds.width);
    const scaleY = imgSize.height / Math.max(1, displayBounds.height);
    const rect = payload?.rect || { x: 0, y: 0, width: 100, height: 100 };
    const cropRect = {
      x: Math.max(0, Math.min(imgSize.width - 2, Math.round(rect.x * scaleX))),
      y: Math.max(0, Math.min(imgSize.height - 2, Math.round(rect.y * scaleY))),
      width: Math.max(4, Math.min(imgSize.width, Math.round(rect.width * scaleX))),
      height: Math.max(4, Math.min(imgSize.height, Math.round(rect.height * scaleY)))
    };
    const cropped = image.crop(cropRect);
    const pngBuf = cropped.toPNG();
    const action = String(payload?.action || 'copy');
    const pinBounds = {
      x: displayBounds.x + rect.x,
      y: displayBounds.y + rect.y,
      width: rect.width,
      height: rect.height
    };
    closeSnip();

    if (action === 'pin') {
      const id = createPinWindow(pngBuf, pinBounds);
      return { ok: true, action, id };
    }
    if (action === 'framed' && payload?.framedDataUrl) {
      const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(payload.framedDataUrl));
      if (m) {
        clipboard.writeImage(nativeImage.createFromBuffer(Buffer.from(m[1], 'base64')));
        send('extras:toast', { text: i18n.t('snip.framedCopied') });
        return { ok: true, action };
      }
    }
    if (action === 'ocr') {
      const tmp = path.join(os.tmpdir(), `lumadock-snip-ocr-${crypto.randomBytes(4).toString('hex')}.png`);
      fs.writeFileSync(tmp, pngBuf);
      try {
        const res = await runOcrFromFile(tmp, i18n.getLanguage());
        if (res.ok && res.text) {
          clipboard.writeText(res.text);
          send('extras:ocr-result', { ok: true, text: res.text, source: 'snip' });
          send('extras:toast', { text: i18n.t('snip.ocrCopied') });
        } else {
          send('extras:toast', { text: res.error || i18n.t('toolsPage.ocrEmpty') });
        }
        return res;
      } finally {
        try { fs.rmSync(tmp, { force: true }); } catch {}
      }
    }
    if (action === 'ai') {
      const tmp = path.join(os.tmpdir(), `lumadock-snip-ai-${crypto.randomBytes(4).toString('hex')}.png`);
      fs.writeFileSync(tmp, pngBuf);
      let text = '';
      try {
        const res = await runOcrFromFile(tmp, i18n.getLanguage());
        text = res?.text || '';
      } finally {
        try { fs.rmSync(tmp, { force: true }); } catch {}
      }
      if (text) onAiQuestion?.(text);
      else clipboard.writeImage(cropped);
      return { ok: true, action, text };
    }
    clipboard.writeImage(cropped);
    send('extras:toast', { text: i18n.t('common.copiedCheck') });
    return { ok: true, action: 'copy' };
  });

  ipcMain.handle('pin:action', async (_event, payload) => {
    const entry = pins.get(String(payload?.id || ''));
    if (!entry || entry.win.isDestroyed()) return { ok: false };
    if (payload.action === 'close') { entry.win.close(); return { ok: true }; }
    if (payload.action === 'opacity') {
      entry.win.setOpacity(Math.max(0.35, Math.min(1, Number(payload.value) || 1)));
      return { ok: true };
    }
    if (payload.action === 'copy') {
      clipboard.writeImage(nativeImage.createFromBuffer(entry.pngBuffer));
      send('extras:toast', { text: i18n.t('common.copiedCheck') });
      return { ok: true };
    }
    if (payload.action === 'ocr') {
      const tmp = path.join(os.tmpdir(), `lumadock-pin-ocr-${crypto.randomBytes(4).toString('hex')}.png`);
      fs.writeFileSync(tmp, entry.pngBuffer);
      try {
        const res = await runOcrFromFile(tmp, i18n.getLanguage());
        if (res.ok && res.text) {
          clipboard.writeText(res.text);
          send('extras:toast', { text: i18n.t('snip.ocrCopied') });
        }
        return res;
      } finally {
        try { fs.rmSync(tmp, { force: true }); } catch {}
      }
    }
    return { ok: false };
  });

  handle('extras:snip-start', p => startSnip(p || {}));
  handle('extras:eyedropper-start', p => startEyedropper(p?.mode === 'ruler' ? 'ruler' : 'picker'));
  handle('extras:ocr-file-pick', async () => {
    const pick = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }]
    });
    if (pick.canceled || !pick.filePaths?.[0]) return { cancelled: true };
    const filePath = pick.filePaths[0];
    const r = await runOcrFromFile(filePath, i18n.getLanguage());
    if (r.ok && r.text) {
      clipboard.writeText(r.text);
      send('extras:toast', { text: i18n.t('snip.ocrCopied') });
    }
    return { ...r, fileName: path.basename(filePath) };
  });
  handle('extras:screen-source-get', async () => {
    const pt = screen.getCursorScreenPoint();
    const disp = screen.getDisplayNearestPoint(pt) || screen.getPrimaryDisplay();
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } });
    const match = sources.find(s => String(s.display_id) === String(disp.id)) || sources[0];
    if (!match) throw new Error('No screen source available.');
    return { sourceId: match.id, width: disp.bounds.width, height: disp.bounds.height };
  });
  handle('extras:recording-save', async payload => {
    const b64 = String(payload?.base64 || '');
    if (!b64 || b64.length > 90 * 1024 * 1024) throw new Error(i18n.t('common.error'));
    const dir = app.getPath('desktop') || app.getPath('videos') || os.homedir();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outPath = path.join(dir, `LumaDock-Rec-${stamp}.webm`);
    fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
    send('extras:toast', { text: i18n.t('studio.recSavedToast', { name: path.basename(outPath) }) });
    return { outPath };
  });
  handle('extras:pins-list', async () => ({ count: pins.size }));
  handle('extras:pins-clear', async () => {
    for (const entry of pins.values()) {
      if (entry.win && !entry.win.isDestroyed()) try { entry.win.close(); } catch {}
    }
    pins.clear();
    return { count: 0 };
  });

  return {
    startSnip,
    startEyedropper,
    closeAll: () => {
      closeSnip();
      finishEyedropper({ ok: false, cancelled: true });
      for (const e of pins.values()) try { e.win.close(); } catch {}
      pins.clear();
    }
  };
}

module.exports = { setupSnipAndPin };
