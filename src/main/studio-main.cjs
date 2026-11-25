'use strict';
// LumaDock Studio Backend: Per-App Core Audio Mixer, Output Device Switcher, Smart Ducking,
// Win32 Window Pin/Opacity/Ghost, Persistent Vault (Clips/Prompts/Todos), ZIP & Media Tools,
// Snip & Pin Coordinator, Context Engine, and Cross-AI Relay.
const { execFile, spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { analyzeClipboardContent, isSensitiveOwner } = require('../shared/content-detective.cjs');
const { createZipFromPaths, convertImageFile } = require('./zip-and-media.cjs');
const { setupSnipAndPin } = require('./snip-pin-main.cjs');
const { createContextEngine } = require('./context-engine.cjs');
const i18n = require('../shared/i18n.cjs');

const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const AUDIO_MIXER_PS = path.join(__dirname, '..', 'native', 'audio-sessions.ps1');
const WIN_TOOLS_PS = path.join(__dirname, '..', 'native', 'window-tools.ps1');

const execPsJson = (scriptPath, args, timeout = 5000) => new Promise((resolve, reject) => {
  if (process.platform !== 'win32') { resolve({ ok: false, unsupported: true }); return; }
  execFile(POWERSHELL, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args.map(String)],
    { windowsHide: true, timeout, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      const out = String(stdout || '').trim();
      const idx = out.indexOf('{');
      if (idx >= 0) {
        try { resolve(JSON.parse(out.slice(idx))); return; } catch {}
      }
      if (err) reject(err);
      else resolve({ ok: false });
    });
});

