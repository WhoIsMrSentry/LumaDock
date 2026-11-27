'use strict';
// Focus page: choose hours, minutes and seconds, start, watch countdown + built-in Web Audio Ambient Soundscape Mixer.
// Timer logic lives in lumadock-fun.js (window.__lumadockFocus); layout comes from pages-ui.js.
(function focusPage() {
  const root = document.createElement('section'); root.id = 'lumadock-focus'; document.body.appendChild(root);
  const style = document.createElement('style'); style.textContent = `
#lumadock-focus{position:absolute;z-index:60;display:none;color:#f4f7ef;font:12px/1.4 Arial,sans-serif;pointer-events:auto;user-select:none}
#lumadock-focus *{box-sizing:border-box}
#lumadock-focus .fo-body{display:flex;align-items:center;gap:18px;height:calc(100% - 62px)}
#lumadock-focus .fo-dials{display:flex;align-items:center;gap:6px;background:linear-gradient(180deg,#121612,#0c0f0c);border:1px solid rgba(255,255,255,.07);border-radius:18px;padding:6px 10px}
#lumadock-focus .fo-dial{display:flex;flex-direction:column;align-items:center;gap:2px;width:62px}
#lumadock-focus .fo-dial b{font:700 34px/1 Arial,sans-serif;font-variant-numeric:tabular-nums;letter-spacing:-1px}
#lumadock-focus .fo-dial small{color:#9aa596;font-size:10px;text-transform:uppercase;letter-spacing:.06em}
#lumadock-focus .fo-colon{font:700 28px/1 Arial,sans-serif;color:#5d6858;margin-bottom:22px}
#lumadock-focus button{border:1px solid rgba(255,255,255,.08);border-radius:12px;background:#121512;color:#e8eee4;cursor:pointer;font:600 11px Arial,sans-serif}
#lumadock-focus button:hover{background:#1d221d;border-color:rgba(255,255,255,.18)}
#lumadock-focus .fo-arrow{width:42px;height:22px;padding:0;display:grid;place-items:center;background:transparent;border-color:transparent;color:#8f998d}
#lumadock-focus .fo-arrow:hover{color:#fff;background:rgba(255,255,255,.06);border-color:transparent}
#lumadock-focus .fo-presets button.on{background:rgba(255,179,92,.14);border-color:rgba(255,179,92,.5);color:#ffd28a}
#lumadock-focus .fo-side{display:flex;flex-direction:column;gap:8px;flex:1;min-width:0}
#lumadock-focus .fo-presets{display:flex;gap:6px;flex-wrap:wrap}
#lumadock-focus .fo-presets button{padding:6px 10px}
#lumadock-focus .fo-start{padding:9px 16px;background:#c6e994;color:#11180d;border-color:#c6e994;font-size:12.5px}
#lumadock-focus .fo-start:hover{background:#d4f6a5}
#lumadock-focus .fo-row{display:flex;gap:8px}
#lumadock-focus .fo-row button{padding:7px 12px}
#lumadock-focus .fo-running{gap:24px}
#lumadock-focus .fo-ring{position:relative;width:142px;height:142px;flex:none}
#lumadock-focus .fo-ring svg{width:100%;height:100%;transform:rotate(-90deg)}
#lumadock-focus .fo-ring circle{fill:none;stroke-width:7}
#lumadock-focus .fo-ring-bg{stroke:rgba(255,255,255,.08)}
#lumadock-focus .fo-ring-fill{stroke:#ffb35c;stroke-linecap:round;stroke-dasharray:100;stroke-dashoffset:100;transition:stroke-dashoffset .6s linear}
#lumadock-focus .fo-ring-text{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
#lumadock-focus .fo-ring-text b{font-weight:700;font-size:28px;letter-spacing:-1px;font-variant-numeric:tabular-nums}
#lumadock-focus .fo-ring-text small{color:#8f998d;font-size:10.5px}
#lumadock-focus .fo-kicker{margin:0;display:flex;align-items:center;gap:7px;color:#ffd28a;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
#lumadock-focus .fo-dot{width:7px;height:7px;border-radius:50%;background:#ffb35c;box-shadow:0 0 8px #ffb35c;animation:fo-pulse 1.6s ease-in-out infinite}
@keyframes fo-pulse{50%{opacity:.35}}
#lumadock-focus .fo-end{margin:0;font-size:20px;font-weight:700;color:#fff}
#lumadock-focus .fo-note{margin:0;color:#8f998d;font-size:11px}
#lumadock-focus .fo-stop{color:#ffaba3 !important;border-color:rgba(255,120,110,.25) !important}
#lumadock-focus .fo-stop:hover{background:rgba(255,90,80,.12) !important}
#lumadock-focus .fo-amb{display:flex;flex-direction:column;gap:6px;padding:8px 10px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07)}
#lumadock-focus .fo-amb-head{display:flex;align-items:center;gap:8px}
#lumadock-focus .fo-amb-head b{font-size:10.5px;color:#9aa596;text-transform:uppercase;letter-spacing:.06em;flex:1}
#lumadock-focus .fo-amb-head input[type=range]{width:92px;accent-color:#c6e994;cursor:pointer;height:4px}
#lumadock-focus .fo-amb-chips{display:flex;gap:5px;flex-wrap:wrap}
#lumadock-focus .fo-amb-chips button{padding:5px 9px;font-size:10.5px;border-radius:9px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.06);color:#cfd6cb}
#lumadock-focus .fo-amb-chips button.on{background:rgba(198,233,148,.16);border-color:rgba(198,233,148,.55);color:#dff8ba}`;
  document.head.appendChild(style);

  const F = () => window.__lumadockFocus;
  const t = (key, params) => (window.__lumadockT ? window.__lumadockT(key, params) : key);
  const loc = () => (window.__lumadockLocale ? window.__lumadockLocale() : 'en-US');
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- Zero-Asset Procedural Ambient Soundscape Engine (Web Audio API) ----------
  const TRACKS = ['rain', 'cafe', 'brown', 'alpha'];
  const savedAmb = (() => { try { return JSON.parse(localStorage.getItem('lumadock:ambient') || '{}'); } catch { return {}; } })();
  const ambState = {
    on: new Set(Array.isArray(savedAmb.on) ? savedAmb.on.filter(x => TRACKS.includes(x)) : []),
    vol: Number.isFinite(savedAmb.vol) ? Math.max(0.05, Math.min(1, savedAmb.vol)) : 0.45
  };
  let actx = null, master = null;
  const nodes = new Map();

  function saveAmb() {
    try { localStorage.setItem('lumadock:ambient', JSON.stringify({ on: [...ambState.on], vol: ambState.vol })); } catch {}
  }

  function makeNoiseBuffer(ctx, modeName) {
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    if (modeName === 'brown') {
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        data[i] = last * 3.2;
      }
    } else if (modeName === 'cafe') {
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + w * 0.029;
        b1 = 0.985 * b1 + w * 0.032;
        b2 = 0.95 * b2 + w * 0.048;
        data[i] = (b0 + b1 + b2) * 0.45;
      }
    } else {
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  function startTrack(id) {
    if (nodes.has(id)) return;
    actx ||= new AudioContext();
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    if (!master) {
      master = actx.createGain();
      master.gain.value = ambState.vol * 0.25;
      master.connect(actx.destination);
    }
    const stopList = [];
    const chGain = actx.createGain();
    chGain.connect(master);

    if (id === 'rain') {
      chGain.gain.value = 0.42;
      const src = actx.createBufferSource();
      src.buffer = makeNoiseBuffer(actx, 'rain');
      src.loop = true;
      const bp = actx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1150; bp.Q.value = 0.55;
      const lp = actx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 3400;
      src.connect(bp).connect(lp).connect(chGain);
      src.start();
      stopList.push(src);
    } else if (id === 'cafe') {
      chGain.gain.value = 0.55;
      const src = actx.createBufferSource();
      src.buffer = makeNoiseBuffer(actx, 'cafe');
      src.loop = true;
      const lp = actx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 520;
      const lfo = actx.createOscillator(), lfoG = actx.createGain();
      lfo.frequency.value = 0.14; lfoG.gain.value = 140;
      lfo.connect(lfoG).connect(lp.frequency);
      src.connect(lp).connect(chGain);
      src.start(); lfo.start();
      stopList.push(src, lfo);
    } else if (id === 'brown') {
      chGain.gain.value = 0.65;
      const src = actx.createBufferSource();
      src.buffer = makeNoiseBuffer(actx, 'brown');
      src.loop = true;
      const lp = actx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 280;
      src.connect(lp).connect(chGain);
      src.start();
      stopList.push(src);
    } else if (id === 'alpha') {
      chGain.gain.value = 0.14;
      for (const freq of [216, 226, 324]) {
        const o = actx.createOscillator();
        o.type = 'sine';
        o.frequency.value = freq;
        const g = actx.createGain();
        g.gain.value = freq > 300 ? 0.25 : 0.4;
        o.connect(g).connect(chGain);
        o.start();
        stopList.push(o);
      }
    }
    nodes.set(id, { chGain, stopList });
  }

  function stopTrack(id) {
    const n = nodes.get(id);
    if (!n) return;
    nodes.delete(id);
    for (const s of n.stopList) { try { s.stop(); } catch {} try { s.disconnect(); } catch {} }
    try { n.chGain.disconnect(); } catch {}
  }

  function syncAudio() {
    if (master && actx) master.gain.setTargetAtTime(ambState.vol * 0.25, actx.currentTime, 0.04);
    for (const id of TRACKS) {
      if (ambState.on.has(id)) startTrack(id);
      else stopTrack(id);
    }
  }
  window.__lumadockAmbientStop = () => {
    ambState.on.clear();
    syncAudio();
    saveAmb();
    lastKey = '';
  };

  let focusTab = 'pomodoro'; // pomodoro | timers
  const multiTimers = [];
  let swRunning = false, swStartedAt = 0, swElapsedMs = 0, swLaps = [];
  let eyeBreakOn = false, eyeNextAt = 0;

  setInterval(() => {
    const nowMs = Date.now();
    let changed = false;
    for (let i = multiTimers.length - 1; i >= 0; i--) {
      if (multiTimers[i].endAt <= nowMs) {
        const done = multiTimers.splice(i, 1)[0];
        changed = true;
        window.__lumadockBuddyBurst?.('done', done.label, 5000, '#ffb35c');
        window.__lumadockChime?.('party');
      }
    }
    if (eyeBreakOn && eyeNextAt && nowMs >= eyeNextAt) {
      eyeNextAt = nowMs + 20 * 60000;
      window.__lumadockBuddyBurst?.('curious', t('focus.eyeBreakFlash'), 5000, '#00e5ff');
      window.__lumadockChime?.('pop');
    }
    if (focusTab === 'timers' && shown) updateTimersLive(changed);
  }, 400);

  function fmtMs(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  }
  function updateTimersLive(forceRebuild) {
    if (forceRebuild) { lastKey = ''; return render(); }
    const swEl = root.querySelector('#fo-sw-val');
    if (swEl) swEl.textContent = fmtMs(swElapsedMs + (swRunning ? Date.now() - swStartedAt : 0));
    multiTimers.forEach(tm => {
      const el = root.querySelector(`[data-mt="${tm.id}"]`);
      if (el) el.textContent = fmtMs(tm.endAt - Date.now());
    });
  }

  function ambientHtml() {
    const chips = [
      ['rain', t('focus.ambient.rain')],
      ['cafe', t('focus.ambient.cafe')],
      ['brown', t('focus.ambient.brown')],
      ['alpha', t('focus.ambient.alpha')]
    ];
    return `<div class="fo-amb">
      <div class="fo-amb-head"><b>${esc(t('focus.ambient.title'))}</b><input type="range" id="fo-amb-vol" min="5" max="100" value="${Math.round(ambState.vol * 100)}" aria-label="${esc(t('focus.ambient.volume'))}"></div>
      <div class="fo-amb-chips">${chips.map(([id, lbl]) => `<button type="button" data-amb="${id}" class="${ambState.on.has(id) ? 'on' : ''}">${esc(lbl)}</button>`).join('')}</div>
    </div>`;
  }

  let lastKey = '';
  const pad = n => String(n).padStart(2, '0');
  function render() {
    const f = F(); if (!f) return;
    const running = f.active();
    const key = `${focusTab}:${running ? 'run' : 'idle:' + f.chosen()}:${[...ambState.on].sort().join(',')}:${multiTimers.length}:${swRunning}:${swLaps.length}:${eyeBreakOn}`;
    if (key === lastKey) return update(); // only rebuild when something changed
    lastKey = key;
    const sec = f.chosen(), h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    const dial = (unit, value, label) => `<div class="fo-dial"><button type="button" class="fo-arrow" data-add="${unit}" aria-label="${t('focus.moreLabel', { label })}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg></button><b>${pad(value)}</b><small>${label}</small><button type="button" class="fo-arrow" data-add="${-unit}" aria-label="${t('focus.fewerLabel', { label })}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button></div>`;
    const presets = [
      [15 * 60, t('focus.minutesUnit', { n: 15 })],
      [25 * 60, t('focus.minutesUnit', { n: 25 })],
      [45 * 60, t('focus.minutesUnit', { n: 45 })],
      [3600, t('focus.oneHour')]
    ];
    const head = `<div class="tc-page-head"><div><p class="tc-page-title">${t('focus.title')}</p><p class="tc-page-sub">${running ? t('focus.runningSub') : t('focus.idleSub')}</p></div>
      <div style="display:flex;gap:6px;margin-top:8px">
        <button type="button" data-ftab="pomodoro" class="${focusTab === 'pomodoro' ? 'on' : ''}" style="border:1px solid rgba(255,255,255,.12);border-radius:9px;padding:4px 10px;background:${focusTab === 'pomodoro' ? '#c6e994' : '#151915'};color:${focusTab === 'pomodoro' ? '#10180c' : '#e8ece6'};font:600 11px sans-serif;cursor:pointer">Pomodoro</button>
        <button type="button" data-ftab="timers" class="${focusTab === 'timers' ? 'on' : ''}" style="border:1px solid rgba(255,255,255,.12);border-radius:9px;padding:4px 10px;background:${focusTab === 'timers' ? '#c6e994' : '#151915'};color:${focusTab === 'timers' ? '#10180c' : '#e8ece6'};font:600 11px sans-serif;cursor:pointer">${esc(t('focus.timersTab'))}</button>
      </div></div>`;
    if (focusTab === 'timers') {
      const swVal = fmtMs(swElapsedMs + (swRunning ? Date.now() - swStartedAt : 0));
      const timersHtml = multiTimers.map(tm => `<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;border-radius:9px;background:rgba(255,255,255,.04)"><b>${esc(tm.label)}</b><div><b data-mt="${tm.id}" style="color:#c6e994;margin-right:6px">${fmtMs(tm.endAt - Date.now())}</b><button type="button" data-mtdel="${tm.id}" style="border:0;background:transparent;color:#ffaba3;cursor:pointer">x</button></div></div>`).join('') || `<small style="color:#8f998d">${esc(t('focus.timersEmpty'))}</small>`;
      root.innerHTML = `${head}<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;height:calc(100% - 62px)">
        <div style="background:#121612;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;overflow:auto">
          <b style="font-size:11px;color:#8f998d;text-transform:uppercase">${esc(t('focus.countdowns'))}</b>
          <div style="display:flex;gap:5px;flex-wrap:wrap">
            <button type="button" class="fo-start" style="padding:4px 9px;font-size:11px" data-add-timer="5">+5m</button>
            <button type="button" class="fo-start" style="padding:4px 9px;font-size:11px" data-add-timer="10">+10m</button>
            <button type="button" class="fo-start" style="padding:4px 9px;font-size:11px" data-add-timer="15">+15m</button>
          </div>
          ${timersHtml}
          <div style="margin-top:auto;display:flex;align-items:center;justify-content:space-between;padding:6px 8px;border-radius:9px;background:rgba(255,255,255,.04)">
            <small>${esc(t('focus.eyeBreakLabel'))}</small>
            <button type="button" data-eye-tog="1" style="border:0;border-radius:8px;padding:4px 10px;background:${eyeBreakOn ? '#c6e994' : '#232823'};color:${eyeBreakOn ? '#10180c' : '#e8ece6'};font:600 10.5px sans-serif;cursor:pointer">${eyeBreakOn ? esc(t('common.on')) : esc(t('common.off'))}</button>
          </div>
        </div>
        <div style="background:#121612;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;overflow:auto">
          <b style="font-size:11px;color:#8f998d;text-transform:uppercase">${esc(t('focus.stopwatch'))}</b>
          <div id="fo-sw-val" style="font:700 24px Consolas,monospace;color:#f2f5ef">${swVal}</div>
          <div style="display:flex;gap:6px">
            <button type="button" data-sw-tog="1" style="border:0;border-radius:8px;padding:5px 10px;background:#c6e994;color:#10180c;font:600 11px sans-serif;cursor:pointer">${swRunning ? 'Pause' : 'Start'}</button>
            <button type="button" data-sw-lap="1" style="border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:5px 10px;background:#1a1e1a;color:#e8ece6;font:600 11px sans-serif;cursor:pointer">Lap</button>
            <button type="button" data-sw-rst="1" style="border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:5px 10px;background:#1a1e1a;color:#e8ece6;font:600 11px sans-serif;cursor:pointer">${esc(t('common.reset'))}</button>
          </div>
          <div style="font:11px Consolas,monospace;color:#9aa596">${swLaps.slice(-4).map((l, idx) => `#${idx + 1} ${l}`).join(' · ')}</div>
        </div>
      </div>`;
      return;
    }
    root.innerHTML = `${head}${
      running
        ? `<div class="fo-body fo-running"><div class="fo-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="fo-ring-bg"/><circle cx="60" cy="60" r="52" class="fo-ring-fill" id="fo-ring" pathLength="100"/></svg><div class="fo-ring-text"><b id="fo-left">${f.label()}</b><small id="fo-total"></small></div></div>
           <div class="fo-side"><p class="fo-kicker"><span class="fo-dot"></span>${t('focus.runningKicker')}</p><p class="fo-end" id="fo-end"></p>
           <div class="fo-row"><button type="button" data-plus="300">+5 min</button><button type="button" data-plus="900">+15 min</button><button type="button" class="fo-stop" data-stop="1">${t('focus.stop')}</button></div>
           ${ambientHtml()}</div></div>`
        : `<div class="fo-body"><div class="fo-dials" id="fo-dials">${dial(3600, h, t('focus.hours'))}<span class="fo-colon">:</span>${dial(60, m, t('focus.minutes'))}<span class="fo-colon">:</span>${dial(1, s, t('focus.seconds'))}</div>
           <div class="fo-side"><div class="fo-presets">${presets.map(([v, l]) => `<button type="button" data-set="${v}"${v === sec ? ' class="on"' : ''}>${l}</button>`).join('')}</div>
           <button type="button" class="fo-start" data-start="1">${t('focus.startFocus')}</button>
           ${ambientHtml()}</div></div>`
    }`;
    update();
  }
  function update() {
    const f = F(); if (!f?.active()) return;
    const left = root.querySelector('#fo-left');
    if (left) left.textContent = f.label();
    const ring = root.querySelector('#fo-ring'), end = root.querySelector('#fo-end'), total = root.querySelector('#fo-total');
    if (ring) ring.style.strokeDashoffset = String(100 * (1 - f.left() / f.length()));
    const timeStr = new Date(Date.now() + f.left()).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' });
    if (end) end.textContent = t('focus.doneAt', { time: timeStr });
    if (total) total.textContent = t('focus.ofMinutes', { mins: Math.round(f.length() / 60000) });
  }
  window.__lumadockI18n?.onChange?.(() => { lastKey = ''; if (shown) render(); });
  root.addEventListener('click', e => {
    const b = e.target.closest('button'), f = F(); if (!b || !f) return;
    if (b.dataset.ftab) { focusTab = b.dataset.ftab; lastKey = ''; render(); return; }
    if (b.dataset.addTimer) {
      const mins = Number(b.dataset.addTimer);
      multiTimers.push({ id: String(Date.now() + Math.random()), label: `${mins} min`, endAt: Date.now() + mins * 60000 });
      sound('click'); lastKey = ''; render(); return;
    }
    if (b.dataset.mtdel) {
      const idx = multiTimers.findIndex(x => x.id === b.dataset.mtdel);
      if (idx >= 0) multiTimers.splice(idx, 1);
      lastKey = ''; render(); return;
    }
    if (b.dataset.eyeTog) { eyeBreakOn = !eyeBreakOn; eyeNextAt = eyeBreakOn ? Date.now() + 20 * 60000 : 0; sound('click'); lastKey = ''; render(); return; }
    if (b.dataset.swTog) {
      if (swRunning) { swElapsedMs += Date.now() - swStartedAt; swRunning = false; }
      else { swStartedAt = Date.now(); swRunning = true; }
      sound('click'); lastKey = ''; render(); return;
    }
    if (b.dataset.swLap) { swLaps.push(fmtMs(swElapsedMs + (swRunning ? Date.now() - swStartedAt : 0))); sound('click'); lastKey = ''; render(); return; }
    if (b.dataset.swRst) { swRunning = false; swElapsedMs = 0; swLaps = []; sound('click'); lastKey = ''; render(); return; }
    if (b.dataset.amb) {
      const id = b.dataset.amb;
      if (ambState.on.has(id)) ambState.on.delete(id);
      else ambState.on.add(id);
      syncAudio();
      saveAmb();
      sound('click');
      lastKey = ''; render();
      return;
    }
    if (b.dataset.add) f.choose(f.chosen() + Number(b.dataset.add));
    if (b.dataset.set) f.choose(Number(b.dataset.set));
    if (b.dataset.start) { f.start(); syncAudio(); }
    if (b.dataset.plus) f.add(Number(b.dataset.plus));
    if (b.dataset.stop) f.stop();
    sound('click'); lastKey = ''; render();
  });
  root.addEventListener('input', e => {
    if (e.target.id === 'fo-amb-vol') {
      ambState.vol = Math.max(0.05, Math.min(1, Number(e.target.value) / 100));
      syncAudio();
      saveAmb();
    }
  });
  // Scroll on a number to change it quickly.
  root.addEventListener('wheel', e => {
    const dial = e.target.closest('.fo-dial'), f = F(); if (!dial || !f) return;
    e.preventDefault(); const unit = Math.abs(Number(dial.querySelector('[data-add]').dataset.add));
    f.choose(f.chosen() + (e.deltaY < 0 ? unit : -unit)); lastKey = ''; render();
  }, { passive: false });

  const baseExpanded = drawExpanded;
  drawExpanded = function (alpha) { if (currentView !== 'focus') return baseExpanded(alpha); drawHeader(alpha); };
  let shown = false;
  (function position() {
    const show = currentView === 'focus' && mode === 'expanded' && visual.width > 600 && visual.height > 245;
    const display = show ? 'block' : 'none'; if (root.style.display !== display) root.style.display = display;
    if (show) { window.__lumadockPage.place(root, contentRect()); if (!shown) lastKey = ''; render(); }
    shown = show;
    requestAnimationFrame(position);
  })();
})();
