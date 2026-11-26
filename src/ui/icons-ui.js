'use strict';
// One icon style everywhere: white lines with black inside (like the home icon).
// Also: the header's sound button opens a volume bar, with a tiny LumaDock as the knob.
(function iconsAndVolume() {
  const LINE = '#e8eee4';
  // Icons are drawn on a 24×24 grid.
  const ICONS = {
    home(c) { c.beginPath(); c.moveTo(4, 11); c.lineTo(12, 4); c.lineTo(20, 11); c.lineTo(20, 20); c.lineTo(4, 20); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.roundRect(10, 14, 4, 6, 1); c.stroke(); },
    appsGrid(c) { c.beginPath(); c.roundRect(4.5, 4.5, 6, 6, 1.8); c.roundRect(13.5, 4.5, 6, 6, 1.8);
      c.roundRect(4.5, 13.5, 6, 6, 1.8); c.roundRect(13.5, 13.5, 6, 6, 1.8); c.fill(); c.stroke(); },
    chat(c) { c.beginPath(); c.roundRect(3.5, 5, 17, 12, 5); c.fill(); c.stroke(); c.beginPath(); c.moveTo(8, 17); c.lineTo(7, 20.5); c.lineTo(11.5, 17); c.stroke(); }, // Robo's chat
    plus(c) { c.beginPath(); c.roundRect(4, 4, 16, 16, 5); c.fill(); c.stroke(); c.beginPath(); c.moveTo(12, 8.5); c.lineTo(12, 15.5); c.moveTo(8.5, 12); c.lineTo(15.5, 12); c.stroke(); },
    pin(c) { c.beginPath(); c.moveTo(9, 4.5); c.lineTo(15, 4.5); c.lineTo(14, 10.5); c.lineTo(17.5, 14); c.lineTo(6.5, 14); c.lineTo(10, 10.5); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(12, 14); c.lineTo(12, 20); c.stroke(); },
    snip(c) { c.beginPath(); c.roundRect(5, 5, 14, 11, 2.5); c.stroke(); c.beginPath(); c.arc(8, 19, 2, 0, Math.PI * 2); c.arc(16, 19, 2, 0, Math.PI * 2); c.stroke(); },
    mixer(c) { for (const x of [7, 12, 17]) { c.beginPath(); c.moveTo(x, 5); c.lineTo(x, 19); c.stroke(); }
      c.beginPath(); c.arc(7, 10, 2, 0, Math.PI * 2); c.arc(12, 15, 2, 0, Math.PI * 2); c.arc(17, 9, 2, 0, Math.PI * 2); c.fill(); c.stroke(); },
    shield(c) { c.beginPath(); c.moveTo(12, 4); c.lineTo(19, 7); c.lineTo(19, 12); c.quadraticCurveTo(19, 17.5, 12, 20); c.quadraticCurveTo(5, 17.5, 5, 12); c.lineTo(5, 7); c.closePath(); c.fill(); c.stroke(); },
    gear(c) {
      c.beginPath();
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = i % 2 ? 7 : 9; c.lineTo(12 + Math.cos(a) * r, 12 + Math.sin(a) * r); }
      c.closePath(); c.fill(); c.stroke(); c.beginPath(); c.arc(12, 12, 3, 0, Math.PI * 2); c.stroke();
    },
    speaker(c, level = 1) {
      c.beginPath(); c.moveTo(4, 9.5); c.lineTo(8, 9.5); c.lineTo(12.5, 5.5); c.lineTo(12.5, 18.5); c.lineTo(8, 14.5); c.lineTo(4, 14.5); c.closePath(); c.fill(); c.stroke();
      if (level <= 0) { c.beginPath(); c.moveTo(16, 9.5); c.lineTo(21, 14.5); c.moveTo(21, 9.5); c.lineTo(16, 14.5); c.stroke(); return; }
      c.beginPath(); c.arc(13, 12, 4, -0.9, 0.9); c.stroke();
      if (level > 0.5) { c.beginPath(); c.arc(13, 12, 7.5, -0.9, 0.9); c.stroke(); }
    },
    music(c) { c.beginPath(); c.moveTo(9, 17); c.lineTo(9, 6); c.lineTo(19, 4); c.lineTo(19, 15); c.stroke();
      c.beginPath(); c.ellipse(6.5, 17, 3, 2.4, 0, 0, Math.PI * 2); c.fill(); c.stroke(); c.beginPath(); c.ellipse(16.5, 15, 3, 2.4, 0, 0, Math.PI * 2); c.fill(); c.stroke(); },
    terminal(c) { c.beginPath(); c.roundRect(3, 5, 18, 14, 3); c.fill(); c.stroke(); c.beginPath(); c.moveTo(7, 10); c.lineTo(10, 12.5); c.lineTo(7, 15); c.moveTo(12, 15); c.lineTo(16, 15); c.stroke(); },
    timer(c) { c.beginPath(); c.arc(12, 13, 7.5, 0, Math.PI * 2); c.fill(); c.stroke(); c.beginPath(); c.moveTo(12, 13); c.lineTo(12, 9); c.moveTo(12, 13); c.lineTo(15, 14.5); c.moveTo(10, 3.5); c.lineTo(14, 3.5); c.stroke(); },
    copy(c) { c.beginPath(); c.roundRect(8, 7, 11, 13, 3); c.fill(); c.stroke(); c.beginPath(); c.moveTo(15, 4.5); c.lineTo(7.5, 4.5); c.quadraticCurveTo(5, 4.5, 5, 7); c.lineTo(5, 16); c.stroke(); },
    note(c) { c.beginPath(); c.moveTo(6, 4); c.lineTo(15, 4); c.lineTo(19, 8); c.lineTo(19, 20); c.lineTo(6, 20); c.closePath(); c.fill(); c.stroke(); c.beginPath(); c.moveTo(9, 11); c.lineTo(16, 11); c.moveTo(9, 15); c.lineTo(14, 15); c.stroke(); },
    clock(c) { c.beginPath(); c.arc(12, 12, 8.5, 0, Math.PI * 2); c.fill(); c.stroke(); c.beginPath(); c.moveTo(12, 7.5); c.lineTo(12, 12); c.lineTo(15, 14); c.stroke(); },
    collapse(c) { c.beginPath(); c.arc(12, 12, 8.5, 0, Math.PI * 2); c.fill(); c.stroke(); c.beginPath(); c.moveTo(8, 13.5); c.lineTo(12, 9.5); c.lineTo(16, 13.5); c.stroke(); },
    tray(c) { c.beginPath(); c.moveTo(4, 13); c.lineTo(7, 5); c.lineTo(17, 5); c.lineTo(20, 13); c.lineTo(20, 19); c.lineTo(4, 19); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(4, 13); c.lineTo(9, 13); c.lineTo(10, 15); c.lineTo(14, 15); c.lineTo(15, 13); c.lineTo(20, 13); c.stroke(); },
    cpu(c) { c.beginPath(); c.roundRect(7, 7, 10, 10, 2); c.fill(); c.stroke();
      c.beginPath(); c.roundRect(10, 10, 4, 4, 0.8); c.stroke();
      for (const d of [9.5, 14.5]) { c.beginPath(); c.moveTo(d, 4); c.lineTo(d, 7); c.moveTo(d, 17); c.lineTo(d, 20); c.moveTo(4, d); c.lineTo(7, d); c.moveTo(17, d); c.lineTo(20, d); c.stroke(); } },
    picker(c) { c.beginPath(); c.moveTo(14, 5); c.lineTo(19, 10); c.lineTo(16.5, 12.5); c.lineTo(11.5, 7.5); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(12.5, 8.5); c.lineTo(6, 15); c.lineTo(5, 19); c.lineTo(9, 18); c.lineTo(15.5, 11.5); c.stroke(); },
    command(c) { c.beginPath(); c.arc(10.5, 10.5, 6, 0, Math.PI * 2); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(15, 15); c.lineTo(20, 20); c.stroke(); },
    weather(c) { c.beginPath(); c.arc(14.5, 9, 3.8, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.roundRect(4.5, 11, 13, 7, 3.5); c.fill(); c.stroke(); },
    net(c) { c.beginPath(); c.moveTo(4, 15); c.lineTo(8, 10); c.lineTo(12, 14); c.lineTo(16, 7); c.lineTo(20, 12); c.stroke();
      c.beginPath(); c.roundRect(4, 17.5, 16, 2.5, 1.2); c.fill(); },
    market(c) { c.beginPath(); c.moveTo(4, 17); c.lineTo(9, 11.5); c.lineTo(13, 14); c.lineTo(20, 6.5); c.stroke();
      c.beginPath(); c.moveTo(15.5, 6.5); c.lineTo(20, 6.5); c.lineTo(20, 11); c.stroke(); },
    dev(c) { c.beginPath(); c.moveTo(9, 8); c.lineTo(4.5, 12); c.lineTo(9, 16); c.moveTo(15, 8); c.lineTo(19.5, 12); c.lineTo(15, 16); c.moveTo(13, 6.5); c.lineTo(11, 17.5); c.stroke(); },
    github(c) { c.beginPath(); c.arc(7, 6.5, 2.2, 0, Math.PI * 2); c.arc(7, 17.5, 2.2, 0, Math.PI * 2); c.arc(17, 9.5, 2.2, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(7, 8.8); c.lineTo(7, 15.2); c.moveTo(9, 16.5); c.quadraticCurveTo(17, 16.5, 17, 11.7); c.stroke(); },
    ports(c) { c.beginPath(); c.roundRect(4, 5, 16, 6, 2); c.roundRect(4, 13, 16, 6, 2); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(7.5, 8); c.lineTo(9.5, 8); c.moveTo(7.5, 16); c.lineTo(9.5, 16); c.stroke(); },
    translate(c) { c.beginPath(); c.moveTo(4, 6); c.lineTo(12.5, 6); c.moveTo(8, 4); c.lineTo(8, 6); c.moveTo(10.5, 6); c.quadraticCurveTo(9.5, 11, 5, 13.5); c.moveTo(6.5, 9); c.lineTo(11.5, 13); c.moveTo(13, 19); c.lineTo(16.5, 10.5); c.lineTo(20, 19); c.moveTo(14.3, 16.2); c.lineTo(18.7, 16.2); c.stroke(); },
    devtools(c) { c.beginPath(); c.roundRect(4, 5, 16, 14, 3); c.fill(); c.stroke(); c.beginPath(); c.moveTo(8, 10); c.lineTo(11, 12.5); c.lineTo(8, 15); c.moveTo(13, 15); c.lineTo(16.5, 15); c.stroke(); },
    vault(c) { c.beginPath(); c.moveTo(12, 4); c.lineTo(19, 6.8); c.lineTo(19, 12.2); c.quadraticCurveTo(19, 17.5, 12, 20); c.quadraticCurveTo(5, 17.5, 5, 12.2); c.lineTo(5, 6.8); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.arc(12, 11.5, 1.8, 0, Math.PI * 2); c.moveTo(12, 13.3); c.lineTo(12, 16); c.stroke(); }
  };
  // Old glyphs used by pill(...) calls → icon names.
  const GLYPHS = { '♫': 'music', '›_': 'terminal', '◔': 'timer', '⚙': 'gear', '⌂': 'home', '+': 'plus' };
  function icon(name, x, y, size = 18, colour = LINE, arg, fill = '#000') {
    const draw = ICONS[name]; if (!draw) return false;
    ctx.save(); ctx.translate(x - size / 2, y - size / 2); ctx.scale(size / 24, size / 24);
    ctx.lineWidth = 1.7; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = colour; ctx.fillStyle = fill;
    draw(ctx, arg); ctx.restore(); return true;
  }
  window.__lumadockIcon = icon;

  // ---- pills: same box, but a line icon instead of a text glyph ----
  pill = function (x, y, width, glyph, label, key) {
    const bounds = { x, y, width, height: 34 }, over = inside(pointer.x, pointer.y, bounds);
    box(x, y, width, 34, 17, over ? '#1d221d' : '#121512');
    ctx.save(); ctx.beginPath(); ctx.roundRect(x + 0.5, y + 0.5, width - 1, 33, 16.5); ctx.strokeStyle = over ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.07)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
    if (!icon(GLYPHS[glyph] || glyph, x + 19, y + 17, 17)) text(glyph, x + 19, y + 22, 12, LINE, 600, 'center');
    text(label, x + 36, y + 21, 11, '#e8eee4', 600, 'left', width - 44);
    hit[key] = bounds;
  };

  // ---- volume: 0 = silent, 1 = loud (replaces the on/off sound toggle) ----
  const read = () => { try { const v = Number(localStorage.getItem('lumadock:volume')); return Number.isFinite(v) && localStorage.getItem('lumadock:volume') !== null ? v : soundEnabled ? 0.7 : 0; } catch { return 0.7; } };
  let volume = read();
  const setVolume = v => {
    volume = Math.max(0, Math.min(1, Math.round(v * 20) / 20));
    soundEnabled = volume > 0;
    try { localStorage.setItem('lumadock:volume', String(volume)); localStorage.setItem('lumadock:sound', soundEnabled ? 'on' : 'off'); } catch {}
  };
  setVolume(volume);
  window.__lumadockVolume = () => volume;
  // Never two open/close sounds on top of each other (that sounded like a glitch).
  const baseSound = sound;
  let lastUiSound = 0;
  sound = function (name) {
    if (name === 'open' || name === 'close') {
      const t = performance.now(); if (t - lastUiSound < 450) return; lastUiSound = t;
    }
    return baseSound(name);
  };
  const baseTone = tone;
  tone = function (from, to, duration, vol = 0.018, delay = 0) { if (volume <= 0) return; return baseTone(from, to, duration, vol * volume * 1.4, delay); };

  // Volume: a glass pill that slides out of the speaker icon (springy), a gradient fill and a white knob.
  let barOpen = false, barTouched = 0, dragging = false, barAnim = 0, shownVolume = volume, track = null;
  const backOut = t => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const pillAnim = { x: null, shown: 0, v: 0, at: 0 }; // the sliding pill behind the page you are on
  drawHeader = function (alpha) {
    const left = islandBounds.x, right = left + islandBounds.width;
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'rgba(255,255,255,.055)'; ctx.beginPath(); ctx.moveTo(left + 12, 35); ctx.lineTo(right - 12, 35); ctx.stroke();
    const homeX = left + 27, appsMenuX = left + 59, chatX = left + 91, editX = left + 123, soundX = right - 138, settingsX = right - 102, collapseX = right - 66, powerX = right - 30;
    // the page you are on gets a soft pill behind its icon; switching pages, the pill slides over (and stretches a little on the way)
    const editing = window.__lumadockHomeEditing?.();
    const target = currentView === 'home' && !editing ? homeX
      : currentView === 'apps' || (currentView === 'shortcuts' && !editing) ? appsMenuX
      : currentView === 'chat' ? chatX
      : (currentView === 'home' && editing) ? editX
      : currentView === 'settings' ? settingsX : null;
    const now = performance.now(), dt = Math.min(0.05, (now - (pillAnim.at || now)) / 1000); pillAnim.at = now;
    if (target != null) {
      if (pillAnim.x == null || pillAnim.shown < 0.05) pillAnim.x = target; // appears where it belongs
      const before = pillAnim.x; pillAnim.x += (target - pillAnim.x) * Math.min(1, dt * 16); pillAnim.v = Math.abs(pillAnim.x - before) / Math.max(dt, 0.001);
    }
    pillAnim.shown += ((target != null ? 1 : 0) - pillAnim.shown) * Math.min(1, dt * 14);
    if (pillAnim.shown > 0.02 && pillAnim.x != null) {
      const stretch = Math.min(18, pillAnim.v / 90);
      ctx.save(); ctx.globalAlpha *= pillAnim.shown; ctx.beginPath(); ctx.roundRect(pillAnim.x - 17 - stretch / 2, 3, 34 + stretch, 30, 12); ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fill(); ctx.restore();
    }
    icon('home', homeX, 18, 19); icon('appsGrid', appsMenuX, 18, 18); icon('chat', chatX, 18, 19); icon('plus', editX, 18, 19); icon('speaker', soundX, 18, 19, LINE, volume); icon('gear', settingsX, 18, 18); icon('collapse', collapseX, 18, 19); drawPower(powerX, 18, inside(pointer.x, pointer.y, hit.power) || quitAsk > 0);
    // editing the home widgets: a Done button (like iPhone) and a hint cleanly after editX
    if (currentView === 'home' && window.__lumadockHomeEditing?.() && !window.__lumadockGalleryOpen?.() && !barOpen) {
      const t = key => (window.__lumadockT ? window.__lumadockT(key) : key);
      const b = { x: left + 144, y: 5, width: 62, height: 26 }, over = inside(pointer.x, pointer.y, b);
      ctx.beginPath(); ctx.roundRect(b.x, b.y, b.width, b.height, 13); ctx.fillStyle = over ? '#d9f7b3' : '#c6e994'; ctx.fill();
      text(t('header.doneBtn'), b.x + b.width / 2, b.y + 17, 11.5, '#10180c', 700, 'center');
      text(t('header.dragHint'), b.x + b.width + 12, b.y + 17, 11, '#7f8a7a', 500);
      hit.hmDone = b;
    }
    if (barOpen && performance.now() - barTouched > 3500 && !dragging) barOpen = false;
    barAnim += ((barOpen ? 1 : 0) - barAnim) * (barOpen ? 0.2 : 0.3);
    shownVolume += (volume - shownVolume) * 0.35;
    if (barAnim > 0.01) {
      const full = right - left - 286, w = Math.max(30, full * (barOpen ? backOut(Math.min(1, barAnim)) : barAnim)), pr = soundX + 16, px = pr - w, py = 5, ph = 26;
      ctx.save();
      ctx.beginPath(); ctx.roundRect(px, py, w, ph, 13); ctx.fillStyle = 'rgba(28,30,32,.96)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.stroke();
      const inner = Math.max(0, Math.min(1, (barAnim - 0.45) / 0.4));
      if (inner > 0) {
        ctx.globalAlpha *= inner;
        const tx = px + 16, tw = Math.max(10, w - 98), ty = py + ph / 2, v = shownVolume;
        ctx.beginPath(); ctx.roundRect(tx, ty - 3, tw, 6, 3); ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fill();
        const g = ctx.createLinearGradient(tx, 0, tx + tw, 0); g.addColorStop(0, '#c6e994'); g.addColorStop(1, '#7fd8ff');
        ctx.beginPath(); ctx.roundRect(tx, ty - 3, Math.max(6, tw * v), 6, 3); ctx.fillStyle = g; ctx.shadowColor = '#9fe0c0'; ctx.shadowBlur = 8; ctx.fill(); ctx.shadowBlur = 0;
        const kx = tx + tw * v, kr = dragging ? 8.5 : 7;
        ctx.beginPath(); ctx.arc(kx, ty, kr, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 6; ctx.fill(); ctx.shadowBlur = 0;
        text(Math.round(volume * 100) + '%', pr - 40, ty + 4, 11, '#e8eee4', 700, 'right');
        track = { x: tx, width: tw };
        hit.volumeBar = { x: tx - 14, y: 0, width: tw + 28, height: 34 };
      }
      ctx.restore();
      icon('speaker', soundX, 18, 19, LINE, volume); // the speaker stays on top of the pill
    }
    if (alpha > 0.35 && mode === 'expanded') {
      hit.home = { x: homeX - 15, y: 2, width: 30, height: 30 };
      hit.appsMenu = { x: appsMenuX - 15, y: 2, width: 30, height: 30 };
      hit.chat = { x: chatX - 15, y: 2, width: 30, height: 30 };
      hit.editWidgets = { x: editX - 15, y: 2, width: 30, height: 30 };
      hit.sound = { x: soundX - 16, y: 1, width: 32, height: 31 };
      hit.settings = { x: settingsX - 15, y: 2, width: 30, height: 30 };
      hit.collapse = { x: collapseX - 15, y: 2, width: 30, height: 30 };
      hit.power = { x: powerX - 15, y: 2, width: 30, height: 30 };
    }
    drawQuitAsk(left, right);
    ctx.restore();
  };
  // The power button: a click asks "are you sure?" in the header first; Yes closes LumaDock (with the goodbye).
  let quitAsk = 0, quitAskAt = 0;
  function drawPower(x, y, hot) {
    ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = 1.9; ctx.strokeStyle = hot ? '#ff8a8a' : '#dce4d9';
    ctx.beginPath(); ctx.arc(x, y + 1, 7, -Math.PI / 2 + 0.75, Math.PI * 1.5 - 0.75); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 0.5); ctx.stroke(); ctx.restore();
  }
  function drawQuitAsk(left, right) {
    const open = quitAsk > 0 && performance.now() - quitAskAt < 7000; // no answer: it goes away by itself
    if (!open) { quitAsk = 0; hit.quitYes = hit.quitNo = null; return; }
    const t = key => (window.__lumadockT ? window.__lumadockT(key) : key);
    const k = Math.min(1, (performance.now() - quitAskAt) / 220), e = 1 - Math.pow(1 - k, 3);
    const w = 356 * e, x = right - 8 - w, y = 4, h = 28;
    ctx.save(); ctx.globalAlpha *= Math.min(1, k * 1.5);
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 14); ctx.fillStyle = 'rgba(30,22,22,.98)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,138,138,.35)'; ctx.stroke();
    if (k > 0.6) {
      text(t('header.quitTitle'), x + 16, y + 18.5, 11.5, '#ffd6d6', 700);
      const yes = { x: right - 8 - 4 - 150, y: y + 3, width: 96, height: 22 }, no = { x: right - 8 - 4 - 50, y: y + 3, width: 50, height: 22 };
      const overYes = inside(pointer.x, pointer.y, yes), overNo = inside(pointer.x, pointer.y, no);
      ctx.beginPath(); ctx.roundRect(yes.x, yes.y, yes.width, yes.height, 11); ctx.fillStyle = overYes ? '#ff9c9c' : '#ff7a7a'; ctx.fill();
      text(t('header.quitYes'), yes.x + yes.width / 2, yes.y + 15, 10.5, '#2a0d0d', 700, 'center');
      ctx.beginPath(); ctx.roundRect(no.x, no.y, no.width, no.height, 11); ctx.fillStyle = overNo ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.1)'; ctx.fill();
      text(t('header.quitNo'), no.x + no.width / 2, no.y + 15, 10.5, '#e8eee4', 700, 'center');
      hit.quitYes = yes; hit.quitNo = no;
    }
    ctx.restore();
  }
  const volumeAt = x => track ? (x - track.x) / track.width : volume;
  // Header buttons: home = all apps, + = your shortcuts, the last one folds the island in.
  canvas.addEventListener('click', e => {
    const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (quitAsk && inside(e.clientX, e.clientY, hit.quitYes)) { stop(); quitAsk = 0; sound('click'); window.lumadock?.close?.(); return; }
    if (quitAsk && inside(e.clientX, e.clientY, hit.quitNo)) { stop(); quitAsk = 0; sound('click'); return; }
    if (mode === 'expanded' && inside(e.clientX, e.clientY, hit.power)) { stop(); quitAsk = quitAsk ? 0 : 1; quitAskAt = performance.now(); sound('click'); return; }
    if (quitAsk) { quitAsk = 0; } // a click anywhere else: never mind
    // Home always goes to Home; separate Apps icon always opens the full Apps grid directly.
    if (mode === 'expanded' && inside(e.clientX, e.clientY, hit.home)) {
      stop();
      if (currentView === 'monitor') window.__lumadockMonitor?.small?.();
      if (window.__lumadockHomeEditing?.()) window.__lumadockHomeEdit?.(false);
      setView('home'); setMode('expanded'); return;
    }
    if (mode === 'expanded' && inside(e.clientX, e.clientY, hit.appsMenu)) {
      stop();
      if (currentView === 'monitor') window.__lumadockMonitor?.small?.();
      if (window.__lumadockHomeEditing?.()) window.__lumadockHomeEdit?.(false);
      setView('apps'); setMode('expanded'); return;
    }
    if (mode === 'expanded' && inside(e.clientX, e.clientY, hit.chat)) {
      stop();
      if (currentView === 'monitor') window.__lumadockMonitor?.small?.();
      if (window.__lumadockHomeEditing?.()) window.__lumadockHomeEdit?.(false);
      setView('chat'); setMode('expanded'); return;
    }
    if (mode === 'expanded' && inside(e.clientX, e.clientY, hit.editWidgets)) {
      stop();
      if (currentView === 'monitor') window.__lumadockMonitor?.small?.();
      if (currentView !== 'home') { setView('home'); window.__lumadockHomeEdit?.(true); }
      else if (!window.__lumadockHomeEditing?.()) window.__lumadockHomeEdit?.(true);
      else window.__lumadockGallery?.(); // already editing: + opens the widget menu
      return;
    }
    if (mode === 'expanded' && inside(e.clientX, e.clientY, hit.settings)) { stop(); setView('settings'); return; }
    if (mode === 'expanded' && inside(e.clientX, e.clientY, hit.hmDone)) { stop(); window.__lumadockHomeEdit?.(false); return; }
    if (mode === 'expanded' && inside(e.clientX, e.clientY, hit.collapse)) { stop(); window.__lumadockMonitor?.small?.(); window.__lumadockHoldClosed?.(); setMode('rest'); return; }
    if (inside(e.clientX, e.clientY, hit.sound)) { e.preventDefault(); e.stopImmediatePropagation(); barOpen = !barOpen; barTouched = performance.now(); return; }
    if (barOpen && inside(e.clientX, e.clientY, hit.volumeBar)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  canvas.addEventListener('pointerdown', e => {
    if (!barOpen || !inside(e.clientX, e.clientY, hit.volumeBar)) return;
    dragging = true; barTouched = performance.now(); setVolume(volumeAt(e.clientX)); canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => { if (dragging) { barTouched = performance.now(); setVolume(volumeAt(e.clientX)); } });
  canvas.addEventListener('pointerup', () => { if (dragging) { dragging = false; sound('click'); } });
})();