function setupStudio(electron, deps) {
  const { app, clipboard, nativeImage, powerSaveBlocker, shell } = electron;
  const { handle, send, readJson, writeJson, devTools, writeVolCmd } = deps;

  // ---------- 1. Persistent Vault (Pinned Clips, Prompt Templates, Mini To-Do) ----------
  const rawVault = readJson('vault.json', {});
  let vault = {
    pinned: Array.isArray(rawVault?.pinned) ? rawVault.pinned.slice(0, 30) : [],
    prompts: Array.isArray(rawVault?.prompts) && rawVault.prompts.length ? rawVault.prompts.slice(0, 30) : [
      { id: 'pr-bug', tag: '/fix', title: 'Explain & Fix Error', body: 'Analyze this error carefully, explain the root cause briefly, and give the minimal fix:\n\n' },
      { id: 'pr-review', tag: '/review', title: 'Senior Code Review', body: 'Review this code for bugs, security risks, and unnecessary complexity:\n\n' },
      { id: 'pr-tr', tag: '/tr', title: 'Natural Translation', body: 'Translate clearly while preserving technical terms:\n\n' }
    ],
    todos: Array.isArray(rawVault?.todos) ? rawVault.todos.slice(0, 30) : []
  };
  const saveVault = () => writeJson('vault.json', vault);

  handle('extras:vault-get', async () => ({ vault }));
  handle('extras:vault-pin', async payload => {
    const text = String(payload?.text || '').trim().slice(0, 20000);
    if (!text) return { vault };
    const id = payload?.id || 'clip-' + crypto.createHash('sha1').update(text).digest('hex').slice(0, 10);
    const exists = vault.pinned.find(p => p.id === id);
    if (exists) {
      vault.pinned = vault.pinned.filter(p => p.id !== id);
    } else {
      const analysis = analyzeClipboardContent(text);
      if (analysis?.skip) throw new Error(i18n.t('common.accessDenied'));
      vault.pinned = [{ id, text, badge: analysis?.badge || '', at: Date.now() }, ...vault.pinned].slice(0, 30);
    }
    saveVault();
    return { vault };
  });
  handle('extras:vault-prompt-save', async payload => {
    const title = String(payload?.title || '').trim().slice(0, 48);
    const body = String(payload?.body || '').slice(0, 8000);
    const tag = String(payload?.tag || '').trim().slice(0, 20);
    if (!title || !body.trim()) throw new Error(i18n.t('common.notFound'));
    const entry = { id: payload?.id || 'pr-' + Date.now().toString(36), tag: tag || '/' + title.toLowerCase().slice(0, 8).replace(/\s+/g, '-'), title, body };
    vault.prompts = [entry, ...vault.prompts.filter(p => p.id !== entry.id)].slice(0, 30);
    saveVault();
    return { vault };
  });
  handle('extras:vault-prompt-del', async payload => {
    vault.prompts = vault.prompts.filter(p => p.id !== payload?.id);
    saveVault();
    return { vault };
  });
  handle('extras:vault-todo-toggle', async payload => {
    const item = vault.todos.find(x => x.id === payload?.id);
    if (item) {
      item.done = !item.done;
      if (item.done) ctxEngine.recordAiActivity({ ok: true });
      saveVault();
    }
    return { vault };
  });
  handle('extras:vault-todo-add', async payload => {
    const text = String(payload?.text || '').trim().slice(0, 240);
    if (!text) return { vault };
    vault.todos = [{ id: 'td-' + Date.now().toString(36), text, done: false, at: Date.now() }, ...vault.todos].slice(0, 30);
    saveVault();
    return { vault };
  });
  handle('extras:vault-todo-del', async payload => {
    vault.todos = vault.todos.filter(x => x.id !== payload?.id);
    saveVault();
    return { vault };
  });

  // ---------- 2. Per-App Audio Mixer & Smart Audio Ducking ----------
  let cachedAudio = { ok: true, activeDeviceId: '', devices: [], sessions: [] }, audioFetchedAt = 0;
  let preDuckLevels = new Map(); // proc -> oldVolume

  async function refreshAudioSessions(force = false) {
    if (process.platform !== 'win32') return { ok: true, unsupported: true, devices: [], sessions: [] };
    if (!force && Date.now() - audioFetchedAt < 1400 && cachedAudio.devices) return cachedAudio;
    const res = await execPsJson(AUDIO_MIXER_PS, ['-Action', 'list']).catch(() => ({ ok: false, devices: [], sessions: [] }));
    if (res?.ok) {
      cachedAudio = res;
      audioFetchedAt = Date.now();
    }
    return cachedAudio;
  }

  async function applyDucking(duck, isUndo = false) {
    if (process.platform !== 'win32') return;
    try {
      if (duck) {
        const res = await refreshAudioSessions(true);
        const musicApps = (res.sessions || []).filter(s => /^(?:spotify|music|itunes|vlc|foobar2000|chrome|msedge|firefox|brave)$/i.test(s.process) && s.volume > 25);
        if (musicApps.length) {
          for (const appItem of musicApps.slice(0, 4)) {
            if (!preDuckLevels.has(appItem.process)) preDuckLevels.set(appItem.process, appItem.volume);
            await execPsJson(AUDIO_MIXER_PS, ['-Action', 'set-app', '-Target', String(appItem.pid), '-Value', String(Math.max(15, Math.round(appItem.volume * 0.35)))]);
          }
          send('extras:toast', { text: i18n.t('studio.duckedToast') });
        }
      } else if (preDuckLevels.size) {
        for (const [proc, oldVol] of preDuckLevels.entries()) {
          await execPsJson(AUDIO_MIXER_PS, ['-Action', 'set-app', '-Target', proc, '-Value', String(oldVol)]);
        }
        preDuckLevels.clear();
        if (!isUndo) send('extras:toast', { text: i18n.t('studio.restoredAudioToast') });
      }
    } catch {}
  }

  handle('extras:audio-sessions', async payload => refreshAudioSessions(Boolean(payload?.force)));
  handle('extras:audio-set-app', async payload => {
    const pid = Number(payload?.pid);
    const vol = Math.max(0, Math.min(100, Math.round(Number(payload?.volume) || 0)));
    if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error(i18n.t('common.notFound'));
    const res = await execPsJson(AUDIO_MIXER_PS, ['-Action', 'set-app', '-Target', String(pid), '-Value', String(vol)]);
    cachedAudio = res; audioFetchedAt = Date.now();
    return res;
  });
  handle('extras:audio-mute-app', async payload => {
    const pid = Number(payload?.pid);
    if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error(i18n.t('common.notFound'));
    const muted = payload?.muted ? '1' : '0';
    const res = await execPsJson(AUDIO_MIXER_PS, ['-Action', 'mute-app', '-Target', String(pid), '-Value', muted]);
    cachedAudio = res; audioFetchedAt = Date.now();
    return res;
  });
  handle('extras:audio-set-device', async payload => {
    const id = String(payload?.id || '').trim();
    if (!id || id.length > 200) throw new Error(i18n.t('common.notFound'));
    const res = await execPsJson(AUDIO_MIXER_PS, ['-Action', 'set-device', '-Target', id]);
    cachedAudio = res; audioFetchedAt = Date.now();
    return res;
  });

  // ---------- 3. Universal Window Pinner / Opacity / Ghost Mode ----------
  let lastTargetWindow = null;
  handle('extras:win-list', async () => {
    if (process.platform !== 'win32') return { ok: true, unsupported: true, windows: [] };
    return execPsJson(WIN_TOOLS_PS, ['-Action', 'list', '-SkipPid', String(process.pid)]);
  });
  handle('extras:win-pin', async payload => {
    if (process.platform !== 'win32') return { ok: false, unsupported: true };
    const hwnd = String(payload?.hwnd || lastTargetWindow?.hwnd || '').trim();
    if (!/^\d+$/.test(hwnd) || hwnd === '0') throw new Error(i18n.t('common.notFound'));
    const mode = String(payload?.mode || 'pin'); // pin | opacity | ghost | status | snap
    if (!['pin', 'opacity', 'ghost', 'status', 'snap'].includes(mode)) throw new Error(i18n.t('common.notFound'));
    const val = mode === 'opacity'
      ? String(Math.max(25, Math.min(100, Math.round(Number(payload?.value) || 85))))
      : mode === 'snap'
        ? String(payload?.value || 'left').replace(/[^a-z0-9]/gi, '').slice(0, 12)
        : (payload?.value ? '1' : '0');
    const res = await execPsJson(WIN_TOOLS_PS, ['-Action', mode, '-Hwnd', hwnd, '-Value', val]);
    if (res?.window) send('extras:window-state', res.window);
    return res;
  });

  async function togglePinActiveWindow() {
    if (process.platform !== 'win32' || !lastTargetWindow?.hwnd) {
      send('extras:toast', { text: i18n.t('studio.noTargetWindow') });
      return { ok: false };
    }
    const cur = await execPsJson(WIN_TOOLS_PS, ['-Action', 'status', '-Hwnd', String(lastTargetWindow.hwnd)]).catch(() => null);
    const nextPin = cur?.window?.topmost ? '0' : '1';
    const res = await execPsJson(WIN_TOOLS_PS, ['-Action', 'pin', '-Hwnd', String(lastTargetWindow.hwnd), '-Value', nextPin]).catch(() => null);
    if (res?.window) {
      send('extras:window-state', res.window);
      send('extras:toast', { text: nextPin === '1' ? i18n.t('studio.pinnedToast', { title: res.window.process }) : i18n.t('studio.unpinnedToast', { title: res.window.process }) });
    }
    return res || { ok: false };
  }

  // ---------- 4. Media Converter & ZIP Bundle (Notch Drop Swiss Army Knife) ----------
  handle('extras:media-zip', async payload => {
    const paths = Array.isArray(payload?.paths) ? payload.paths.filter(p => typeof p === 'string' && path.isAbsolute(p)) : [];
    const res = await createZipFromPaths(paths);
    send('extras:toast', { text: i18n.t('studio.zipCreated', { name: path.basename(res.outPath) }) });
    return res;
  });
  handle('extras:media-convert', async payload => {
    const filePath = String(payload?.path || '');
    const mode = String(payload?.mode || 'compress');
    if (!filePath || !path.isAbsolute(filePath)) throw new Error(i18n.t('common.notFound'));
    if (mode === 'webp') {
      // Return clean bitmap data URL for Chromium canvas WebP export, or write pre-encoded dataUrl directly
      const img = nativeImage.createFromPath(filePath);
      if (img.isEmpty()) throw new Error(i18n.t('common.notFound'));
      const sz = img.getSize();
      const capped = sz.width > 2048 ? img.resize({ width: 2048, quality: 'best' }) : img;
      return { needsCanvasWebp: true, dataUrl: capped.toDataURL(), filePath, origBytes: fs.statSync(filePath).size };
    }
    const res = await convertImageFile(nativeImage, filePath, mode);
    send('extras:toast', { text: i18n.t('studio.convertedToast', { name: path.basename(res.outPath), pct: Math.max(0, res.savedPct) }) });
    return res;
  });
  handle('extras:media-write-webp', async payload => {
    const filePath = String(payload?.filePath || '');
    const dataUrl = String(payload?.dataUrl || '');
    const m = /^data:image\/webp;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!filePath || !path.isAbsolute(filePath) || !m) throw new Error(i18n.t('common.error'));
    const parsed = path.parse(filePath);
    let outPath = path.join(parsed.dir, `${parsed.name}-lumadock.webp`);
    let n = 1;
    while (fs.existsSync(outPath) && n < 200) outPath = path.join(parsed.dir, `${parsed.name}-lumadock-${n++}.webp`);
    const buf = Buffer.from(m[1], 'base64');
    fs.writeFileSync(outPath, buf);
    const origBytes = fs.existsSync(filePath) ? fs.statSync(filePath).size : buf.length;
    const savedPct = origBytes > 0 ? Math.round((1 - buf.length / origBytes) * 100) : 0;
    send('extras:toast', { text: i18n.t('studio.convertedToast', { name: path.basename(outPath), pct: Math.max(0, savedPct) }) });
    return { outPath, outBytes: buf.length, savedPct };
  });

  // ---------- 5. Context Engine, Caffeine, Presentation Shield, Workspaces, Standup ----------
  const ctxEngine = createContextEngine({
    readJson,
    writeJson,
    send,
    onDuckChange: (duck, isUndo) => applyDucking(duck, isUndo),
    onOpenPathOrUrl: async (kind, val) => {
      if (kind === 'url') await shell.openExternal(val);
      else await shell.openPath(val);
    }
  });
  app.lumadockContext = ctxEngine;

  handle('extras:context-get', async () => ctxEngine.getState());
  handle('extras:context-rules', async payload => ({ state: ctxEngine.getState(), rules: ctxEngine.setRules(payload || {}) }));
  handle('extras:context-undo', async () => ctxEngine.undoAutoAction());
  handle('extras:caffeine-set', async payload => ({ caffeine: ctxEngine.setCaffeine(Boolean(payload?.on), powerSaveBlocker), state: ctxEngine.getState() }));
  const setShieldState = on => {
    const next = Boolean(on);
    const shield = ctxEngine.setPresentationShield(next);
    if (process.platform === 'win32') {
      try { writeVolCmd?.(`mic-mute ${shield ? '1' : '0'}`); } catch {}
    }
    return { shield, state: ctxEngine.getState() };
  };
  handle('extras:shield-set', async payload => setShieldState(payload?.on));
  handle('extras:focus-sync', async payload => { ctxEngine.setFocusActive(Boolean(payload?.active), Number(payload?.addMinutes) || 0); return { state: ctxEngine.getState() }; });
  handle('extras:workspace-launch', async payload => ctxEngine.launchWorkspace(String(payload?.id || ''), powerSaveBlocker));
  handle('extras:workspace-save', async payload => ({ workspaces: ctxEngine.saveWorkspace(payload), state: ctxEngine.getState() }));
  handle('extras:workspace-delete', async payload => ({ workspaces: ctxEngine.deleteWorkspace(String(payload?.id || '')), state: ctxEngine.getState() }));
  handle('extras:standup-copy', async () => {
    const md = ctxEngine.formatStandupMarkdown(i18n.getLanguage());
    clipboard.writeText(md);
    send('extras:toast', { text: i18n.t('studio.standupCopied') });
    return { markdown: md };
  });

  // ---------- 6. Cross-AI Relay & Flight Timeline ----------
  handle('extras:ai-timeline', async () => {
    const view = app.lumadockMonitor?.view?.() || { providers: [], history: [] };
    return { providers: view.providers || [], history: view.history || [], standup: ctxEngine.getState().standup };
  });
  handle('extras:ai-relay-send', async payload => {
    const target = String(payload?.target || '').trim(); // claude | codex | gemini | cursor | claudecode | chatgpt | copy
    const promptText = String(payload?.text || '').trim().slice(0, 8000);
    if (!promptText) throw new Error(i18n.t('common.notFound'));
    const view = app.lumadockMonitor?.view?.() || { providers: [] };
    const p = (view.providers || []).find(x => x.provider === target || x.agent === target);
    if (p?.kind === 'hooks' && p.sessionId && app.lumadockMonitor?.handlers?.['ai-monitor:hooks-reply']) {
      await app.lumadockMonitor.handlers['ai-monitor:hooks-reply']({ sessionId: p.sessionId, text: promptText });
      send('extras:toast', { text: i18n.t('studio.relayedToast', { target: p.name || target }) });
      return { sent: true, mode: 'hook' };
    }
    clipboard.writeText(promptText);
    if (p && p.connected && app.lumadockMonitor?.handlers?.['ai-monitor:open-source']) {
      await app.lumadockMonitor.handlers['ai-monitor:open-source']({ provider: p.provider }).catch(() => {});
    }
    send('extras:toast', { text: i18n.t('studio.relayedCopyToast', { target: p?.name || target || 'AI' }) });
    return { sent: true, mode: 'clipboard' };
  });

  // ---------- 7. Snip & Pin Coordinator ----------
  const snip = setupSnipAndPin(electron, {
    handle,
    send,
    runOcrFromFile: devTools.runOcrFromFile,
    onAiQuestion: text => {
      send('extras:snip-ai', { text });
    }
  });

  // Hook helpers called from extras-main events
  function onClipboardText(text, ownerProc) {
    if (ctxEngine.getState().shield || !ctxEngine.getState().rules.autoActionStrip) return { skip: isSensitiveOwner(ownerProc) };
    const analysis = analyzeClipboardContent(text, ownerProc);
    if (analysis?.skip) return { skip: true };
    if (analysis) send('extras:action-strip', { kind: 'clip', analysis, rawText: text.slice(0, 12000), at: Date.now() });
    return { skip: false, analysis };
  }

  function onForegroundWindow(win) {
    lastTargetWindow = win;
    ctxEngine.onForegroundWindow(win);
    send('extras:window', win);
  }

  function onPrivacyChange(p) {
    ctxEngine.setPrivacyState(p);
  }

  return {
    onClipboardText,
    onForegroundWindow,
    onPrivacyChange,
    startSnip: snip.startSnip,
    startEyedropper: snip.startEyedropper,
    togglePinActiveWindow,
    toggleShield: () => {
      const cur = Boolean(ctxEngine.getState().shield);
      const res = setShieldState(!cur);
      send('extras:context', ctxEngine.getState());
      send('extras:toast', { text: res.shield ? i18n.t('studio.shieldOnToast') : i18n.t('studio.shieldOffToast') });
      return res;
    },
    closeAll: () => {
      snip.closeAll();
      try { ctxEngine.setCaffeine(false, powerSaveBlocker); } catch {}
    }
  };
}

module.exports = { setupStudio };
