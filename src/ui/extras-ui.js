'use strict';
// Island extras (renderer): file tray, quick mirror, volume bar, battery warnings, weather + calendar
// on the home screen, and the album colour used by the Spotify screen and sound wave.
(function islandExtras() {
  const api = window.lumadock;
  if (!api?.trayGet) return;
  const prefs = () => window.__lumadockPrefs?.() || {};
  const say = (title, body) => window.__lumadockSay?.(title, body);
  const badge = id => window.dispatchEvent(new CustomEvent('lumadock:badge', { detail: id }));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));
  const t = (key, params) => (window.__lumadockT ? window.__lumadockT(key, params) : key);
  const loc = () => (window.__lumadockLocale ? window.__lumadockLocale() : 'en-US');
  const VIEWS = ['tray', 'mirror'];
  // (page height and layout come from pages-ui.js)

  // ---------- DOM panel for the tray and mirror views (same place as the Claude Code screen) ----------
  const root = document.createElement('section'); root.id = 'lumadock-extras'; document.body.appendChild(root);
  const style = document.createElement('style'); style.textContent = `
#lumadock-extras{position:absolute;z-index:60;display:none;color:#f4f7ef;font:12px/1.4 Arial,sans-serif;pointer-events:auto}
#lumadock-extras *{box-sizing:border-box}
#lumadock-extras button{border:1px solid #394333;border-radius:12px;padding:7px 11px;color:#eef3e8;background:#252c22;font:600 11px Arial,sans-serif;cursor:pointer}
#lumadock-extras button:hover{background:#343e2d}
#lumadock-extras .ex-hint{color:#aab4a5;font-size:11px}
#lumadock-extras .ex-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px;max-height:170px;padding:5px 3px 3px;margin:-5px -3px 0;overflow:auto;border-radius:16px;transition:max-height .2s}
#lumadock-extras.dragging .ex-grid{max-height:78px}
#lumadock-extras .ex-file{position:relative;display:flex;flex-direction:column;align-items:center;gap:5px;padding:10px 6px 8px;border-radius:14px;background:#151a13;border:1px solid #262e23;cursor:grab;text-align:center;animation:ex-pop .35s cubic-bezier(.2,1.6,.4,1)}
#lumadock-extras .ex-file:hover{border-color:#c6e994;transform:translateY(-2px)}
#lumadock-extras .ex-file img{width:32px;height:32px;pointer-events:none}
#lumadock-extras .ex-file span{font-size:10px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#lumadock-extras .ex-x{position:absolute;top:2px;right:2px;padding:0 6px;border:0;background:transparent;color:#8f998d;font-size:13px}
#lumadock-extras .ex-drop{border:2px dashed #3e4938;border-radius:16px;height:78px;display:flex;align-items:center;justify-content:center;gap:8px;color:#aab4a5;font-size:12px;transition:background .2s,border-color .2s,transform .2s}
#lumadock-extras .ex-drop .on{display:none}
#lumadock-extras.dragging .ex-drop{border-color:#c6e994;background:#1a2216;color:#e8f5d8;transform:scale(1.02)}
#lumadock-extras.dragging .ex-drop .on{display:inline}
#lumadock-extras.dragging .ex-drop .off{display:none}
#lumadock-extras .ex-empty{height:150px;border:1.5px dashed rgba(255,255,255,.12);background:radial-gradient(circle at 50% 35%,rgba(198,233,148,.06),transparent 70%)}
#lumadock-extras .ex-empty span{flex-direction:column;align-items:center;gap:6px;text-align:center}
#lumadock-extras .ex-empty .off{display:flex}
#lumadock-extras.dragging .ex-empty .on{display:flex}
#lumadock-extras .ex-empty b{color:#f2f5ed;font-size:13px;font-weight:600}
#lumadock-extras .ex-empty small{color:#8f998d;font-size:11px}
#lumadock-extras .ex-empty svg{animation:ex-float 3s ease-in-out infinite}
@keyframes ex-float{50%{transform:translateY(-4px)}}
#lumadock-extras .ex-drop.extra{display:none;height:56px;margin-bottom:8px}
#lumadock-extras.dragging .ex-drop.extra{display:flex}
@keyframes ex-pop{0%{transform:scale(.6);opacity:0}100%{transform:scale(1);opacity:1}}#lumadock-extras video{width:100%;height:176px;object-fit:cover;border-radius:16px;transform:scaleX(-1);background:#0d100c}
#lumadock-extras .ex-head-act{margin-top:10px;border:1px solid rgba(198,233,148,.35) !important;background:rgba(198,233,148,.12) !important;color:#d6f5ab !important}
#lumadock-extras .ex-qr-box{display:flex;align-items:center;gap:16px;padding:12px 14px;border-radius:16px;background:#121612;border:1px solid rgba(198,233,148,.35);height:164px}
#lumadock-extras .ex-qr-box img{width:136px;height:136px;border-radius:12px;background:#fff;padding:5px;flex:none}
#lumadock-extras .ex-qr-info{display:flex;flex-direction:column;gap:6px;flex:1;min-width:0}
#lumadock-extras .ex-qr-info b{font-size:14px;color:#fff}
#lumadock-extras .ex-qr-info code{font:11px Consolas,monospace;background:rgba(255,255,255,.07);padding:5px 8px;border-radius:8px;color:#c6e994;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;user-select:text}
#lumadock-extras .ex-qr-row{display:flex;gap:8px;margin-top:4px}`;
  document.head.appendChild(style);

  let trayFiles = [], trayError = '', qrShare = { active: false };
  async function loadTray() {
    const [r, s] = await Promise.all([api.trayGet(), api.lanShareStatus?.().catch(() => null)]);
    if (r.ok) trayFiles = r.files;
    if (s?.ok && s.share) qrShare = s.share;
    render();
  }
  window.__lumadockTrayReload = loadTray;
  window.__lumadockTrayCount = () => trayFiles.length;
  function render() {
    if (currentView === 'tray') {
      const hasImg = trayFiles.some(f => /\.(?:png|jpe?g|webp|bmp)$/i.test(f.path));
      const shareBtn = `<div style="display:flex;gap:5px;margin-top:8px;flex-wrap:wrap"><button type="button" class="ex-head-act" id="ex-add-btn" style="margin-top:0">+ ${esc(t('trayApp.pickFilesBtn'))}</button>${trayFiles.length ? `${hasImg ? `<button type="button" class="ex-head-act" id="ex-webp-btn" style="margin-top:0">WebP</button><button type="button" class="ex-head-act" id="ex-jpg-btn" style="margin-top:0">${esc(t('studio.actCompress'))}</button><button type="button" class="ex-head-act" id="ex-exif-btn" style="margin-top:0">${esc(t('studio.actStripExif'))}</button>` : ''}<button type="button" class="ex-head-act" id="ex-zip-btn" style="margin-top:0">ZIP</button><button type="button" class="ex-head-act" id="ex-qr-toggle" style="margin-top:0">${esc(qrShare.active ? t('trayApp.qrStop') : t('trayApp.qrShareBtn'))}</button>` : ''}</div>`;
      const qrPanel = qrShare.active ? `<div class="ex-qr-box">
        <img src="${esc(qrShare.qrDataUrl)}" alt="QR">
        <div class="ex-qr-info">
          <b>${esc(t('trayApp.qrTitle'))}</b>
          <span class="ex-hint">${esc(t('trayApp.qrSub', { count: qrShare.files?.length || 0 }))}</span>
          <code>${esc(qrShare.url)}</code>
          <div class="ex-qr-row">
            <button type="button" id="ex-qr-copy">${esc(t('trayApp.qrCopyUrl'))}</button>
            <button type="button" id="ex-qr-stop">${esc(t('trayApp.qrStop'))}</button>
          </div>
        </div>
      </div>` : '';
      const fileSvg = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#c6e994" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>';
      root.innerHTML = `<div class="tc-page-head"><div><p class="tc-page-title">${esc(t('trayApp.title'))}</p><p class="tc-page-sub">${esc(trayFiles.length ? t('trayApp.subHasFiles') : t('trayApp.subEmpty'))}</p></div>${shareBtn}</div>${
        qrPanel ? qrPanel : trayFiles.length ? `<div class="ex-drop extra"><span class="on">${esc(t('trayApp.dropRelease'))}</span></div><div class="ex-grid">${trayFiles.map((f, i) => `<div class="ex-file" draggable="true" data-i="${i}" title="${esc(f.path)}">${f.icon ? `<img src="${f.icon}" alt="">` : fileSvg}<span>${esc(f.name)}</span><button type="button" class="ex-x" data-x="${i}" aria-label="${esc(t('trayApp.removeLabel', { name: f.name }))}">×</button></div>`).join('')}</div>`
          : `<div class="ex-drop ex-empty"><span class="off"><svg width="34" height="34" viewBox="0 0 24 24" fill="#000" stroke="#e8eee4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13 7 5h10l3 8v6H4z"/><path d="M4 13h5l1 2h4l1-2h5" fill="none"/></svg><b>${esc(t('trayApp.emptyTitle'))}</b><small>${esc(t('trayApp.emptySub'))}</small><button type="button" class="ex-head-act" id="ex-empty-add" style="margin-top:4px">+ ${esc(t('trayApp.pickFilesBtn'))}</button></span><span class="on"><svg width="34" height="34" viewBox="0 0 24 24" fill="#000" stroke="#e8eee4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13 7 5h10l3 8v6H4z"/><path d="M4 13h5l1 2h4l1-2h5" fill="none"/></svg><b>${esc(t('trayApp.dropRelease'))}</b></span></div>`
      }${trayError ? `<p class="ex-hint" style="color:#ffaba3">${esc(trayError)}</p>` : ''}`;
      const doPickFiles = async () => {
        const r = await api.trayPickFiles?.();
        if (r?.ok && !r.cancelled) {
          trayFiles = r.files || []; trayError = '';
          window.__lumadockCheer?.(); badge('tray:' + trayFiles.length);
          render();
        }
      };
      root.querySelector('#ex-add-btn')?.addEventListener('click', doPickFiles);
      root.querySelector('#ex-empty-add')?.addEventListener('click', doPickFiles);
      root.querySelector('#ex-webp-btn')?.addEventListener('click', async () => {
        const imgFile = trayFiles.find(f => /\.(?:png|jpe?g|webp|bmp)$/i.test(f.path));
        if (imgFile) await window.__lumadockConvertWebp?.(imgFile.path);
      });
      root.querySelector('#ex-jpg-btn')?.addEventListener('click', async () => {
        const imgFile = trayFiles.find(f => /\.(?:png|jpe?g|webp|bmp)$/i.test(f.path));
        if (imgFile) await api.mediaConvert?.(imgFile.path, 'compress');
      });
      root.querySelector('#ex-exif-btn')?.addEventListener('click', async () => {
        const imgFile = trayFiles.find(f => /\.(?:png|jpe?g|webp|bmp)$/i.test(f.path));
        if (imgFile) await api.mediaConvert?.(imgFile.path, 'strip');
      });
      root.querySelector('#ex-zip-btn')?.addEventListener('click', async () => {
        await api.mediaZip?.(trayFiles.map(f => f.path)).catch(e => { trayError = e?.message || t('common.error'); render(); });
      });
      root.querySelector('#ex-qr-toggle')?.addEventListener('click', async () => {
        if (qrShare.active) { await api.lanShareStop?.(); qrShare = { active: false }; render(); return; }
        const r = await api.lanShareStart?.(trayFiles.map(f => f.path)).catch(e => ({ ok: false, error: e?.message }));
        if (r?.ok && r.share) { qrShare = r.share; trayError = ''; } else { trayError = r?.error || t('common.error'); }
        render();
      });
      root.querySelector('#ex-qr-copy')?.addEventListener('click', async () => {
        if (qrShare.url) await api.copyText?.(qrShare.url);
        window.__lumadockFlash?.(t('common.copiedCheck'), 1400);
      });
      root.querySelector('#ex-qr-stop')?.addEventListener('click', async () => {
        await api.lanShareStop?.(); qrShare = { active: false }; render();
      });
      for (const el of root.querySelectorAll('.ex-file')) {
        const f = trayFiles[Number(el.dataset.i)];
        el.addEventListener('dragstart', e => { e.preventDefault(); api.trayDrag(f.path); });
        el.addEventListener('click', async e => { if (e.target.closest('.ex-x')) return; const r = await api.trayOpen(f.path); trayError = r.ok ? '' : r.error; render(); });
      }
      for (const x of root.querySelectorAll('[data-x]')) x.addEventListener('click', async () => {
        const r = await api.trayRemove(trayFiles[Number(x.dataset.x)].path); if (r.ok) trayFiles = r.files; render();
      });
    } else if (currentView === 'mirror') {
      const existingVideo = root.querySelector('video');
      if (!existingVideo) {
        root.innerHTML = `<div class="tc-page-head"><div><p class="tc-page-title">${esc(t('trayApp.mirrorTitle'))}</p><p class="tc-page-sub">${esc(t('trayApp.mirrorSub'))}</p></div></div><video autoplay muted playsinline></video><p class="ex-hint" id="ex-cam"></p>`;
        startCamera();
      } else {
        const titleEl = root.querySelector('.tc-page-title');
        const subEl = root.querySelector('.tc-page-sub');
        if (titleEl) titleEl.textContent = t('trayApp.mirrorTitle');
        if (subEl) subEl.textContent = t('trayApp.mirrorSub');
      }
    } else root.innerHTML = '';
  }
  window.__lumadockI18n?.onChange?.(() => { if (VIEWS.includes(currentView)) render(); });

  // ---------- quick mirror ----------
  let stream = null;
  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 }, audio: false });
      if (currentView !== 'mirror') return stopCamera();
      const video = root.querySelector('video'); if (video) video.srcObject = stream;
      badge('mirror');
    } catch { const p = root.querySelector('#ex-cam'); if (p) p.textContent = t('trayApp.noCameraError'); }
  }
  function stopCamera() { stream?.getTracks().forEach(t => t.stop()); stream = null; }

  // ---------- views in the canvas island ----------
  // ---------- the basket: while you drag a file over the island, LumaDock walks under it with a basket ----------
  const basket = { on: false, seen: 0, x: null, y: null, vx: 0, caughtAt: -1e9, mouseX: null };
  window.__lumadockBasket = () => {
    const t = performance.now(), catching = t - basket.caughtAt < 700;
    if (basket.on && t - basket.seen > 180) basket.on = false; // the drag left the island or ended
    return { show: basket.on || catching, wobble: catching ? Math.sin((t - basket.caughtAt) / 45) * (1 - (t - basket.caughtAt) / 700) : 0, vx: basket.vx };
  };
  const baseExpanded = drawExpanded;
  // Full-island drop zone while dragging: slides in, and shrinks away after the catch.
  let zoneIn = -1e9, zoneOut = -1e9, wasOn = false;
  function dropZone(t) {
    if (basket.on && !wasOn) zoneIn = t;
    if (!basket.on && wasOn) zoneOut = t;
    wasOn = basket.on;
    const k = basket.on ? Math.min(1, (t - zoneIn) / 260) : Math.max(0, 1 - (t - zoneOut) / 300);
    if (k <= 0) return false;
    const e = 1 - Math.pow(1 - k, 3), b = islandBounds, pad = 12;
    const w = (b.width - pad * 2) * (0.94 + 0.06 * e), h = (b.height - pad * 2) * (0.94 + 0.06 * e);
    const x = b.x + (b.width - w) / 2, y = (b.height - h) / 2;
    ctx.save(); ctx.globalAlpha = e;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 26); ctx.fillStyle = 'rgba(198,233,148,.07)'; ctx.fill();
    ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t / 30; ctx.lineWidth = 2; ctx.strokeStyle = '#c6e994'; ctx.shadowColor = '#c6e994'; ctx.shadowBlur = 12; ctx.stroke();
    ctx.setLineDash([]); ctx.shadowBlur = 0;
    window.__lumadockIcon?.('tray', b.x + b.width / 2, y + 48, 30, '#c6e994');
    text(t('trayApp.dropRelease'), b.x + b.width / 2, y + 92, 18, '#ffffff', 700, 'center');
    text(t('trayApp.willSaveToTray'), b.x + b.width / 2, y + 112, 11, '#9aa596', 400, 'center');
    ctx.restore();
    return true;
  }
  drawExpanded = function (alpha) {
    if (!VIEWS.includes(currentView)) return baseExpanded(alpha);
    const PAGE = window.__lumadockPage, area = contentRect(), t = performance.now();
    if (basket.on && t - basket.seen > 180) basket.on = false; // no more dragover: the drag left or ended
    const zone = currentView === 'tray' && dropZone(t);
    if (!zone || !basket.on) drawHeader(alpha * (basket.on ? 0 : 1));
    const home = { x: area.x + PAGE.ghost.x, y: area.y + PAGE.ghost.y };
    const sinceCatch = t - basket.caughtAt, holdBasket = currentView === 'tray' && (basket.on || sinceCatch < 1100);
    if (currentView === 'tray' && incoming && sinceCatch < INCOMING_MS) drawIncoming(area, sinceCatch);
    if (!holdBasket && currentView === 'tray') { basket.x = null; return; } // LumaDock only shows while catching
    // Walks in from below, follows the mouse along the bottom while you drag, catches, then walks out again.
    const target = holdBasket
      ? { x: Math.min(area.x + area.width - 60, Math.max(area.x + 60, basket.mouseX ?? pointer.x)), y: !basket.on && sinceCatch > 650 ? islandBounds.height + 60 : islandBounds.height - 70 }
      : home;
    if (basket.x == null) { basket.x = target.x; basket.y = islandBounds.height + 40; } // walks in from below
    const nx = basket.x + (target.x - basket.x) * 0.18, ny = basket.y + (target.y - basket.y) * 0.18;
    basket.vx = nx - basket.x; basket.x = nx; basket.y = ny;
    PAGE.drawGhost(area, { x: basket.x, y: basket.y });
  };
  // After a drop: a card in the middle. The file drops in with a bounce, a bar fills up, then a check pops.
  const INCOMING_MS = 1500;
  let incoming = null;
  window.__lumadockDragging = () => basket.on;
  window.__lumadockTestDrop = names => { incoming = { names, chimed: false }; basket.caughtAt = performance.now(); }; // for test mode / videos
  function drawIncoming(area, k) {
    const ease = t => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3), back = t => { t = Math.max(0, Math.min(1, t)); return 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2); };
    const out = Math.max(0, Math.min(1, (INCOMING_MS - k) / 220)), appear = back(k / 260), W = 300, H = 92;
    const cx = area.x + area.width / 2, cy = area.y + area.height / 2 - 18, x = cx - W / 2, y = cy - H / 2;
    ctx.save(); ctx.globalAlpha = out; ctx.translate(cx, cy); ctx.scale(0.85 + 0.15 * appear, 0.85 + 0.15 * appear); ctx.translate(-cx, -cy);
    ctx.beginPath(); ctx.roundRect(x, y, W, H, 20); ctx.fillStyle = '#16181a'; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 24; ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(198,233,148,.35)'; ctx.lineWidth = 1.2; ctx.stroke();
    // the file: drops from above and bounces
    const drop = ease(k / 380), bounce = k > 380 && k < 640 ? Math.sin((k - 380) / 260 * Math.PI) * 6 : 0;
    const fx = x + 26, fy = y + 18 - (1 - drop) * 70 - bounce, fw = 40, fh = 52;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, W, H); ctx.clip();
    ctx.fillStyle = '#f4f7f2'; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + fw - 12, fy); ctx.lineTo(fx + fw, fy + 12); ctx.lineTo(fx + fw, fy + fh); ctx.lineTo(fx, fy + fh); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c9d4cf'; ctx.beginPath(); ctx.moveTo(fx + fw - 12, fy); ctx.lineTo(fx + fw - 12, fy + 12); ctx.lineTo(fx + fw, fy + 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#9fb0a9'; for (let i = 0; i < 3; i++) ctx.fillRect(fx + 8, fy + 22 + i * 8, fw - 16 - (i === 2 ? 8 : 0), 3);
    ctx.restore();
    // name + bar + check
    const names = incoming.names, label = names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0];
    text(label, x + 84, y + 34, 13, '#f4f7f2', 700, 'left', W - 104);
    const fill = ease((k - 300) / 650), bx = x + 84, by = y + 50, bw = W - 108;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, 6, 3); ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fill();
    const g = ctx.createLinearGradient(bx, 0, bx + bw, 0); g.addColorStop(0, '#c6e994'); g.addColorStop(1, '#7fd8ff');
    if (fill > 0) { ctx.beginPath(); ctx.roundRect(bx, by, Math.max(6, bw * fill), 6, 3); ctx.fillStyle = g; ctx.fill(); }
    const done = k > 980;
    if (done) {
      const p = back((k - 980) / 220); ctx.save(); ctx.translate(bx + 10, by + 26); ctx.scale(p, p);
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fillStyle = '#c6e994'; ctx.fill();
      ctx.strokeStyle = '#10180c'; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(-1, 3); ctx.lineTo(4.5, -3.5); ctx.stroke(); ctx.restore();
      text(t('trayApp.caughtInTray'), bx + 26, by + 30, 11.5, '#c6e994', 700);
      if (!incoming.chimed) { incoming.chimed = true; tone(880, 1320, 0.09, 0.016); }
    } else text(names.length > 1 ? t('trayApp.processingFiles', { count: names.length }) : t('trayApp.processingFile'), bx, by + 30, 11, '#8f998d', 600);
    ctx.restore();
  }
  let shownView = null;
  function position() {
    const show = VIEWS.includes(currentView) && mode === 'expanded' && visual.width > 600 && visual.height > 245;
    // While a file is dragged over the island, the whole island is the drop zone (canvas), so the page hides.
    const display = show && !(currentView === 'tray' && (basket.on || (incoming && performance.now() - basket.caughtAt < INCOMING_MS - 120))) ? 'block' : 'none';
    if (root.style.display !== display) root.style.display = display; // only write when it changes (runs every frame)
    if (show) window.__lumadockPage.place(root, contentRect());
    const now = show ? currentView : null;
    if (now !== shownView) { shownView = now; if (now !== 'mirror') stopCamera(); if (now === 'tray') loadTray(); else render(); }
    requestAnimationFrame(position);
  }
  requestAnimationFrame(position);
  canvas.addEventListener('click', event => {
    if (mode !== 'expanded' || !['home', 'apps', 'shortcuts'].includes(currentView)) return;
    for (const [key, view] of [['trayApp', 'tray'], ['mirrorApp', 'mirror'], ['settingsApp', 'settings']]) {
      if (inside(event.clientX, event.clientY, hit[key])) { event.preventDefault(); event.stopImmediatePropagation(); setView(view); return; }
    }
  }, true);

  // ---------- drop files on the island ----------
  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragover', e => {
    if (!hasFiles(e)) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; root.classList.add('dragging');
    if (!basket.on) window.__lumadockFeel?.('surprised', 500);
    basket.on = true; basket.seen = performance.now(); basket.mouseX = e.clientX;
    if (currentView !== 'tray' || mode !== 'expanded') setView('tray');
  });
  window.addEventListener('dragleave', () => root.classList.remove('dragging'));
  window.addEventListener('drop', async e => {
    root.classList.remove('dragging');
    if (!hasFiles(e)) return;
    e.preventDefault();
    basket.on = false; basket.caughtAt = performance.now(); // catch!
    const paths = [...e.dataTransfer.files].map(f => api.pathForFile(f)).filter(Boolean);
    if (!paths.length) return;
    incoming = { names: paths.map(p => p.split(/[\\/]/).pop()), chimed: false };
    const r = await api.trayAdd(paths); if (r.ok) { trayFiles = r.files; trayError = ''; } else trayError = r.error;
    window.__lumadockOnNotchDrop?.(paths);
    render(); window.__lumadockCheer?.(); badge('tray:' + trayFiles.length);
  });

  // ---------- messages in the medium island (volume, battery) ----------
  let hud = null;
  window.__lumadockFlash = (text, ms) => flash(text, ms); // short message in the small island (also used by swipe)
  function flash(text, ms = 1600) {
    // Right after start Robo is still saying hi in the middle of the island: a message then ran
    // straight through him (the battery check fires at start). Wait until the hello is over.
    if (!introFinished || window.__lumadockHelloBusy?.()) { clearTimeout(flash.later); flash.later = setTimeout(() => flash(text, ms), 400); return; }
    hud = { text, until: performance.now() + ms };
    if (mode === 'rest' && introFinished) setMode('compact', false);
    clearTimeout(flash.timer); flash.timer = setTimeout(() => { hud = null; window.__lumadockSettleSize?.(); }, ms + 50);
  }
  const baseMessage = window.__lumadockCompactMessage;
  window.__lumadockCompactMessage = () => (hud && performance.now() < hud.until ? hud.text : '') || baseMessage?.() || '';

  // Volume bar: "VOL ▮▮▮▮▮▮▯▯▯▯ 62%"
  let firstVolume = true;
  api.onVolume(({ level, muted }) => {
    if (firstVolume) { firstVolume = false; return; } // the first report is just the starting value
    if (prefs().volumeHud === false) return;
    const blocks = Math.round(level / 10);
    flash(muted ? t('header.muted') : `VOL ${'▮'.repeat(blocks)}${'▯'.repeat(10 - blocks)} ${level}%`, 1400);
  });

  // Sync language to extras main process (weather localization etc.)
  const syncLang = () => api.extrasConfig?.({ lang: prefs().lang || 'en' });
  syncLang();
  window.addEventListener('lumadock:prefs', syncLang);
  window.__lumadockI18n?.onChange?.(next => api.extrasConfig?.({ lang: next }));

  // Mic / Cam privacy dots
  let privacy = { mic: false, cam: false };
  api.onPrivacy?.(p => { if (p) privacy = { mic: Boolean(p.mic), cam: Boolean(p.cam) }; });
  window.__lumadockPrivacy = () => privacy;

  // Downloads watcher
  let dlState = { active: [], completed: null }, lastDlAt = 0;
  api.onDownloads?.(d => {
    dlState = d || { active: [], completed: null };
    if (dlState.completed && dlState.completed.at && dlState.completed.at !== lastDlAt) {
      lastDlAt = dlState.completed.at;
      flash(t('notifications.downloaded', { name: dlState.completed.name }), 4500);
      window.__lumadockChime?.('pop');
    }
  });
  window.__lumadockDownloads = () => dlState;

  // System stats (CPU & RAM), polled live at 1.5s when expanded or miniHud is active
  let sysStats = { cpuPct: 0, memPct: 0, memUsedGb: 0, memTotalGb: 0, history: [] };
  async function pollStats() {
    try {
      const r = await api.systemStats?.();
      if (r?.ok) {
        const hist = [...(sysStats.history || []), r.cpuPct].slice(-18);
        sysStats = { ...r, history: hist };
        const tel = window.__lumadockTelemetry?.() || {};
        window.__lumadockLiveStats = { ...sysStats, rxBps: tel.rxBps || 0, txBps: tel.txBps || 0 };
        window.dispatchEvent(new CustomEvent('lumadock:stats', { detail: sysStats }));
      }
    } catch {}
  }
  pollStats();
  setInterval(() => {
    if ((mode === 'expanded' && ['home', 'apps', 'net'].includes(currentView)) || prefs().miniHud) pollStats();
  }, 1500);
  setInterval(() => {
    if (mode !== 'expanded' && !prefs().miniHud) pollStats();
  }, 15000);
  window.__lumadockStats = () => sysStats;

  // Battery of this laptop
  const warned = new Set();
  navigator.getBattery?.().then(battery => {
    const check = () => {
      if (prefs().batteryWarn === false || battery.charging) { if (battery.charging) warned.clear(); return; }
      const pct = Math.round(battery.level * 100);
      for (const at of [20, 10]) {
        if (pct <= at && !warned.has(at)) {
          warned.add(at); flash(t('notifications.batteryFlash', { pct }), 4000);
          say(t('notifications.batteryLowTitle', { pct }), t('notifications.batteryLowBody')); window.__lumadockFeel?.('surprised', 1500);
        }
      }
    };
    battery.addEventListener('levelchange', check); battery.addEventListener('chargingchange', check); check();
  }).catch(() => {});

  // Bluetooth devices (headphones, mouse): warn once a day when low & popup card on new connection
  let prevBtNames = null;
  api.onBluetooth(({ devices }) => {
    const list = Array.isArray(devices) ? devices : [];
    window.__lumadockBluetooth = list;
    if (prevBtNames !== null) {
      const joined = list.find(d => !prevBtNames.has(d.name));
      if (joined) {
        flash(`${joined.name} · ${joined.battery}%`, 3200);
        window.__lumadockChime?.('pop');
        window.__lumadockFeel?.('happy', 1400);
      }
    }
    prevBtNames = new Set(list.map(d => d.name));
    if (prefs().batteryWarn === false) return;
    for (const d of list) {
      const key = 'lumadock:bt-warned:' + d.name + ':' + new Date().toDateString();
      if (d.battery <= 20 && !localStorage.getItem(key)) {
        localStorage.setItem(key, '1');
        flash(t('notifications.btFlash', { name: d.name, pct: d.battery }), 4000);
        say(t('notifications.btLowTitle', { name: d.name }), t('notifications.btLowBody', { pct: d.battery }));
      }
    }
  });

  // ---------- weather + calendar line on the home screen ----------
  let weather = null, nextEvent = null;
  async function refreshInfo() {
    try { const w = await api.weatherNow(); weather = w.ok ? w.weather : null; } catch {}
    try { const c = await api.calendarNext(); nextEvent = c.ok ? c.next : null; } catch {}
  }
  refreshInfo(); setInterval(refreshInfo, 2 * 60000);
  window.__lumadockRefreshInfo = refreshInfo;
  window.__lumadockWeather = () => weather;
  window.__lumadockCalendarRaw = () => nextEvent;
  window.__lumadockNextMeeting = () => {
    if (!nextEvent || !nextEvent.url) return null;
    const mins = Math.round((nextEvent.start - Date.now()) / 60000);
    return mins >= -5 && mins <= 15 ? { ...nextEvent, mins } : null;
  };
  window.__lumadockHomeInfo = () => {
    const parts = [];
    if (weather) parts.push(`${weather.temp}° ${weather.place}`);
    if (nextEvent) {
      const start = new Date(nextEvent.start), mins = Math.round((nextEvent.start - Date.now()) / 60000);
      const todayW = t('header.todayWord');
      const nowW = t('header.nowWord');
      const inMins = t('header.inMinutes', { mins });
      const defTitle = t('header.meetingDefault');
      const when = nextEvent.allDay ? todayW : mins <= 0 ? nowW : mins < 60 ? inMins : start.toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' });
      parts.push(`${when}: ${nextEvent.title || defTitle}`);
      if (mins === 10 && !warned.has('cal' + nextEvent.start)) {
        warned.add('cal' + nextEvent.start);
        flash(t('notifications.calendarInTenFlash', { title: nextEvent.title }), 5000);
        say(t('notifications.calendarInTenTitle'), nextEvent.title);
      }
    }
    return parts.join('  ·  ');
  };

  // ---------- system Core Audio peak reactive equalizer (no DXGI/WGC screen capture!) ----------
  const BARS = 18;
  const audio = { levels: new Array(BARS).fill(0), peak: 0, peakAt: 0, smoothed: 0, lastAt: 0 };
  api.onAudioPeak?.(d => {
    const p = Number(d?.peak);
    if (Number.isFinite(p)) {
      audio.peak = Math.max(0, Math.min(1, p / 100));
      audio.peakAt = performance.now();
    }
  });

  window.__lumadockAudioLevels = () => {
    const playing = Boolean(spotifyConnected && spotifyState.is_playing);
    if (!playing) {
      window.__lumadockHearing = false;
      window.__lumadockBeatEnergy = 0;
      return null;
    }
    const tmMs = performance.now();
    if (tmMs - audio.lastAt < 14) return audio.levels;
    audio.lastAt = tmMs;
    const tm = tmMs / 1000;
    const age = tmMs - audio.peakAt;
    const rawPeak = age < 1200 ? audio.peak : 0;
    audio.smoothed = audio.smoothed * 0.65 + rawPeak * 0.35;
    const liveDrive = spotifyState.track?.id === 'test'
      ? (0.55 + 0.4 * Math.sin(tm * 7.2))
      : rawPeak > 0.015 ? Math.min(1, 0.24 + audio.smoothed * 1.15) : 0.38;

    window.__lumadockHearing = true;
    window.__lumadockBeatEnergy = Math.max(0.1, Math.min(1, liveDrive * 0.9));
    for (let i = 0; i < BARS; i++) {
      const waveA = 0.5 + 0.5 * Math.sin(tm * 7.4 - i * 0.42);
      const waveB = 0.5 + 0.5 * Math.cos(tm * 4.5 + i * 0.68);
      const arch = Math.sin((i / (BARS - 1)) * Math.PI) * 0.72 + 0.28;
      const lvl = (waveA * 0.58 + waveB * 0.42) * arch * Math.max(0.28, liveDrive);
      audio.levels[i] = Math.max(0.06, Math.min(0.98, lvl));
    }
    return audio.levels;
  };

  // ---------- dual-color album palette (dominant + complementary accent) ----------
  let colourFor = '';
  const rgbStr = ([r, g, b]) => `rgb(${r},${g},${b})`;
  const boostRgb = (r, g, b) => {
    const k = 212 / Math.max(68, Math.max(r, g, b));
    return [r, g, b].map(v => Math.min(255, Math.round(v * k)));
  };
  setInterval(() => {
    if (spotifyState.track?.id === 'test') {
      window.__lumadockAlbumPalette = { primary: '#00e5ff', secondary: '#b87aff' };
      return;
    }
    const url = spotifyState.track?.image_url || '';
    if (url === colourFor) return; colourFor = url;
    if (!url) {
      window.__lumadockAlbumColour = null;
      window.__lumadockAlbumSecondary = null;
      window.__lumadockAlbumPalette = null;
      return;
    }
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = c.height = 12; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 12, 12);
        const d = x.getImageData(0, 0, 12, 12).data;
        const pixels = [];
        let pr = 0, pg = 0, pb = 0, pn = 0;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2];
          const sat = Math.max(r, g, b) - Math.min(r, g, b);
          const w = 1 + sat / 14;
          pr += r * w; pg += g * w; pb += b * w; pn += w;
          pixels.push({ r, g, b, sat });
        }
        const c1 = boostRgb(pr / pn, pg / pn, pb / pn);
        let best = null, bestScore = -1;
        for (const px of pixels) {
          const diff = Math.abs(px.r - c1[0]) + Math.abs(px.g - c1[1]) + Math.abs(px.b - c1[2]);
          const score = diff * (0.4 + px.sat / 180);
          if (score > bestScore) { bestScore = score; best = px; }
        }
        const c2 = best ? boostRgb(best.r, best.g, best.b) : c1;
        window.__lumadockAlbumColour = rgbStr(c1);
        window.__lumadockAlbumSecondary = rgbStr(c2);
        window.__lumadockAlbumPalette = { primary: rgbStr(c1), secondary: rgbStr(c2) };
      } catch {
        window.__lumadockAlbumColour = null;
        window.__lumadockAlbumSecondary = null;
        window.__lumadockAlbumPalette = null;
      }
    };
    img.src = url;
  }, 1000);
})();
