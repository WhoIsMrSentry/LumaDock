'use strict';
// Command Palette & Launcher (Ctrl+Alt+Space), Ports/Docker/File Locksmith,
// Dedicated Translator, Weather + World Clocks, System/Network + Top Procs + Ping/Speedtest, and Market FX Converter.
(function commandAndHubPages() {
  const api = window.lumadock;
  if (!api?.telemetryGet) return;

  const VIEWS = ['command', 'ports', 'dev', 'translate', 'weather', 'net', 'market'];
  const root = document.createElement('section');
  root.id = 'lumadock-hub';
  document.body.appendChild(root);

  const style = document.createElement('style');
  style.textContent = `
#lumadock-hub{position:absolute;z-index:60;display:none;color:#f4f7ef;font:12px/1.4 "Segoe UI Variable Text","Segoe UI",sans-serif;pointer-events:auto}
#lumadock-hub *{box-sizing:border-box}
#lumadock-hub .hb-tabs{display:flex;gap:5px;margin-top:8px;flex-wrap:wrap}
#lumadock-hub .hb-btn{border:1px solid rgba(255,255,255,.1);border-radius:10px;background:#171c17;color:#dfe7da;padding:5px 10px;font:600 11px "Segoe UI",sans-serif;cursor:pointer;white-space:nowrap}
#lumadock-hub .hb-btn:hover{background:#232b22;color:#fff}
#lumadock-hub .hb-btn.on,#lumadock-hub .hb-btn.pri{background:#c6e994;color:#11180d;border-color:#c6e994}
#lumadock-hub .hb-btn.bad{background:rgba(255,95,86,.14);border-color:rgba(255,95,86,.35);color:#ffaba3}
#lumadock-hub .hb-search-wrap{display:flex;align-items:center;gap:8px;padding:0 12px;height:36px;border-radius:13px;background:#101410;border:1px solid rgba(255,255,255,.12);margin-bottom:8px}
#lumadock-hub .hb-search-wrap:focus-within{border-color:rgba(198,233,148,.5)}
#lumadock-hub .hb-search-wrap input{flex:1;min-width:0;border:0;background:transparent;color:#fff;font:500 13px "Segoe UI",sans-serif;outline:none;user-select:text}
#lumadock-hub .hb-answer{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 12px;border-radius:12px;background:rgba(198,233,148,.11);border:1px solid rgba(198,233,148,.38);margin-bottom:7px}
#lumadock-hub .hb-answer b{font-size:13.5px;color:#dff8ba;user-select:text;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#lumadock-hub .hb-swatches{display:flex;align-items:center;gap:6px;margin-bottom:7px;flex-wrap:wrap}
#lumadock-hub .hb-swatch{display:inline-flex;align-items:center;gap:5px;padding:3px 8px 3px 5px;border-radius:999px;border:1px solid rgba(255,255,255,.1);background:#141814;font:600 10.5px Consolas,monospace;color:#dbe4d6;cursor:pointer}
#lumadock-hub .hb-swatch i{width:12px;height:12px;border-radius:50%;display:block;border:1px solid rgba(255,255,255,.25)}
#lumadock-hub .hb-cmds{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;max-height:112px;overflow:auto}
#lumadock-hub .hb-cmd{display:flex;align-items:center;gap:7px;padding:6px 9px;border-radius:11px;border:1px solid rgba(255,255,255,.07);background:#121512;color:#e8ece6;cursor:pointer;text-align:left;min-width:0}
#lumadock-hub .hb-cmd:hover,#lumadock-hub .hb-cmd.sel{border-color:rgba(198,233,148,.5);background:#181e17}
#lumadock-hub .hb-cmd em{font-style:normal;font:700 9.5px Consolas,monospace;padding:2px 5px;border-radius:6px;background:rgba(198,233,148,.13);color:#c6e994;flex:none}
#lumadock-hub .hb-cmd span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600;font-size:11.5px}
#lumadock-hub .hb-cmd small{color:#7f8a7a;font-size:9.5px;max-width:68px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#lumadock-hub .hb-cols{display:grid;grid-template-columns:1fr 1fr;gap:10px;height:calc(100% - 62px)}
#lumadock-hub .hb-card{background:#121612;border:1px solid rgba(255,255,255,.08);border-radius:15px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;min-height:0;overflow:auto}
#lumadock-hub .hb-card h4{margin:0;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:#8f998d;display:flex;align-items:center;justify-content:space-between;gap:8px}
#lumadock-hub .hb-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 8px;border-radius:10px;background:rgba(255,255,255,.04)}
#lumadock-hub .hb-row b{font-size:11.5px;color:#f2f5ef}
#lumadock-hub .hb-row small{color:#8f998d;font-size:10.5px}
#lumadock-hub .hb-in,#lumadock-hub select,#lumadock-hub textarea{border:1px solid rgba(255,255,255,.11);border-radius:9px;background:#0b0e0b;color:#fff;padding:5px 8px;font:11.5px "Segoe UI",sans-serif;outline:none;user-select:text}
#lumadock-hub .hb-grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
#lumadock-hub .hb-kpi{background:#121612;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:9px 11px;display:flex;flex-direction:column;gap:2px}
#lumadock-hub .hb-kpi b{font-size:17px;color:#fff}
#lumadock-hub .hb-kpi small{color:#8f998d;font-size:10px}
#lumadock-hub .hb-fx-bar{display:flex;align-items:center;gap:6px;padding:8px 10px;border-radius:13px;background:#121612;border:1px solid rgba(255,255,255,.09);margin-bottom:8px;flex-wrap:wrap}
#lumadock-hub .hb-fx-res{margin-left:auto;font:700 14px "Segoe UI",sans-serif;color:#c6e994;user-select:text}
#lumadock-hub pre{margin:0;padding:7px 9px;border-radius:10px;background:#0a0d0a;color:#c8d4c0;font:10.5px/1.35 Consolas,monospace;max-height:110px;overflow:auto;user-select:text;white-space:pre-wrap;word-break:break-word}`;
  document.head.appendChild(style);

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const t = (k, p) => (window.__lumadockT ? window.__lumadockT(k, p) : k);
  const loc = () => (window.__lumadockLocale ? window.__lumadockLocale() : 'en-US');

  let telemetry = { rxBps: 0, txBps: 0, diskPct: 0, diskUsedGb: 0, diskTotalGb: 0, diskFreeGb: 0, gpuPct: null, rxHistory: [] };
  let ports = [];
  let git = null;
  let market = { rates: { USD: 1 }, items: [] };
  let colors = [];
  let topProcs = [];
  let pingInfo = null;
  let speedInfo = null;
  let speedBusy = false;
  let dockerList = [];
  let dockerLogText = '';
  let fileLockPath = '';
  let fileLocks = [];
  let launcherItems = [];

  let netTab = 'summary';     // summary | network | hud
  let portsTab = 'ports';     // ports | docker | locks
  let wxTab = 'weather';      // weather | clocks
  let clockOffsetHours = 0;
  let cityQuickIn = '';
  let fxAmount = '100', fxFrom = 'USD', fxTo = 'TRY';
  let trSrc = '', trDst = '', trTarget = 'tr', trBusy = false;

  const WORLD_ZONES = [
    { city: 'Istanbul', tz: 'Europe/Istanbul' },
    { city: 'London', tz: 'Europe/London' },
    { city: 'New York', tz: 'America/New_York' },
    { city: 'Tokyo', tz: 'Asia/Tokyo' },
    { city: 'Berlin', tz: 'Europe/Berlin' },
    { city: 'San Francisco', tz: 'America/Los_Angeles' }
  ];

  window.__lumadockTelemetry = () => telemetry;
  window.__lumadockPorts = () => ports;
  window.__lumadockGit = () => git;
  window.__lumadockMarket = () => market;
  window.__lumadockColors = () => colors;

  const refreshTelemetry = () => api.telemetryGet?.().then(r => { if (r?.ok) telemetry = r; }).catch(() => {});
  const refreshPorts = () => api.portsGet?.().then(r => { if (r?.ok) ports = r.ports || []; }).catch(() => {});
  const refreshGit = () => api.gitStatus?.().then(r => { if (r?.ok) git = r.git || null; }).catch(() => {});
  const refreshMarket = (force = false) => api.marketGet?.(force).then(r => { if (r?.ok) market = r; }).catch(() => {});
  const refreshColors = () => api.colorsGet?.().then(r => { if (r?.ok) colors = r.colors || []; }).catch(() => {});
  const refreshProcs = () => api.topProcs?.().then(r => { if (r?.ok) topProcs = r.procs || []; }).catch(() => {});
  const refreshDocker = () => api.dockerList?.().then(r => { if (r?.ok) dockerList = r.containers || []; }).catch(() => {});
  const refreshLauncher = () => api.launcherIndex?.().then(r => { if (r?.ok) launcherItems = r.items || []; }).catch(() => {});

  api.onMarketUpdate?.(r => { if (r?.items) { market = r; if (currentView === 'market') render(); } });
  window.addEventListener('lumadock:stats', () => { if (currentView === 'net' && mode === 'expanded') render(); });

  setTimeout(() => { refreshColors(); refreshMarket(false); refreshLauncher(); }, 1400);

  let lastProcsAt = 0;
  setInterval(() => {
    const view = typeof currentView !== 'undefined' ? currentView : '';
    const m = typeof mode !== 'undefined' ? mode : 'rest';
    const wList = window.__lumadockActiveWidgetIds?.() || [];
    if (m !== 'expanded') return;
    if (view === 'net' || (view === 'home' && wList.includes('net'))) {
      refreshTelemetry().then(() => { if (view === 'net') render(); });
      if (view === 'net' && netTab === 'summary' && Date.now() - lastProcsAt > 3000) {
        lastProcsAt = Date.now();
        refreshProcs().then(render);
      }
    }
    if ((view === 'ports' || view === 'dev') && portsTab === 'ports') refreshPorts().then(render);
    if (view === 'command' || (view === 'home' && wList.includes('command'))) refreshColors();
    if (view === 'market' || (view === 'home' && wList.includes('market'))) refreshMarket(false);
  }, 1500);
  setInterval(() => refreshMarket(false), 2 * 60000);

  let cmdQuery = '', evalResult = null, trOut = '', cmdTimer = null;

  const COMMANDS = () => [
    { id: 'github', icon: 'GH', name: t('appsDir.githubName'), sub: 'Streak / PR', run: () => setView('github') },
    { id: 'vault', icon: '2F', name: t('appsDir.vaultName'), sub: '2FA / Secrets', run: () => setView('vault') },
    { id: 'devtools', icon: 'DV', name: t('appsDir.devtoolsName'), sub: 'API / Hook', run: () => setView('devtools') },
    { id: 'ports', icon: 'PT', name: t('appsDir.portsName'), sub: 'Ports / Docker', run: () => setView('ports') },
    { id: 'translate', icon: 'TR', name: t('appsDir.translateName'), sub: 'EN / TR', run: () => setView('translate') },
    { id: 'net', icon: 'NT', name: t('appsDir.sysNetName'), sub: 'CPU / Ping', run: () => setView('net') },
    { id: 'market', icon: 'MK', name: t('appsDir.marketName'), sub: 'FX / Gold', run: () => setView('market') },
    { id: 'weather', icon: 'WX', name: t('appsDir.weatherName'), sub: 'Forecast / TZ', run: () => setView('weather') },
    { id: 'spotify', icon: 'SP', name: 'Spotify / Medya', sub: t('command.openView'), run: () => setView('spotify') },
    { id: 'focus', icon: 'FC', name: t('focus.title'), sub: 'Timer / 20-20', run: () => setView('focus') },
    { id: 'clips', icon: 'CB', name: t('appsDir.clipsName'), sub: 'QR / OCR', run: () => setView('clips') },
    { id: 'tray', icon: 'TY', name: t('appsDir.trayName'), sub: t('command.openView'), run: () => setView('tray') },
    { id: 'mixer', icon: 'MX', name: t('appsDir.mixerName'), sub: t('studio.mixerShort'), run: () => setView('mixer') },
    { id: 'studio', icon: 'ST', name: t('appsDir.studioName'), sub: 'Snip / Rec', run: () => setView('studio') },
    { id: 'snip', icon: 'SN', name: t('studio.btnSnip'), sub: 'Ctrl+Alt+S', run: () => { setMode('rest'); setTimeout(() => api.snipStart?.(), 90); } },
    { id: 'picker', icon: 'HX', name: t('appsDir.pickerName'), sub: t('home.pickColor'), run: () => (api.eyedropperStart ? api.eyedropperStart('picker') : api.buddyPickColor?.())?.then(() => refreshColors()) },
    { id: 'ruler', icon: 'RL', name: t('studio.rulerBtn'), sub: 'px / diag', run: () => api.eyedropperStart?.('ruler') }
  ];

  const fmtSpeed = bps => bps >= 1048576 ? `${(bps / 1048576).toFixed(1)} MB/s` : bps >= 1024 ? `${Math.round(bps / 1024)} KB/s` : `${bps || 0} B/s`;

  function runCommandEval(q) {
    clearTimeout(cmdTimer);
    const trimmed = q.trim();
    if (!trimmed) { evalResult = null; trOut = ''; render(); return; }
    if (/^tr\s+(.+)/i.test(trimmed)) {
      const phrase = trimmed.replace(/^tr\s+/i, '');
      evalResult = { kind: 'tr', value: trOut || '...', label: trOut || '...' };
      cmdTimer = setTimeout(async () => {
        const r = await api.translateText?.(phrase).catch(() => null);
        if (cmdQuery.trim() === trimmed && r?.ok && r.translated) {
          trOut = r.translated;
          evalResult = { kind: 'tr', value: r.translated, label: `${r.translated} (${r.to?.toUpperCase() || ''})` };
          render();
        }
      }, 220);
      render();
      return;
    }
    cmdTimer = setTimeout(async () => {
      const r = await api.commandEval?.(trimmed).catch(() => null);
      if (cmdQuery.trim() === trimmed) {
        evalResult = r?.ok ? r.result : null;
        render();
      }
    }, 60);
  }

  const wxSvg = d => `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;flex-shrink:0">${d}</svg>`;
  const ICONS_WX = (c, night = false) => wxSvg(
    c === 0 && night ? '<path d="M12.5 10.2A5.5 5.5 0 0 1 5.8 3.5a5.5 5.5 0 1 0 6.7 6.7z"/>'
      : c === 0 ? '<circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/>'
      : c <= 48 ? '<path d="M4.5 12h7.2a2.6 2.6 0 0 0 .3-5.2A3.8 3.8 0 0 0 4.6 6a2.8 2.8 0 0 0-.1 6z"/>'
      : c <= 67 || (c > 77 && c <= 82) ? '<path d="M4.5 10.5h7.2a2.5 2.5 0 0 0 .3-5A3.6 3.6 0 0 0 4.8 4.8a2.7 2.7 0 0 0-.3 5.7zM5.5 12.5l-.8 1.8M8.5 12.5l-.8 1.8M11.5 12.5l-.8 1.8"/>'
      : c <= 77 ? '<path d="M8 2v12M2.8 5l10.4 6M13.2 5L2.8 11"/>'
      : '<path d="M4.5 10.2h7.2a2.5 2.5 0 0 0 .3-5A3.6 3.6 0 0 0 4.8 4.6a2.7 2.7 0 0 0-.3 5.6zM8.5 10.2l-1.5 2.4h2.2l-1.4 2.4"/>'
  );
  const ICO_WIND = wxSvg('<path d="M2 6h8.5a1.5 1.5 0 1 0-1.5-1.5M2 9.5h10.5a1.5 1.5 0 1 1-1.5 1.5M2 13h5.5"/>');
  const ICO_DROP = wxSvg('<path d="M8 2.2S4 7 4 9.8a4 4 0 0 0 8 0C12 7 8 2.2 8 2.2z"/>');
  const ICO_CAL = wxSvg('<rect x="2.5" y="3.5" width="11" height="10" rx="2"/><path d="M2.5 7h11M5.5 2v2.5M10.5 2v2.5"/>');
  const ICO_DISK = wxSvg('<rect x="2.5" y="3" width="11" height="10" rx="2"/><path d="M2.5 9.5h11M10.5 11.2h.5"/>');

  const FX_CODES = ['USD', 'TRY', 'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'SAR', 'AED', 'RUB', 'CNY', 'GAU', 'XAU', 'BTC', 'ETH', 'SOL'];
  function convertFx(amt, from, to, rates) {
    const n = Number(amt);
    if (!Number.isFinite(n) || !rates) return null;
    const rf = from === 'USD' ? 1 : Number(rates[from]);
    const rt = to === 'USD' ? 1 : Number(rates[to]);
    if (!rf || !rt) return null;
    const out = n * (rt / rf);
    if (out >= 1000) return out.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (out >= 1) return out.toFixed(2);
    return out.toPrecision(4);
  }

  function render() {
    const rawView = typeof currentView !== 'undefined' ? currentView : '';
    const view = rawView === 'dev' ? 'ports' : rawView;
    if (!VIEWS.includes(rawView)) return;

    const keepFocusId = document.activeElement?.id;
    const keepStart = document.activeElement?.selectionStart;

    if (view === 'command') {
      const qLower = cmdQuery.trim().toLowerCase();
      const sysMatches = launcherItems.map(it => ({
        id: 'launch:' + it.id,
        icon: it.kind === 'ssh' ? 'SSH' : it.kind === 'project' ? 'DIR' : 'APP',
        name: it.name,
        sub: it.sub || it.kind,
        launch: { kind: it.kind, target: it.target }
      }));
      const pool = qLower ? [...COMMANDS(), ...sysMatches] : [...COMMANDS(), ...sysMatches.slice(0, 6)];
      const filtered = pool.filter(c => !qLower || c.name.toLowerCase().includes(qLower) || c.id.toLowerCase().includes(qLower) || (c.sub || '').toLowerCase().includes(qLower)).slice(0, 9);
      const ansHtml = evalResult ? `<div class="hb-answer"><b>= ${esc(evalResult.label)}</b><button type="button" class="hb-btn pri" data-copy-ans="1">${esc(t('common.copy'))}</button></div>` : '';
      const swatches = `<div class="hb-swatches">
        <button type="button" class="hb-btn" data-picker-go="1">${esc(t('appsDir.pickerName'))}</button>
        <button type="button" class="hb-btn" data-ruler-go="1">${esc(t('studio.rulerBtn'))}</button>
        ${colors.slice(0, 6).map(c => `<button type="button" class="hb-swatch" data-copy-hex="${esc(c.hex)}"><i style="background:${esc(c.hex)}"></i>${esc(c.hex)}</button>`).join('')}
      </div>`;
      root.innerHTML = `<div class="tc-page-head"><div><p class="tc-page-title">${esc(t('command.title'))}</p><p class="tc-page-sub">${esc(t('command.launcherSub'))}</p></div></div>
        <div class="hb-search-wrap"><span>&gt;_</span><input id="hb-cmd-in" type="text" placeholder="${esc(t('command.placeholder'))}" value="${esc(cmdQuery)}" maxlength="160"></div>
        ${ansHtml}${swatches}
        <div class="hb-cmds">${filtered.map((c, idx) => `<button type="button" class="hb-cmd ${idx === 0 && !evalResult ? 'sel' : ''}" data-cmd="${esc(c.id)}" ${c.launch ? `data-lkind="${esc(c.launch.kind)}" data-ltarget="${esc(c.launch.target)}"` : ''}><em>${esc(c.icon)}</em><span>${esc(c.name)}</span><small>${esc(c.sub || '')}</small></button>`).join('')}</div>`;
    } else if (view === 'ports') {
      const tabs = `<div class="hb-tabs">
        <button type="button" class="hb-btn ${portsTab === 'ports' ? 'on' : ''}" data-ptab="ports">${esc(t('devPage.portsTitle'))} (${ports.length})</button>
        <button type="button" class="hb-btn ${portsTab === 'docker' ? 'on' : ''}" data-ptab="docker">Docker (${dockerList.length})</button>
        <button type="button" class="hb-btn ${portsTab === 'locks' ? 'on' : ''}" data-ptab="locks">${esc(t('powerTools.locksTab'))}</button>
        <button type="button" class="hb-btn" data-refresh-ports="1">${esc(t('common.refresh'))}</button>
      </div>`;
      if (portsTab === 'ports') {
        const portsHtml = ports.length
          ? ports.map(p => `<div class="hb-row"><div><b>:${p.port}</b> <small>${esc(p.process)} (PID ${p.pid})</small></div><div style="display:flex;gap:5px"><button type="button" class="hb-btn" data-open-url="${esc(p.url)}">${esc(t('common.open'))}</button><button type="button" class="hb-btn bad" data-kill-pid="${p.pid}">Kill</button></div></div>`).join('')
          : `<p style="color:#8f998d;margin:4px 0">${esc(t('devPage.noPorts'))}</p>`;
        root.innerHTML = `<div class="tc-page-head"><div><p class="tc-page-title">${esc(t('appsDir.portsName'))}</p><p class="tc-page-sub">${esc(t('devPage.portsSub'))}</p></div>${tabs}</div>
          <div class="hb-card" style="height:calc(100% - 62px)">${portsHtml}</div>`;
      } else if (portsTab === 'docker') {
        const dHtml = dockerList.length
          ? dockerList.map(c => `<div class="hb-row"><div style="min-width:0;flex:1"><b>${esc(c.name)}</b> <small>${esc(c.image)} · ${esc(c.status)}</small></div>
            <div style="display:flex;gap:4px">
              ${c.running ? `<button type="button" class="hb-btn" data-dact="restart" data-did="${esc(c.id)}">${esc(t('common.restart'))}</button><button type="button" class="hb-btn bad" data-dact="stop" data-did="${esc(c.id)}">Stop</button>` : `<button type="button" class="hb-btn pri" data-dact="start" data-did="${esc(c.id)}">Start</button>`}
              <button type="button" class="hb-btn" data-dlogs="${esc(c.id)}">Logs</button>
            </div></div>`).join('')
          : `<p style="color:#8f998d;margin:4px 0">${esc(t('powerTools.dockerEmpty'))}</p>`;
        root.innerHTML = `<div class="tc-page-head"><div><p class="tc-page-title">Docker</p><p class="tc-page-sub">${esc(t('powerTools.dockerSub'))}</p></div>${tabs}</div>
          <div class="hb-cols"><div class="hb-card"><h4>Containers</h4>${dHtml}</div><div class="hb-card"><h4>Logs</h4><pre>${esc(dockerLogText || t('powerTools.dockerLogsHint'))}</pre></div></div>`;
      } else {
        const lHtml = fileLocks.length
          ? fileLocks.map(pr => `<div class="hb-row"><div><b>${esc(pr.name || 'Process')}</b> <small>PID ${pr.pid}</small></div><button type="button" class="hb-btn bad" data-lock-kill="${pr.pid}">Kill</button></div>`).join('')
          : `<p style="color:#8f998d;margin:4px 0">${esc(t('powerTools.locksEmpty'))}</p>`;
        root.innerHTML = `<div class="tc-page-head"><div><p class="tc-page-title">${esc(t('powerTools.locksTab'))}</p><p class="tc-page-sub">${esc(t('powerTools.locksSub'))}</p></div>${tabs}</div>
          <div class="hb-card" style="height:calc(100% - 62px)">
            <div style="display:flex;gap:6px"><input class="hb-in" id="hb-lock-path" style="flex:1" placeholder="C:\\path\\to\\locked-file" value="${esc(fileLockPath)}"><button type="button" class="hb-btn" data-lock-pick="1">${esc(t('powerTools.browse'))}</button><button type="button" class="hb-btn pri" data-lock-scan="1">${esc(t('powerTools.scan'))}</button></div>
            ${lHtml}
          </div>`;
      }
    } else if (view === 'translate') {
      root.innerHTML = `<div class="tc-page-head"><div><p class="tc-page-title">${esc(t('appsDir.translateName'))}</p><p class="tc-page-sub">${esc(t('devPage.translateOnlySub'))}</p></div>
        <div class="hb-tabs">${[['tr', 'TR'], ['en', 'EN'], ['de', 'DE'], ['fr', 'FR'], ['es', 'ES'], ['ja', 'JA']].map(([code, lbl]) =>
          `<button type="button" class="hb-btn ${trTarget === code ? 'on' : ''}" data-tr-lang="${code}">${lbl}</button>`).join('')}
        </div></div>
        <div class="hb-cols">
          <div class="hb-card">
            <h4>${esc(t('devPage.sourceLabel'))} <button type="button" class="hb-btn pri" data-do-tr2="1" ${trBusy ? 'disabled' : ''}>${trBusy ? '...' : esc(t('devPage.translateBtn'))}</button></h4>
            <textarea id="hb-tr2-in" style="flex:1;resize:none" placeholder="${esc(t('devPage.translatePh'))}">${esc(trSrc)}</textarea>
          </div>
          <div class="hb-card">
            <h4>${esc(t('devPage.resultLabel'))} (${esc(trTarget.toUpperCase())}) <button type="button" class="hb-btn" data-copy-tr2="1">${esc(t('common.copy'))}</button></h4>
            <div class="hb-tr-out" style="flex:1;white-space:pre-wrap;overflow:auto">${esc(trDst || t('devPage.translateHint'))}</div>
          </div>
        </div>`;
    } else if (view === 'weather') {
      const wx = window.__lumadockWeather?.(), ev = window.__lumadockCalendarRaw?.();
      const wTabs = `<div class="hb-tabs">
        <button type="button" class="hb-btn ${wxTab === 'weather' ? 'on' : ''}" data-wtab="weather">${esc(t('fun.fields.weather'))}</button>
        <button type="button" class="hb-btn ${wxTab === 'clocks' ? 'on' : ''}" data-wtab="clocks">${esc(t('weatherPage.worldClocksTab'))}</button>
        <button type="button" class="hb-btn" data-refresh-wx="1">${esc(t('common.refresh'))}</button>
      </div>`;
      if (wxTab === 'weather') {
        const wxHtml = wx
          ? `<div class="hb-row"><div><b style="font-size:20px">${ICONS_WX(wx.code, !wx.day)} ${wx.temp}°</b><small> · ${esc(wx.place)}</small></div><small>${esc(t('weatherPage.feelsLike', { temp: wx.feelsLike ?? wx.temp }))}${wx.wind != null ? ` · ${ICO_WIND} ${wx.wind} km/h` : ''}${wx.humidity != null ? ` · ${ICO_DROP} ${wx.humidity}%` : ''}</small></div>
             <div class="hb-grid3">${(wx.forecast || []).map(f => `<div class="hb-kpi"><small>${esc(new Date(f.date).toLocaleDateString(loc(), { weekday: 'short' }))}</small><b>${ICONS_WX(f.code)} ${f.max}° / ${f.min}°</b></div>`).join('')}</div>`
          : `<p style="color:#8f998d;margin:2px 0">${esc(t('weatherPage.noCity'))}</p>`;
        const evHtml = ev
          ? `<div class="hb-row"><div><b>${ICO_CAL} ${esc(ev.title || t('header.meetingDefault'))}</b><small>${esc(new Date(ev.start).toLocaleString(loc(), { weekday: 'short', hour: '2-digit', minute: '2-digit' }))}</small></div>${ev.url ? `<button type="button" class="hb-btn pri" data-join-url="${esc(ev.url)}">${esc(t('header.join'))}</button>` : ''}</div>`
          : `<p style="color:#8f998d">${esc(t('weatherPage.noEvent'))}</p>`;
        root.innerHTML = `<div class="tc-page-head"><div><p class="tc-page-title">${esc(t('weatherPage.title'))}</p><p class="tc-page-sub">${esc(t('weatherPage.sub'))}</p></div>${wTabs}</div>
          <div class="hb-cols">
            <div class="hb-card"><h4>${esc(t('fun.fields.weather'))}</h4>${wxHtml}
              <div style="display:flex;gap:6px;margin-top:auto"><input class="hb-in" id="hb-wx-city" style="flex:1" placeholder="${esc(t('fun.fields.cityPlaceholder'))}" value="${esc(cityQuickIn || wx?.place || '')}"><button type="button" class="hb-btn pri" data-save-city="1">${esc(t('common.save'))}</button></div>
            </div>
            <div class="hb-card"><h4>${esc(t('fun.fields.calendar'))}</h4>${evHtml}</div>
          </div>`;
      } else {
        const refDate = new Date(Date.now() + clockOffsetHours * 3600000);
        const cards = WORLD_ZONES.map(z => {
          const hm = refDate.toLocaleTimeString(loc(), { timeZone: z.tz, hour: '2-digit', minute: '2-digit' });
          const dy = refDate.toLocaleDateString(loc(), { timeZone: z.tz, weekday: 'short' });
          return `<div class="hb-kpi"><small>${esc(z.city)}</small><b>${esc(hm)}</b><small>${esc(dy)}</small></div>`;
        }).join('');
        root.innerHTML = `<div class="tc-page-head"><div><p class="tc-page-title">${esc(t('weatherPage.worldClocksTab'))}</p><p class="tc-page-sub">${esc(t('weatherPage.clocksSub'))}</p></div>${wTabs}</div>
          <div class="hb-fx-bar" style="margin-bottom:8px">
            <span style="font-size:11px;color:#9aa596">${esc(t('weatherPage.offsetLabel'))}: <b>${clockOffsetHours >= 0 ? '+' : ''}${clockOffsetHours}h</b></span>
            <input type="range" id="hb-tz-offset" min="-12" max="12" step="1" value="${clockOffsetHours}" style="flex:1;accent-color:#c6e994">
            <button type="button" class="hb-btn" data-tz-reset="1">${esc(t('common.reset'))}</button>
          </div>
          <div class="hb-grid3">${cards}</div>`;
      }
    } else if (view === 'net') {
      const st = window.__lumadockStats?.() || { cpuPct: 0, memPct: 0, memUsedGb: 0, memTotalGb: 0 };
      const miniHudOn = !!window.__lumadockPrefs?.()?.miniHud;
      const nTabs = `<div class="hb-tabs">
        <button type="button" class="hb-btn ${netTab === 'summary' ? 'on' : ''}" data-ntab="summary">${esc(t('netPage.tabSummary'))}</button>
        <button type="button" class="hb-btn ${netTab === 'network' ? 'on' : ''}" data-ntab="network">${esc(t('netPage.tabNetwork'))}</button>
        <button type="button" class="hb-btn ${netTab === 'hud' ? 'on' : ''}" data-ntab="hud">Mini HUD</button>
      </div>`;
      if (netTab === 'summary') {
        root.innerHTML = `<div class="tc-page-head"><div><p class="tc-page-title">${esc(t('appsDir.sysNetName'))}</p><p class="tc-page-sub">${esc(t('netPage.sub'))}</p></div>${nTabs}</div>
          <div class="hb-grid3" style="margin-bottom:8px">
            <div class="hb-kpi"><small>↓ ${esc(t('netPage.download'))} / ↑ ${esc(t('netPage.upload'))}</small><b>${esc(fmtSpeed(telemetry.rxBps))}</b><small>↑ ${esc(fmtSpeed(telemetry.txBps))}</small></div>
            <div class="hb-kpi"><small>CPU / GPU</small><b>${st.cpuPct}%${telemetry.gpuPct != null ? ` · ${telemetry.gpuPct}%` : ''}</b><small>RAM ${st.memPct}% (${st.memUsedGb}/${st.memTotalGb}G)</small></div>
            <div class="hb-kpi"><small>${ICO_DISK} ${esc(t('netPage.disk'))}</small><b>${telemetry.diskPct || 0}%</b><small>${telemetry.diskFreeGb || 0} GB free</small></div>
          </div>
          <div class="hb-card" style="height:calc(100% - 150px)">
            <h4>${esc(t('netPage.topProcsTitle'))} <button type="button" class="hb-btn" data-refresh-procs="1">${esc(t('common.refresh'))}</button></h4>
            ${topProcs.slice(0, 6).map(p => `<div class="hb-row"><b>${esc(p.name)} <small>PID ${p.pid}</small></b><div style="display:flex;align-items:center;gap:6px"><small>${p.memMb} MB</small><button type="button" class="hb-btn bad" data-kill-proc="${p.pid}">Kill</button></div></div>`).join('') || `<small style="color:#8f998d">${esc(t('common.loading'))}</small>`}
          </div>`;
      } else if (netTab === 'network') {
        root.innerHTML = `<div class="tc-page-head"><div><p class="tc-page-title">${esc(t('netPage.tabNetwork'))}</p><p class="tc-page-sub">Ping, IP & Speedtest</p></div>${nTabs}</div>
          <div class="hb-grid3" style="margin-bottom:8px">
            <div class="hb-kpi"><small>Cloudflare / Google</small><b>${pingInfo ? `${pingInfo.cloudflareMs ?? '--'}ms / ${pingInfo.googleMs ?? '--'}ms` : '--'}</b></div>
            <div class="hb-kpi"><small>Local / Public IP</small><b style="font-size:13px">${esc(pingInfo?.localIp || '--')}</b><small>${esc(pingInfo?.publicIp || '--')}</small></div>
            <div class="hb-kpi"><small>Download Speed</small><b>${speedInfo?.mbps != null ? `${speedInfo.mbps} Mbps` : '--'}</b><small>${speedInfo?.ms ? `${speedInfo.ms} ms` : ''}</small></div>
          </div>
          <div style="display:flex;gap:8px">
            <button type="button" class="hb-btn pri" data-do-ping="1">${esc(t('netPage.runPing'))}</button>
            <button type="button" class="hb-btn" data-do-speed="1" ${speedBusy ? 'disabled' : ''}>${speedBusy ? '...' : esc(t('netPage.runSpeed'))}</button>
          </div>`;
      } else {
        root.innerHTML = `<div class="tc-page-head"><div><p class="tc-page-title">Mini HUD</p><p class="tc-page-sub">${esc(t('fun.fields.miniHudSub'))}</p></div>${nTabs}</div>
          <div class="hb-card" style="height:calc(100% - 62px)">
            <div class="hb-row"><div><b>${esc(t('fun.fields.miniHud'))}</b><small>${esc(t('fun.fields.miniHudSub'))}</small></div>
              <button type="button" class="hb-btn ${miniHudOn ? 'pri' : ''}" data-toggle-hud="1">${miniHudOn ? esc(t('common.on')) : esc(t('common.off'))}</button>
            </div>
          </div>`;
      }
    } else if (view === 'market') {
      const converted = convertFx(fxAmount, fxFrom, fxTo, market.rates);
      const opts = (sel) => FX_CODES.filter(c => c === 'USD' || c === sel || market.rates?.[c]).map(c => `<option value="${c}" ${c === sel ? 'selected' : ''}>${c}</option>`).join('');
      root.innerHTML = `<div class="tc-page-head"><div><p class="tc-page-title">${esc(t('marketPage.title'))}</p><p class="tc-page-sub">${esc(t('marketPage.sub'))}</p></div><button type="button" class="hb-btn" data-refresh-mkt="1" style="margin-top:10px">${esc(t('common.refresh'))}</button></div>
        <div class="hb-fx-bar">
          <input class="hb-in" id="hb-fx-amt" type="number" step="any" style="width:90px" value="${esc(fxAmount)}">
          <select id="hb-fx-from">${opts(fxFrom)}</select>
          <button type="button" class="hb-btn" data-fx-swap="1">&lt;-&gt;</button>
          <select id="hb-fx-to">${opts(fxTo)}</select>
          <span class="hb-fx-res">${converted != null ? `${esc(fxAmount || '0')} ${esc(fxFrom)} = ${esc(converted)} ${esc(fxTo)}` : '--'}</span>
        </div>
        <div class="hb-grid3">${(market.items || []).slice(0, 6).map(m =>
          `<div class="hb-kpi"><small>${esc(m.pair)}</small><b>${esc(m.symbol)}${esc(m.price)}</b>${m.change != null ? `<small style="color:${m.change >= 0 ? '#8fd65a' : '#ff8a8a'}">${m.change >= 0 ? '+' : ''}${m.change}%</small>` : ''}</div>`
        ).join('')}</div>`;
    }

    if (keepFocusId) {
      const el = root.querySelector('#' + keepFocusId);
      if (el) { el.focus(); try { if (el.setSelectionRange) el.setSelectionRange(keepStart, keepStart); } catch {} }
    }
  }

  root.addEventListener('input', e => {
    if (e.target.id === 'hb-cmd-in') { cmdQuery = e.target.value; runCommandEval(cmdQuery); }
    if (e.target.id === 'hb-tr2-in') trSrc = e.target.value;
    if (e.target.id === 'hb-wx-city') cityQuickIn = e.target.value;
    if (e.target.id === 'hb-lock-path') fileLockPath = e.target.value;
    if (e.target.id === 'hb-tz-offset') { clockOffsetHours = Number(e.target.value) || 0; render(); }
    if (e.target.id === 'hb-fx-amt') { fxAmount = e.target.value; render(); }
  });
  root.addEventListener('change', e => {
    if (e.target.id === 'hb-fx-from') { fxFrom = e.target.value; render(); }
    if (e.target.id === 'hb-fx-to') { fxTo = e.target.value; render(); }
  });
  root.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'hb-cmd-in') {
      e.preventDefault();
      if (evalResult?.value) { api.copyText?.(evalResult.value); window.__lumadockFlash?.(t('common.copiedCheck'), 1200); }
      else root.querySelector('.hb-cmd[data-cmd]')?.click();
    }
    if (e.key === 'Enter' && e.target.id === 'hb-wx-city') { e.preventDefault(); root.querySelector('[data-save-city]')?.click(); }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.id === 'hb-tr2-in') { e.preventDefault(); root.querySelector('[data-do-tr2]')?.click(); }
  });
  root.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.copyAns && evalResult?.value) { await api.copyText?.(evalResult.value); window.__lumadockFlash?.(t('common.copiedCheck'), 1200); return; }
    if (b.dataset.copyHex) { await api.copyText?.(b.dataset.copyHex); window.__lumadockFlash?.(t('home.copiedColor', { hex: b.dataset.copyHex }), 1400); return; }
    if (b.dataset.pickerGo) { const res = await (api.eyedropperStart ? api.eyedropperStart('picker') : api.buddyPickColor?.()); if (res?.ok && res.hex) { refreshColors(); window.__lumadockFlash?.(t('home.copiedColor', { hex: res.hex }), 2200); } return; }
    if (b.dataset.rulerGo) { await api.eyedropperStart?.('ruler'); return; }
    if (b.dataset.lkind && b.dataset.ltarget) { await api.launcherRun?.({ kind: b.dataset.lkind, target: b.dataset.ltarget }); sound('click'); return; }
    if (b.dataset.cmd) { const cmd = COMMANDS().find(c => c.id === b.dataset.cmd); cmd?.run(); sound('click'); return; }
    if (b.dataset.ptab) {
      portsTab = b.dataset.ptab;
      if (portsTab === 'ports') await refreshPorts();
      if (portsTab === 'docker') await refreshDocker();
      render(); return;
    }
    if (b.dataset.dact && b.dataset.did) { await api.dockerAction?.(b.dataset.did, b.dataset.dact); await refreshDocker(); render(); return; }
    if (b.dataset.dlogs) { const r = await api.dockerLogs?.(b.dataset.dlogs); dockerLogText = r?.logs || r?.error || ''; render(); return; }
    if (b.dataset.lockPick) { const r = await api.fileLocksPick?.(); if (r?.ok) { fileLockPath = r.path || ''; fileLocks = r.locks || []; render(); } return; }
    if (b.dataset.lockScan && fileLockPath.trim()) { const r = await api.fileLocks?.(fileLockPath.trim()); if (r?.ok) fileLocks = r.locks || []; render(); return; }
    if (b.dataset.lockKill) { await api.procKill?.(Number(b.dataset.lockKill)); if (fileLockPath.trim()) { const r = await api.fileLocks?.(fileLockPath.trim()); if (r?.ok) fileLocks = r.locks || []; } render(); return; }
    if (b.dataset.openUrl) { api.openUrl?.(b.dataset.openUrl); return; }
    if (b.dataset.joinUrl) { api.openExternalUrl?.(b.dataset.joinUrl); return; }
    if (b.dataset.killPid) { await api.portKill?.(Number(b.dataset.killPid)).then(r => { if (r?.ok) ports = r.ports || []; render(); }); return; }
    if (b.dataset.refreshPorts) { if (portsTab === 'docker') await refreshDocker(); else await refreshPorts(); render(); return; }
    if (b.dataset.trLang) { trTarget = b.dataset.trLang; render(); return; }
    if (b.dataset.doTr2 && trSrc.trim()) {
      trBusy = true; render();
      try { const r = await api.translateText?.(trSrc.trim(), 'auto', trTarget); if (r?.ok) trDst = r.translated || ''; }
      finally { trBusy = false; render(); }
      return;
    }
    if (b.dataset.copyTr2 && trDst) { await api.copyText?.(trDst); window.__lumadockFlash?.(t('common.copiedCheck'), 1200); return; }
    if (b.dataset.wtab) { wxTab = b.dataset.wtab; render(); return; }
    if (b.dataset.tzReset) { clockOffsetHours = 0; render(); return; }
    if (b.dataset.saveCity && cityQuickIn.trim()) { await api.extrasConfig?.({ city: cityQuickIn.trim() }); await window.__lumadockRefreshInfo?.(); render(); return; }
    if (b.dataset.refreshWx) { await window.__lumadockRefreshInfo?.(); render(); return; }
    if (b.dataset.ntab) {
      netTab = b.dataset.ntab;
      if (netTab === 'summary') await refreshProcs();
      if (netTab === 'network' && !pingInfo) pingInfo = await api.netPing?.().catch(() => null);
      render(); return;
    }
    if (b.dataset.refreshProcs) { await refreshProcs(); render(); return; }
    if (b.dataset.killProc) { await api.procKill?.(Number(b.dataset.killProc)); await refreshProcs(); render(); return; }
    if (b.dataset.doPing) { pingInfo = await api.netPing?.().catch(() => null); render(); return; }
    if (b.dataset.doSpeed) { speedBusy = true; render(); try { speedInfo = await api.speedTest?.(); } finally { speedBusy = false; render(); } return; }
    if (b.dataset.toggleHud) { window.__lumadockTogglePref?.('miniHud'); window.__lumadockSettleSize?.(); render(); return; }
    if (b.dataset.fxSwap) { const prev = fxFrom; fxFrom = fxTo; fxTo = prev; render(); return; }
    if (b.dataset.refreshMkt) { await refreshMarket(true); render(); return; }
  });

  root.addEventListener('focusin', () => { projectInputFocused = true; sendInteractive(true); });
  root.addEventListener('focusout', () => { setTimeout(() => { if (!root.contains(document.activeElement)) projectInputFocused = false; }, 0); });
  window.__lumadockI18n?.onChange?.(() => render());

  const baseExpanded = drawExpanded;
  drawExpanded = function (alpha) {
    if (typeof currentView !== 'undefined' && VIEWS.includes(currentView)) { drawHeader(alpha); return; }
    return baseExpanded(alpha);
  };

  let shownView = '';
  (function position() {
    const view = typeof currentView !== 'undefined' ? currentView : '';
    const show = VIEWS.includes(view) && typeof mode !== 'undefined' && mode === 'expanded' && visual.width > 600 && visual.height > 245;
    const nextDisp = show ? 'block' : 'none';
    if (root.style.display !== nextDisp) root.style.display = nextDisp;
    if (show) {
      window.__lumadockPage.place(root, contentRect());
      if (shownView !== view) {
        shownView = view;
        if (view === 'command') { refreshColors(); refreshMarket(false); refreshLauncher().then(render); render(); setTimeout(() => root.querySelector('#hb-cmd-in')?.focus(), 80); }
        else if (view === 'ports' || view === 'dev') { refreshPorts().then(render); }
        else if (view === 'net') { Promise.all([refreshTelemetry(), refreshProcs()]).then(render); }
        else if (view === 'market') { refreshMarket(false).then(render); }
        else render();
      }
    } else {
      shownView = '';
    }
    requestAnimationFrame(position);
  })();
})();
