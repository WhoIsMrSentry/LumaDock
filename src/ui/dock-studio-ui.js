'use strict';
// LumaDock Studio UI: 8s Hybrid Action Strip, Split Live Island Capsule, Per-App Audio Mixer,
// Window Pin/Opacity/Ghost & Snip Controller, Workspaces, Autopilot Rules, Cross-AI Relay & Build Watchdog.
(function dockStudioUi() {
  const api = window.lumadock;
  if (!api?.contextGet) return;

  const VIEWS = ['mixer', 'studio', 'relay'];
  const root = document.createElement('section');
  root.id = 'lumadock-studio';
  document.body.appendChild(root);

  const strip = document.createElement('div');
  strip.id = 'lumadock-strip';
  strip.style.display = 'none';
  document.body.appendChild(strip);

  const SVG_PATHS = {
    snip: '<rect x="3" y="3" width="10" height="8" rx="1.5"/><path d="M5 13h6M7 11v2m2-2v2"/>',
    pin: '<path d="M5 2h6l-1 4 2 2H4l2-2-1-4zm3 6v6"/>',
    caffeine: '<path d="M3 6h8v4a4 4 0 0 1-8 0V6zm8 1h1.5a1.5 1.5 0 0 1 0 3H11M5 2v2m3-2v2"/>',
    shield: '<path d="M8 2l5 2v4c0 3.2-2.2 5.2-5 6-2.8-.8-5-2.8-5-6V4l5-2z"/>',
    ghost: '<path d="M8 2a4.5 4.5 0 0 0-4.5 4.5V14l1.5-1.2L6.5 14 8 12.8 9.5 14 11 12.8 12.5 14V6.5A4.5 4.5 0 0 0 8 2z"/>',
    vol: '<path d="M3 6h3l3-3v10l-3-3H3V6zm8-1.5a4 4 0 0 1 0 7"/>',
    mute: '<path d="M3 6h3l3-3v10l-3-3H3V6zm8 1l3 3m0-3l-3 3"/>',
    ai: '<rect x="3" y="4" width="10" height="8" rx="2"/><circle cx="6.2" cy="8" r="0.9"/><circle cx="9.8" cy="8" r="0.9"/>',
    play: '<path d="M5 3.5l7 4.5-7 4.5V3.5z"/>',
    stop: '<rect x="4" y="4" width="8" height="8" rx="1"/>',
    copy: '<rect x="5" y="5" width="8" height="9" rx="1.5"/><path d="M10 3H4.5A1.5 1.5 0 0 0 3 4.5V11"/>',
    undo: '<path d="M5 5H2V2m0 3a5.5 5.5 0 1 1 1 6.5"/>',
    x: '<path d="M4 4l8 8m0-8l-8 8"/>'
  };
  const ico = name => SVG_PATHS[name]
    ? `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px">${SVG_PATHS[name]}</svg>`
    : '';

  const style = document.createElement('style');
  style.textContent = `
#lumadock-studio{position:absolute;z-index:60;display:none;color:#f4f7ef;font:12px/1.4 "Segoe UI Variable Text","Segoe UI",sans-serif;pointer-events:auto}
#lumadock-studio *{box-sizing:border-box}
#lumadock-studio .st-tabs{display:flex;gap:6px;margin-top:8px}
#lumadock-studio .st-btn,#lumadock-strip .st-pill{border:1px solid rgba(255,255,255,.11);border-radius:10px;background:#161b16;color:#dfe7da;padding:5px 10px;font:600 11px "Segoe UI",sans-serif;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;transition:background .12s,border-color .12s}
#lumadock-studio .st-btn:hover,#lumadock-strip .st-pill:hover{background:#232c22;border-color:rgba(198,233,148,.45);color:#fff}
#lumadock-studio .st-btn.on,#lumadock-studio .st-btn.pri,#lumadock-strip .st-pill.pri{background:#c6e994;color:#10180c;border-color:#c6e994}
#lumadock-studio .st-btn.bad{background:rgba(255,95,86,.15);border-color:rgba(255,95,86,.4);color:#ffb3ad}
#lumadock-studio .st-cols{display:grid;grid-template-columns:1fr 1fr;gap:10px;height:calc(100% - 62px)}
#lumadock-studio .st-card{background:#111511;border:1px solid rgba(255,255,255,.08);border-radius:15px;padding:10px 12px;display:flex;flex-direction:column;gap:7px;min-height:0;overflow:auto}
#lumadock-studio .st-card h4{margin:0;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:#8f998d;display:flex;align-items:center;justify-content:space-between}
#lumadock-studio .st-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border-radius:10px;background:rgba(255,255,255,.04)}
#lumadock-studio .st-row-col{display:flex;flex-direction:column;gap:5px;padding:7px 9px;border-radius:10px;background:rgba(255,255,255,.04)}
#lumadock-studio .st-row small,#lumadock-studio .st-row-col small{color:#8f998d;font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#lumadock-studio .st-slider{flex:1;min-width:80px;accent-color:#c6e994;height:4px;cursor:pointer}
#lumadock-studio select,#lumadock-studio input[type=text],#lumadock-studio textarea{border:1px solid rgba(255,255,255,.11);border-radius:9px;background:#0c0f0c;color:#fff;padding:5px 8px;font:11.5px "Segoe UI",sans-serif;outline:none;user-select:text}
#lumadock-studio textarea{width:100%;resize:none;min-height:54px}
#lumadock-studio .st-pills{display:flex;gap:5px;flex-wrap:wrap}
#lumadock-strip{position:fixed;z-index:85;display:none;align-items:center;gap:6px;padding:6px 10px;border-radius:14px;background:rgba(12,15,12,.94);border:1px solid rgba(198,233,148,.34);box-shadow:0 12px 30px rgba(0,0,0,.55);color:#f2f5ed;font:11.5px "Segoe UI Variable Text","Segoe UI",sans-serif;max-width:740px;pointer-events:auto}
#lumadock-strip .st-badge{padding:2px 7px;border-radius:7px;background:rgba(198,233,148,.16);color:#dff8ba;font:700 10px Consolas,monospace}
#lumadock-strip .st-msg{max-width:210px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#dbe4d6;font-weight:600}`;
  document.head.appendChild(style);

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const t = (k, p) => (window.__lumadockT ? window.__lumadockT(k, p) : k);

  let studioTab = 'actions'; // actions | windows | rules
  let relayTab = 'relay';    // relay | watchdog | standup
  let ctxState = { rules: {}, context: 'general', ducked: false, caffeine: false, shield: false, workspaces: [], standup: {} };
  let audioData = { devices: [], sessions: [], activeDeviceId: '', unsupported: false };
  let monitorsList = [];
  let recorder = null, recChunks = [], recStream = null, recStartedAt = 0;
  let winList = [];
  let pinCount = 0;
  let timeline = { providers: [], history: [], standup: {} };
  let watchdog = { jobs: [], pkgScripts: [], state: { running: false }, repoDir: '' };
  let relayText = '', relayTarget = 'claudecode';
  let newJobName = '', newJobCmd = '';
  let newWsName = '', newWsTarget = '';

  const refreshContext = () => api.contextGet?.().then(r => { if (r?.ok) ctxState = r; }).catch(() => {});
  const refreshAudio = (force = false) => Promise.all([
    api.audioSessions?.(force).then(r => { if (r?.ok) audioData = r; }),
    api.brightnessList?.().then(r => { if (r?.ok) monitorsList = r.monitors || []; })
  ]).catch(() => {});
  const refreshWindows = () => api.winList?.().then(r => { if (r?.ok) winList = r.windows || []; }).catch(() => {});
  const refreshTimeline = () => api.aiTimeline?.().then(r => { if (r?.ok) timeline = r; }).catch(() => {});
  const refreshWatchdog = () => api.watchdogList?.().then(r => { if (r?.ok) watchdog = r; }).catch(() => {});

  setTimeout(() => { refreshContext(); refreshWatchdog(); }, 1800);

  async function convertImageClientWebp(dataUrl, filePath) {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    const webpUrl = c.toDataURL('image/webp', 0.84);
    return api.mediaWriteWebp?.(filePath, webpUrl);
  }

  window.__lumadockConvertWebp = async filePath => {
    const r = await api.mediaConvert?.(filePath, 'webp');
    if (r?.needsCanvasWebp) return convertImageClientWebp(r.dataUrl, r.filePath);
    return r;
  };

  let stripTimer = null, stripState = null;
  function hideStrip() {
    clearTimeout(stripTimer);
    stripTimer = null;
    stripState = null;
    if (strip.style.display !== 'none') strip.style.display = 'none';
  }
  function showStrip(data, ms = 8000) {
    if (ctxState.shield) return;
    stripState = data;
    clearTimeout(stripTimer);
    renderStrip();
    stripTimer = setTimeout(hideStrip, ms);
  }
  function renderStrip() {
    if (!stripState || (typeof mode !== 'undefined' && mode === 'expanded' && !stripState.forceOnExpanded)) {
      strip.style.display = 'none';
      return;
    }
    const { badge, text, buttons = [] } = stripState;
    strip.innerHTML = `${badge ? `<span class="st-badge">${esc(badge)}</span>` : ''}<span class="st-msg">${esc(text)}</span>` +
      buttons.map((b, i) => `<button type="button" class="st-pill ${b.pri ? 'pri' : ''}" data-sidx="${i}">${esc(b.label)}</button>`).join('') +
      `<button type="button" class="st-pill" data-sclose="1">${ico('x')}</button>`;
    strip.style.display = 'flex';
    const w = strip.offsetWidth || 360;
    const cx = (typeof islandBounds !== 'undefined' ? islandBounds.x + islandBounds.width / 2 : innerWidth / 2);
    const topY = (typeof islandBounds !== 'undefined' ? islandBounds.height + 8 : 54);
    strip.style.left = Math.max(8, Math.min(innerWidth - w - 8, Math.round(cx - w / 2))) + 'px';
    strip.style.top = topY + 'px';
  }
  strip.addEventListener('mouseenter', () => { clearTimeout(stripTimer); });
  strip.addEventListener('mouseleave', () => { if (stripState) stripTimer = setTimeout(hideStrip, 4000); });
  strip.addEventListener('click', async e => {
    e.stopPropagation();
    if (e.target.closest('[data-sclose]')) { hideStrip(); return; }
    const btn = e.target.closest('[data-sidx]');
    if (!btn || !stripState) return;
    const act = stripState.buttons?.[Number(btn.dataset.sidx)];
    hideStrip();
    try { await act?.run?.(); } catch {}
  });

  window.__lumadockStripBounds = () => {
    if (strip.style.display === 'none') return null;
    const r = strip.getBoundingClientRect();
    return r.width > 0 ? { x: r.left, y: r.top, width: r.width, height: r.height } : null;
  };

  api.onContext?.(s => { if (s) { ctxState = s; if (VIEWS.includes(currentView)) render(); } });
  api.onToast?.(d => {
    if (d?.text) {
      window.__lumadockFlash?.(d.text, 2600);
      window.__lumadockBuddyBurst?.('happy', d.text, 5000);
    }
  });
  api.onPins?.(d => { pinCount = Number(d?.count) || 0; if (currentView === 'studio') render(); });
  api.onWatchdog?.(st => {
    if (!st) return;
    watchdog.state = st;
    if (st.running) {
      window.__lumadockBuddyBurst?.('focus', `Build: ${st.name}`, 5000, '#ffd166');
    } else {
      window.__lumadockBuddyBurst?.(st.ok ? 'happy' : 'sad', `${st.ok ? 'OK' : 'ERR'}: ${st.name}`, 5000, st.ok ? '#22e05a' : '#ff4d4d');
      showStrip({
        badge: st.ok ? 'BUILD OK' : 'BUILD ERR',
        text: `${st.name} · ${(st.durationMs / 1000).toFixed(1)}s`,
        buttons: [
          ...(!st.ok && st.errorTail ? [{ label: t('studio.askAi'), pri: true, run: () => { relayText = st.errorTail; setView('relay'); } }] : []),
          { label: t('studio.openRelay'), run: () => setView('relay') }
        ]
      }, 8000);
    }
    if (currentView === 'relay') render();
  });
  api.onFlowAlert?.(d => {
    window.__lumadockFeel?.('angry', 2600);
    window.__lumadockBuddyBurst?.('angry', t('studio.flowWarnTitle'), 5000, '#ff8a8a');
    window.__lumadockSay?.(t('studio.flowWarnTitle'), t('studio.flowWarnBody', { app: d?.title || d?.process || '' }));
    showStrip({
      badge: 'FLOW',
      text: t('studio.flowWarnBody', { app: d?.process || '' }),
      buttons: [{ label: t('focus.title'), pri: true, run: () => setView('focus') }]
    }, 8000);
  });
  api.onSnipAi?.(d => {
    if (!d?.text) return;
    relayText = d.text;
    setMode('expanded');
    setView('relay');
  });
  api.onActionStrip?.(ev => {
    if (ev?.kind !== 'clip' || !ev.analysis) return;
    const a = ev.analysis;
    window.__lumadockBuddyBurst?.('curious', `${a.badge} · ${a.preview}`, 5000, '#7fd8ff');
    const btns = [];
    for (const id of (a.actions || []).slice(0, 3)) {
      if (id === 'kill-port') btns.push({ label: t('studio.actInspectPort', { port: a.meta.port }), pri: true, run: () => setView('dev') });
      else if (id === 'copy-decoded') btns.push({ label: t('studio.actCopyDecoded'), pri: true, run: async () => { await api.copyText?.(a.meta.pretty || a.meta.decoded); window.__lumadockFlash?.(t('common.copiedCheck'), 1600); } });
      else if (id === 'copy-pretty') btns.push({ label: t('studio.actFormatJson'), pri: true, run: async () => { await api.copyText?.(a.meta.pretty); window.__lumadockFlash?.(t('common.copiedCheck'), 1600); } });
      else if (id === 'copy-compact') btns.push({ label: t('studio.actMinifyJson'), run: async () => { await api.copyText?.(a.meta.compact); window.__lumadockFlash?.(t('common.copiedCheck'), 1600); } });
      else if (id === 'copy-date') btns.push({ label: t('studio.actCopyDate'), pri: true, run: async () => { await api.copyText?.(a.meta.local || a.meta.iso); window.__lumadockFlash?.(t('common.copiedCheck'), 1600); } });
      else if (id === 'save-color') btns.push({ label: t('studio.actSaveColor'), pri: true, run: async () => { await api.colorsAdd?.(a.meta.hex, a.meta.rgb); window.__lumadockFlash?.(a.meta.hex, 1600); } });
      else if (id === 'copy-rgb') btns.push({ label: 'RGB', run: async () => { await api.copyText?.(a.meta.rgb); window.__lumadockFlash?.(t('common.copiedCheck'), 1400); } });
      else if (id === 'copy-clean') btns.push({ label: t('studio.actCopyClean'), pri: true, run: async () => { await api.copyText?.(a.meta.clean); window.__lumadockFlash?.(t('common.copiedCheck'), 1400); } });
      else if (id === 'open-url') btns.push({ label: t('common.open'), pri: true, run: () => api.openExternalUrl?.(a.meta.url) });
      else if (id === 'ask-ai') btns.push({ label: t('studio.askAi'), run: () => { relayText = ev.rawText || a.preview; setMode('expanded'); setView('relay'); } });
    }
    showStrip({ badge: a.badge, text: a.preview, buttons: btns }, 8000);
  });

  window.__lumadockOnNotchDrop = paths => {
    if (!Array.isArray(paths) || !paths.length) return;
    window.__lumadockBuddyBurst?.('surprised', `${paths.length} ${t('studio.dropReady')}`, 5000, '#c6e994');
    const isImg = /\.(?:png|jpe?g|webp|bmp)$/i.test(paths[0]);
    const buttons = [];
    if (isImg) {
      buttons.push({ label: 'WebP', pri: true, run: () => window.__lumadockConvertWebp?.(paths[0]) });
      buttons.push({ label: t('studio.actCompress'), run: () => api.mediaConvert?.(paths[0], 'compress') });
      buttons.push({ label: t('studio.actStripExif'), run: () => api.mediaConvert?.(paths[0], 'strip') });
    }
    buttons.push({ label: 'ZIP', pri: !isImg, run: () => api.mediaZip?.(paths) });
    buttons.push({ label: 'QR', run: async () => { await api.lanShareStart?.(paths); setMode('expanded'); setView('tray'); } });
    showStrip({
      badge: paths.length > 1 ? `${paths.length} FILES` : paths[0].split(/[\\/]/).pop().slice(0, 14),
      text: t('studio.dropReady'),
      forceOnExpanded: false,
      buttons
    }, 8000);
  };

  window.__lumadockSplitPill = () => {
    if (ctxState.shield) return { label: t('studio.shieldShort'), color: '#ff9a9e', view: 'studio' };
    if (watchdog.state?.running) return { label: `Build: ${watchdog.state.name.slice(0, 12)}`, color: '#ffd166', view: 'relay' };
    const focus = window.__lumadockFocus;
    const musicActive = Boolean(typeof spotifyConnected !== 'undefined' && spotifyConnected && spotifyState?.is_playing);
    if (musicActive && focus?.active?.()) return { label: `Focus ${focus.label()}`, color: '#ffb35c', view: 'focus' };
    if (ctxState.ducked) return { label: t('studio.duckShort'), color: '#7fd8ff', view: 'mixer' };
    if (ctxState.caffeine) return { label: 'Keep-Awake', color: '#c6e994', view: 'studio' };
    return null;
  };
  window.__lumadockContextState = () => ctxState;
  window.__lumadockStudioOpen = (v, sub) => {
    if (sub) {
      if (v === 'studio') studioTab = sub;
      if (v === 'relay') relayTab = sub;
    }
    setView(v);
    if (VIEWS.includes(v)) render();
  };

  function render() {
    const view = typeof currentView !== 'undefined' ? currentView : '';
    if (!VIEWS.includes(view)) return;
    const keepFocusId = document.activeElement?.id;
    const keepStart = document.activeElement?.selectionStart;

    if (view === 'mixer') {
      const devs = audioData.devices || [];
      const sess = audioData.sessions || [];
      root.innerHTML = `<div class="tc-page-head"><div><p class="tc-page-title">${esc(t('studio.mixerTitle'))}</p><p class="tc-page-sub">${esc(ctxState.ducked ? t('studio.duckActiveSub') : t('studio.mixerSub'))}</p></div>
        <div class="st-tabs"><button type="button" class="st-btn" data-act="refresh-audio">${esc(t('common.refresh'))}</button></div></div>
        <div class="st-cols">
          <div class="st-card">
            <h4>${esc(t('studio.appsAudioTitle'))} <span>${sess.length}</span></h4>
            ${audioData.unsupported ? `<small>${esc(t('studio.winOnlyFeature'))}</small>` : sess.length ? sess.map(s => `
              <div class="st-row">
                <div style="min-width:96px;max-width:118px;overflow:hidden"><b style="display:block;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.name || s.process)}</b><small>${s.volume}%</small></div>
                <input type="range" class="st-slider" min="0" max="100" value="${s.volume}" data-app-vol="${s.pid}">
                <button type="button" class="st-btn ${s.muted ? 'bad' : ''}" data-app-mute="${s.pid}" data-muted="${s.muted ? 1 : 0}">${ico(s.muted ? 'mute' : 'vol')}</button>
              </div>`).join('') : `<small>${esc(t('studio.noAudioApps'))}</small>`}
          </div>
          <div class="st-card">
            <h4>${esc(t('studio.outputDevicesTitle'))}</h4>
            ${devs.length ? `<div class="st-pills">${devs.map(d =>
              `<button type="button" class="st-btn ${d.active ? 'on' : ''}" style="width:100%;text-align:left" data-audio-dev="${esc(d.id)}">${esc(d.name)}</button>`).join('')}</div>` : `<small>${esc(t('studio.noDevices'))}</small>`}
            <h4 style="margin-top:6px">${esc(t('studio.brightnessTitle'))}</h4>
            ${monitorsList.length ? monitorsList.map(m => `<div class="st-row"><small style="max-width:95px">${esc(m.name || 'Display')}</small><input type="range" class="st-slider" min="0" max="100" value="${m.brightness}" data-bright-id="${esc(m.id)}"><small>${m.brightness}%</small></div>`).join('') : `<small>${esc(t('studio.brightnessEmpty'))}</small>`}
            <h4 style="margin-top:6px">${esc(t('studio.smartDuckTitle'))}</h4>
            <div class="st-row"><small>${esc(t('studio.smartDuckSub'))}</small><button type="button" class="st-btn ${ctxState.rules.meetingDuck ? 'on' : ''}" data-rule="meetingDuck">${ctxState.rules.meetingDuck ? t('common.on') : t('common.off')}</button></div>
            ${ctxState.undoAvailable ? `<button type="button" class="st-btn pri" data-act="undo-ctx">${ico('undo')}${esc(t('studio.undoAuto'))}</button>` : ''}
          </div>
        </div>`;
    } else if (view === 'studio') {
      const targetWin = ctxState.lastWindow;
      root.innerHTML = `<div class="tc-page-head"><div><p class="tc-page-title">${esc(t('studio.studioTitle'))}</p><p class="tc-page-sub">${esc(t('studio.studioSub'))}</p></div>
        <div class="st-tabs">
          <button type="button" class="st-btn ${studioTab === 'actions' ? 'on' : ''}" data-stab="actions">${esc(t('studio.tabActions'))}</button>
          <button type="button" class="st-btn ${studioTab === 'windows' ? 'on' : ''}" data-stab="windows">${esc(t('studio.tabWindows'))}</button>
          <button type="button" class="st-btn ${studioTab === 'rules' ? 'on' : ''}" data-stab="rules">${esc(t('studio.tabRules'))}</button>
        </div></div>` + (studioTab === 'actions' ? `
        <div class="st-cols">
          <div class="st-card">
            <h4>${esc(t('studio.screenAndPower'))}</h4>
            <div class="st-pills">
              <button type="button" class="st-btn pri" data-act="snip">${ico('snip')}${esc(t('studio.btnSnip'))} (Ctrl+Alt+S)</button>
              <button type="button" class="st-btn" data-act="ruler">${esc(t('studio.rulerBtn'))}</button>
              <button type="button" class="st-btn ${recorder ? 'bad' : ''}" data-act="rec">${recorder ? esc(t('studio.stopRecBtn')) : esc(t('studio.startRecBtn'))}</button>
              <button type="button" class="st-btn" data-act="pin-active">${ico('pin')}${esc(t('studio.btnPinActive'))} (Ctrl+Alt+P)</button>
              <button type="button" class="st-btn ${ctxState.caffeine ? 'on' : ''}" data-act="caffeine">${ico('caffeine')}Caffeine: ${ctxState.caffeine ? t('common.on') : t('common.off')}</button>
              <button type="button" class="st-btn ${ctxState.shield ? 'bad' : ''}" data-act="shield">${ico('shield')}${esc(t('studio.btnShield'))}: ${ctxState.shield ? t('common.on') : t('common.off')}</button>
              ${pinCount > 0 ? `<button type="button" class="st-btn bad" data-act="clear-pins">${ico('x')}${esc(t('studio.clearPins', { count: pinCount }))}</button>` : ''}
            </div>
            ${targetWin ? `<div class="st-row"><small>${esc(t('studio.lastWindow'))}: <b>${esc(targetWin.process)}</b> — ${esc(targetWin.title)}</small></div>` : ''}
          </div>
          <div class="st-card">
            <h4>${esc(t('studio.workspacesTitle'))}</h4>
            ${(ctxState.workspaces || []).map(w => `<div class="st-row"><div style="min-width:0;flex:1"><b>${esc(w.name)}</b></div>
              <div class="st-pills"><button type="button" class="st-btn pri" data-ws-go="${esc(w.id)}">${esc(t('studio.launch'))}</button><button type="button" class="st-btn" data-ws-del="${esc(w.id)}">${ico('x')}</button></div>
            </div>`).join('')}
            <div class="st-row" style="margin-top:auto">
              <input id="st-ws-name" type="text" placeholder="${esc(t('studio.cmdNamePh'))}" value="${esc(newWsName)}" style="width:82px">
              <input id="st-ws-target" type="text" placeholder="https://..." value="${esc(newWsTarget)}" style="flex:1">
              <button type="button" class="st-btn" data-act="ws-add">+</button>
            </div>
          </div>
        </div>` : studioTab === 'windows' ? `
        <div class="st-card" style="height:calc(100% - 62px)">
          <h4>${esc(t('studio.windowsListTitle'))} <button type="button" class="st-btn" data-act="refresh-wins">${esc(t('common.refresh'))}</button></h4>
          ${winList.length ? winList.map(w => `<div class="st-row">
            <div style="min-width:0;flex:1"><b style="display:block;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(w.process)} — ${esc(w.title)}</b><small>${w.topmost ? 'PIN · ' : ''}${w.ghost ? 'GHOST · ' : ''}${w.opacity}%</small></div>
            <div class="st-pills">
              <button type="button" class="st-btn ${w.topmost ? 'on' : ''}" data-win="${esc(w.hwnd)}" data-wmode="pin" data-wval="${w.topmost ? 0 : 1}">${ico('pin')}Pin</button>
              <button type="button" class="st-btn" data-win="${esc(w.hwnd)}" data-wmode="opacity" data-wval="${w.opacity < 90 ? 100 : 75}">${w.opacity}%</button>
              <button type="button" class="st-btn ${w.ghost ? 'on' : ''}" data-win="${esc(w.hwnd)}" data-wmode="ghost" data-wval="${w.ghost ? 0 : 1}">${ico('ghost')}Ghost</button>
              <button type="button" class="st-btn" data-snap="${esc(w.hwnd)}" data-spreset="left">L50</button>
              <button type="button" class="st-btn" data-snap="${esc(w.hwnd)}" data-spreset="right">R50</button>
              <button type="button" class="st-btn" data-snap="${esc(w.hwnd)}" data-spreset="left65">65/35</button>
              <button type="button" class="st-btn" data-snap="${esc(w.hwnd)}" data-spreset="max">Max</button>
            </div>
          </div>`).join('') : `<small>${esc(t('studio.noWindows'))}</small>`}
        </div>` : `
        <div class="st-card" style="height:calc(100% - 62px)">
          <h4>${esc(t('studio.rulesTitle'))}</h4>
          ${[['meetingDuck', t('studio.ruleMeetingDuck')], ['aiQuestionDuck', t('studio.ruleAiDuck')], ['ideMode', t('studio.ruleIdeMode')], ['flowGuard', t('studio.ruleFlowGuard')], ['autoActionStrip', t('studio.ruleAutoStrip')]].map(([rk, label]) =>
            `<div class="st-row"><span>${esc(label)}</span><button type="button" class="st-btn ${ctxState.rules[rk] ? 'on' : ''}" data-rule="${rk}">${ctxState.rules[rk] ? t('common.on') : t('common.off')}</button></div>`).join('')}
        </div>`);
    } else if (view === 'relay') {
      const wd = watchdog.state || {};
      const st = timeline.standup || ctxState.standup || {};
      root.innerHTML = `<div class="tc-page-head"><div><p class="tc-page-title">${esc(t('studio.relayTitle'))}</p><p class="tc-page-sub">${esc(t('studio.relaySub'))}</p></div>
        <div class="st-tabs">
          <button type="button" class="st-btn ${relayTab === 'relay' ? 'on' : ''}" data-rtab="relay">Cross-AI</button>
          <button type="button" class="st-btn ${relayTab === 'watchdog' ? 'on' : ''}" data-rtab="watchdog">Watchdog</button>
          <button type="button" class="st-btn ${relayTab === 'standup' ? 'on' : ''}" data-rtab="standup">${esc(t('studio.tabStandup'))}</button>
        </div></div>` + (relayTab === 'relay' ? `
        <div class="st-cols">
          <div class="st-card">
            <h4>${esc(t('studio.crossAiSendTitle'))}</h4>
            <textarea id="st-relay-txt" placeholder="${esc(t('studio.relayPlaceholder'))}">${esc(relayText)}</textarea>
            <div class="st-row"><select id="st-relay-target" style="flex:1">${[
              ['claudecode', 'Claude Code'], ['codex', 'Codex'], ['gemini', 'Gemini CLI'], ['cursor', 'Cursor'], ['claude', 'Claude'], ['chatgpt', 'ChatGPT'], ['copy', t('common.copy')]
            ].map(([id, nm]) => `<option value="${id}" ${relayTarget === id ? 'selected' : ''}>${esc(nm)}</option>`).join('')}</select>
            <button type="button" class="st-btn pri" data-act="relay-send">${esc(t('common.send'))}</button></div>
          </div>
          <div class="st-card">
            <h4>${esc(t('studio.flightRadarTitle'))}</h4>
            ${(timeline.history || []).slice(0, 4).map(h => `<div class="st-row-col"><b>${esc(h.agent)} · ${esc(h.project || '')}</b><small>${esc((h.files || []).join(', ') || h.prompt)}</small></div>`).join('') || `<small>${esc(t('studio.noAiHistory'))}</small>`}
          </div>
        </div>` : relayTab === 'watchdog' ? `
        <div class="st-cols">
          <div class="st-card">
            <h4>${esc(t('studio.savedScriptsTitle'))}</h4>
            ${[...(watchdog.jobs || []), ...(watchdog.pkgScripts || [])].slice(0, 6).map(j => `<div class="st-row">
              <div style="min-width:0;flex:1"><b style="font-size:11.5px">${esc(j.name)}</b><small style="display:block">${esc(j.cmd)}</small></div>
              <div class="st-pills">
                <button type="button" class="st-btn pri" data-wcmd="${esc(j.cmd)}" data-wname="${esc(j.name)}" data-wid="${esc(j.id)}">${ico('play')}</button>
                ${!j.auto ? `<button type="button" class="st-btn" data-wdel="${esc(j.id)}">${ico('x')}</button>` : ''}
              </div>
            </div>`).join('')}
          </div>
          <div class="st-card">
            <h4>${esc(t('studio.liveOutputTitle'))} ${wd.running ? `<button type="button" class="st-btn bad" data-act="wd-stop">${ico('stop')}${esc(t('status.stopped'))}</button>` : ''}</h4>
            <div class="st-row-col"><b>${esc(wd.name || t('studio.idleScript'))}</b><small>${esc(wd.lastLine || '—')}</small></div>
            ${wd.errorTail ? `<button type="button" class="st-btn pri" data-act="wd-to-ai">${ico('ai')}${esc(t('studio.sendErrToAi'))}</button>` : ''}
            <div class="st-row" style="margin-top:auto"><input id="st-job-name" type="text" placeholder="${esc(t('studio.cmdNamePh'))}" value="${esc(newJobName)}" style="width:92px"><input id="st-job-cmd" type="text" placeholder="npm run ..." value="${esc(newJobCmd)}" style="flex:1"><button type="button" class="st-btn" data-act="wd-add">+</button></div>
          </div>
        </div>` : `
        <div class="st-card" style="height:calc(100% - 62px)">
          <h4>${esc(t('studio.standupTitle'))} (${esc(st.date || '')}) <button type="button" class="st-btn pri" data-act="standup-copy">${ico('copy')}Markdown</button></h4>
          <div class="st-row"><span>${esc(t('studio.focusLabel'))}</span><b>${st.focusMins || 0} min · ${st.flowInterrupts || 0}</b></div>
          <div class="st-row"><span>${esc(t('studio.aiBuildsLabel'))}</span><b>${st.aiTurns || 0} · ${st.buildsOk || 0} OK / ${st.buildsFail || 0} ERR</b></div>
          <div class="st-row-col"><b>${esc(t('studio.filesEditedLabel'))}</b><small>${esc((st.filesEdited || []).join(', ') || t('common.none'))}</small></div>
        </div>`);
    }

    if (keepFocusId) {
      const el = root.querySelector('#' + keepFocusId);
      if (el) { el.focus(); try { el.setSelectionRange(keepStart, keepStart); } catch {} }
    }
  }

  root.addEventListener('input', e => {
    if (e.target.id === 'st-relay-txt') relayText = e.target.value;
    if (e.target.id === 'st-job-name') newJobName = e.target.value;
    if (e.target.id === 'st-job-cmd') newJobCmd = e.target.value;
    if (e.target.id === 'st-ws-name') newWsName = e.target.value;
    if (e.target.id === 'st-ws-target') newWsTarget = e.target.value;
    if (e.target.dataset.appVol) api.audioSetApp?.(Number(e.target.dataset.appVol), Number(e.target.value)).catch(() => {});
    if (e.target.dataset.brightId) api.brightnessSet?.(e.target.dataset.brightId, Number(e.target.value)).catch(() => {});
  });
  root.addEventListener('change', async e => {
    if (e.target.id === 'st-relay-target') relayTarget = e.target.value;
    if (e.target.dataset.appVol) { await api.audioSetApp?.(Number(e.target.dataset.appVol), Number(e.target.value)).catch(() => {}); refreshAudio(true).then(render); }
    if (e.target.dataset.brightId) { await api.brightnessSet?.(e.target.dataset.brightId, Number(e.target.value)).catch(() => {}); refreshAudio(false).then(render); }
  });
  root.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.snap) { await api.winPin?.(b.dataset.snap, 'snap', b.dataset.spreset); await refreshWindows(); render(); return; }
    if (b.dataset.stab) { studioTab = b.dataset.stab; if (studioTab === 'windows') await refreshWindows(); render(); return; }
    if (b.dataset.rtab) { relayTab = b.dataset.rtab; if (relayTab === 'watchdog') await refreshWatchdog(); if (relayTab === 'standup') await refreshContext(); render(); return; }
    if (b.dataset.rule) { const next = !ctxState.rules[b.dataset.rule]; const r = await api.contextRules?.({ [b.dataset.rule]: next }); if (r?.state) ctxState = r.state; render(); return; }
    if (b.dataset.appMute) { const res = await api.audioMuteApp?.(Number(b.dataset.appMute), b.dataset.muted !== '1'); if (res?.ok) audioData = res; render(); return; }
    if (b.dataset.audioDev) { const res = await api.audioSetDevice?.(b.dataset.audioDev); if (res?.ok) audioData = res; render(); return; }
    if (b.dataset.win) { await api.winPin?.(b.dataset.win, b.dataset.wmode, Number(b.dataset.wval)); await refreshWindows(); render(); return; }
    if (b.dataset.wsGo) { await api.workspaceLaunch?.(b.dataset.wsGo); return; }
    if (b.dataset.wsDel) { const r = await api.workspaceDelete?.(b.dataset.wsDel); if (r?.state) ctxState = r.state; render(); return; }
    if (b.dataset.wcmd) { await api.watchdogRun?.(b.dataset.wcmd, b.dataset.wname, b.dataset.wid); relayTab = 'watchdog'; render(); return; }
    if (b.dataset.wdel) { await api.watchdogDelete?.(b.dataset.wdel); await refreshWatchdog(); render(); return; }

    const act = b.dataset.act;
    if (act === 'refresh-audio') { await refreshAudio(true); render(); }
    else if (act === 'refresh-wins') { await refreshWindows(); render(); }
    else if (act === 'undo-ctx') { await api.contextUndo?.(); await refreshContext(); render(); }
    else if (act === 'snip') { setMode('rest'); setTimeout(() => api.snipStart?.(), 90); }
    else if (act === 'ruler') { await api.eyedropperStart?.('ruler'); }
    else if (act === 'rec') {
      if (recorder) {
        try { recorder.stop(); } catch {}
        return;
      }
      const src = await api.screenSourceGet?.();
      if (!src?.ok || !src.sourceId) return;
      try {
        recStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: src.sourceId } } });
        recChunks = [];
        recStartedAt = Date.now();
        recorder = new MediaRecorder(recStream, { mimeType: 'video/webm;codecs=vp9' });
        recorder.ondataavailable = ev => { if (ev.data?.size) recChunks.push(ev.data); };
        recorder.onstop = async () => {
          recStream?.getTracks().forEach(tr => tr.stop());
          const blob = new Blob(recChunks, { type: 'video/webm' });
          recorder = null; recStream = null; recChunks = [];
          const buf = await blob.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let bin = '';
          for (let i = 0; i < bytes.length; i += 0x8000) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
          }
          const b64 = btoa(bin);
          const saved = await api.recordingSave?.(b64);
          if (saved?.ok) window.__lumadockBuddyBurst?.('done', t('studio.recSavedToast'), 5000, '#22e05a');
          render();
        };
        recorder.start(500);
        window.__lumadockBuddyBurst?.('focus', 'REC', 3000, '#ff3b3b');
        render();
      } catch {
        recorder = null; recStream?.getTracks().forEach(tr => tr.stop()); recStream = null;
      }
    }
    else if (act === 'pin-active') { await api.winPin?.('', 'pin', 1); }
    else if (act === 'caffeine') { await api.caffeineSet?.(!ctxState.caffeine); await refreshContext(); render(); }
    else if (act === 'shield') { await api.shieldSet?.(!ctxState.shield); await refreshContext(); render(); }
    else if (act === 'clear-pins') { await api.pinsClear?.(); pinCount = 0; render(); }
    else if (act === 'ws-add' && newWsName.trim()) {
      const target = newWsTarget.trim();
      const ws = { name: newWsName.trim(), icon: 'WS', urls: /^https?:\/\//i.test(target) ? [target] : [], apps: target && !/^https?:\/\//i.test(target) ? [target] : [] };
      const r = await api.workspaceSave?.(ws);
      newWsName = ''; newWsTarget = '';
      if (r?.state) ctxState = r.state;
      render();
    } else if (act === 'relay-send' && relayText.trim()) { await api.aiRelaySend?.(relayTarget, relayText.trim()); }
    else if (act === 'wd-stop') { await api.watchdogStop?.(); }
    else if (act === 'wd-to-ai' && watchdog.state?.errorTail) { relayText = watchdog.state.errorTail; relayTab = 'relay'; render(); }
    else if (act === 'wd-add' && newJobName.trim() && newJobCmd.trim()) {
      await api.watchdogSave?.({ name: newJobName.trim(), cmd: newJobCmd.trim() });
      newJobName = ''; newJobCmd = ''; await refreshWatchdog(); render();
    } else if (act === 'standup-copy') { await api.standupCopy?.(); }
  });

  root.addEventListener('focusin', () => { projectInputFocused = true; sendInteractive(true); });
  root.addEventListener('focusout', () => { setTimeout(() => { if (!root.contains(document.activeElement)) projectInputFocused = false; }, 0); });
  window.__lumadockI18n?.onChange?.(() => render());

  const baseExpanded = drawExpanded;
  drawExpanded = function (alpha) {
    if (typeof currentView !== 'undefined' && VIEWS.includes(currentView)) { drawHeader(alpha); return; }
    return baseExpanded(alpha);
  };

  let shown = '';
  (function position() {
    const view = typeof currentView !== 'undefined' ? currentView : '';
    const show = VIEWS.includes(view) && typeof mode !== 'undefined' && mode === 'expanded' && visual.width > 600 && visual.height > 245;
    const disp = show ? 'block' : 'none';
    if (root.style.display !== disp) root.style.display = disp;
    if (show) {
      window.__lumadockPage.place(root, contentRect());
      if (shown !== view) {
        shown = view;
        if (view === 'mixer') refreshAudio(true).then(render);
        else if (view === 'studio') Promise.all([refreshContext(), refreshWindows()]).then(render);
        else if (view === 'relay') Promise.all([refreshTimeline(), refreshWatchdog()]).then(render);
        else render();
      }
    } else shown = '';
    if (stripState) renderStrip();
    requestAnimationFrame(position);
  })();
})();
