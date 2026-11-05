'use strict';
// LumaDock fun: esplink-mcp-robot / Grokbot expressions, blinking, startup show, sounds, confetti,
// sleeping, dancing, cyber outfits, limit warnings, focus timer, and Settings options (EN + TR).
(function lumadockFun() {
  const now = () => performance.now();
  const store = {
    get: (key, fallback) => { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set: (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
  };

  // ---------- preferences (Settings → General) ----------
  const DEFAULTS = { lang: 'en', speed: 'snel', focusMin: 25, focusSec: 1500, eye: 'mint', body: 'wolk', palette: 'klassiek', faces: true, blink: true,
    dance: true, confetti: true, chimes: true, notify: true, startup: true, outfit: 'auto', sleepMin: 10, warnAt: 80,
    pack: 'klassiek', seasonal: true, hunger: true, volumeHud: true, batteryWarn: true, appAnim: true,
    testMode: false, name: 'LumaDock', lightBusy: '#ff9a1f', lightDone: '#22e05a', lightError: '#ff3b3b' };
  const savedPrefs = store.get('lumadock:prefs', {});
  if (!savedPrefs.newLook) { savedPrefs.body = 'wolk'; savedPrefs.newLook = true; store.set('lumadock:prefs', savedPrefs); }
  if (!['en', 'tr'].includes(savedPrefs.lang)) savedPrefs.lang = 'en';
  const prefs = { ...DEFAULTS, ...savedPrefs };
  if (!['en', 'tr'].includes(prefs.lang)) prefs.lang = 'en';
  if (savedPrefs.lightBusy === undefined && savedPrefs.palette && savedPrefs.palette !== 'klassiek') {
    const old = { zacht: ['#ffc27a', '#8ef0a8', '#ff8a8a'], kleurenblind: ['#ffb000', '#3d9bff', '#ff5ac8'] }[savedPrefs.palette];
    if (old) [prefs.lightBusy, prefs.lightDone, prefs.lightError] = old;
  }
  const isTr = () => prefs.lang === 'tr';
  const L = (en, tr) => (isTr() ? tr : en);
  const petName = () => String(prefs.name || '').trim() || 'LumaDock';
  if (!['snel', 'normaal'].includes(prefs.speed)) prefs.speed = 'normaal';
  let drafting = false;
  const save = () => { if (drafting) return; store.set('lumadock:prefs', prefs); apply(); };

  // Cyber-Bot OLED Visor eye colours & Mecha chassis palettes
  const EYES = {
    mint: '#00e5ff',
    wit: '#f0f8ff',
    blauw: '#38f8b2',
    roze: '#ff5ca8',
    paars: '#b87aff',
    geel: '#ffd23f'
  };
  const EYE_LABELS = {
    mint: ['Cyber Cyan', 'Siber Camgöbeği'],
    wit: ['Pure Ice', 'Saf Buz'],
    blauw: ['Neon Mint', 'Neon Nane'],
    roze: ['Laser Pink', 'Lazer Pembe'],
    paars: ['Ultraviolet', 'Ultraviyole'],
    geel: ['Solar Gold', 'Solar Altın']
  };
  const BODIES = {
    wolk: ['#f2f7ff', '#b8cce4'],
    munt: ['#e8fff8', '#9ce6d0'],
    lucht: ['#e6f4ff', '#9ec5f8'],
    roos: ['#fff0f6', '#f2b6d2'],
    klassiek: ['#334458', '#1b2634'],
    nacht: ['#1d2432', '#0d121b'],
    blauw: ['#234b85', '#11274a'],
    paars: ['#4d3382', '#241642'],
    roze: ['#822970', '#3d1135'],
    goud: ['#a87e2b', '#4d370d']
  };
  const BODY_LABELS = {
    wolk: ['Arctic Mecha', 'Arktik Meka'],
    munt: ['Cyber Mint', 'Siber Nane'],
    lucht: ['Holo Ice', 'Holo Buz'],
    roos: ['Rose Quartz', 'Pembe Kuvars'],
    klassiek: ['Titanium', 'Titanyum'],
    nacht: ['Obsidian', 'Obsidyen'],
    blauw: ['Cobalt', 'Kobalt'],
    paars: ['Quantum', 'Kuantum'],
    roze: ['Nebula', 'Nebula'],
    goud: ['Solar Gold', 'Solar Altın']
  };
  const SPEEDS = { snel: { t: 0.5, peek: 140, home: 300, view: 1500, mon: 600 }, normaal: { t: 0.8, peek: 260, home: 400, view: 2200, mon: 800 } };

  // All body colours use the sleek Cyber-Bot chassis ('blob' renderer in mascot.html)
  window.__lumadockLook = () => ({
    eye: EYES[prefs.eye] || EYES.mint,
    shell1: BODIES[prefs.body]?.[0] || BODIES.wolk[0],
    shell2: BODIES[prefs.body]?.[1] || BODIES.wolk[1],
    style: 'blob'
  });
  window.__lumadockPalette = () => ({ busy: prefs.lightBusy, question: prefs.lightBusy, done: prefs.lightDone, error: prefs.lightError });
  window.__lumadockName = petName;

  const baseSetMode = setMode;
  setMode = function (next, playSound) {
    const result = baseSetMode(next, playSound);
    if (transition && !transition.scaled) { transition.duration *= SPEEDS[prefs.speed].t; transition.scaled = true; }
    return result;
  };
  function apply() {
    const s = SPEEDS[prefs.speed];
    UI.NORMAL_PEEK_DELAY = s.peek; UI.HOME_LEAVE_DELAY = s.home; UI.VIEW_LEAVE_DELAY = s.view; UI.MONITOR_LEAVE_DELAY = s.mon;
    window.lumadock?.aiMonitorSetNotify?.(prefs.notify).catch?.(() => {});
  }
  apply();

  const say = (title, body) => { if (!prefs.notify) return; try { new Notification(title, { body, silent: true }); } catch {} };
  window.__lumadockPrefs = () => prefs;
  window.__lumadockSay = say;

  // ---------- sounds: the same melodies in different sound packs ----------
  const PACKS = {
    klassiek: { wave: 'sine', vol: 1, mul: 1, len: 1, labelEn: 'Classic', labelTr: 'Klasik' },
    '8bit': { wave: 'square', vol: 0.45, mul: 1, len: 0.8, labelEn: '8-bit', labelTr: '8-bit' },
    zacht: { wave: 'sine', vol: 0.55, mul: 0.75, len: 1.4, labelEn: 'Soft', labelTr: 'Yumuşak' },
    belletjes: { wave: 'triangle', vol: 0.9, mul: 2, len: 1.8, labelEn: 'Chimes', labelTr: 'Çanlar' }
  };
  let audio = null;
  function synth(from, to, dur, vol, delay = 0) {
    const pack = PACKS[prefs.pack] || PACKS.klassiek;
    try {
      audio ||= new AudioContext();
      const t = audio.currentTime + delay, osc = audio.createOscillator(), gain = audio.createGain();
      osc.type = pack.wave; osc.frequency.setValueAtTime(from * pack.mul, t); osc.frequency.exponentialRampToValueAtTime(to * pack.mul, t + dur * pack.len);
      gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(vol * pack.vol, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur * pack.len);
      osc.connect(gain).connect(audio.destination); osc.start(t); osc.stop(t + dur * pack.len + 0.05);
    } catch {}
  }
  const MELODIES = {
    done: [[660, 880, 0.12, 0.02], [880, 1320, 0.18, 0.018, 0.12]],
    question: [[520, 600, 0.09, 0.018], [600, 820, 0.14, 0.016, 0.1]],
    error: [[300, 220, 0.18, 0.022], [220, 160, 0.22, 0.02, 0.16]],
    party: [523, 659, 784, 1047].map((f, i) => [f, f * 1.01, 0.12, 0.016, i * 0.09]),
    warn: [[440, 440, 0.1, 0.02], [440, 440, 0.1, 0.02, 0.18]],
    hello: [392, 523, 659, 784].map((f, i) => [f, f * 1.02, 0.1, 0.014, i * 0.07]),
    pop: [[700, 1100, 0.06, 0.012]],
    badge: [784, 988, 1175, 1568].map((f, i) => [f, f * 1.01, 0.1, 0.014, i * 0.06]),
    yum: [[500, 760, 0.08, 0.016], [760, 620, 0.08, 0.014, 0.09]],
    send: [[480, 960, 0.07, 0.011]],
    reply: [[880, 1175, 0.08, 0.012], [1175, 1568, 0.12, 0.01, 0.08]],
    fix: [523, 659, 784, 1047, 1319].map((f, i) => [f, f * 1.01, 0.13, 0.015, i * 0.075])
  };
  function chime(kind) {
    if (!soundEnabled || !prefs.chimes) return;
    for (const note of MELODIES[kind] || []) synth(...note);
  }

  // ---------- Cyber Wardrobe outfits: unlocked by finishing tasks ----------
  const OUTFITS = [
    { at: 5, id: 'hat', nameEn: 'Neon Halo', nameTr: 'Neon Hale' },
    { at: 10, id: 'shades', nameEn: 'Cyber Visor', nameTr: 'Siber Vizör' },
    { at: 15, id: 'headphones', nameEn: 'Holo Headset', nameTr: 'Holo Kulaklık' },
    { at: 20, id: 'horns', nameEn: 'Mecha Horns', nameTr: 'Meka Boynuz' },
    { at: 30, id: 'crown', nameEn: 'Cyber Crown', nameTr: 'Siber Taç' }
  ];
  const outfitName = o => L(o.nameEn, o.nameTr);
  let doneCount = store.get('lumadock:done-count', 0);
  const unlocked = id => doneCount >= (OUTFITS.find(o => o.id === id)?.at ?? Infinity) || (!!OUTFITS.find(o => o.id === id) && !window.__lumadockLicense?.().locked.includes('outfits'));
  function season() {
    if (!prefs.seasonal) return null;
    const d = new Date(), m = d.getMonth() + 1, day = d.getDate();
    if (m === 12 && day <= 26) return 'santa';
    if ((m === 12 && day === 31) || (m === 1 && day === 1)) return 'hat';
    if (m === 10 && day >= 24) return 'witch';
    return null;
  }
  const outfit = () => prefs.outfit === 'geen' ? null
    : prefs.outfit !== 'auto' && unlocked(prefs.outfit) ? prefs.outfit
    : season() || [...OUTFITS].reverse().find(o => unlocked(o.id))?.id || null;
  window.__lumadockOutfitOn = () => { const o = outfit(); return Boolean(o && o !== 'shades' && o !== 'headphones'); };
  window.__lumadockOutfits = { count: () => doneCount, next: () => OUTFITS.find(o => doneCount < o.at) || null };
  function countDone(status) {
    doneCount++; store.set('lumadock:done-count', doneCount);
    window.__lumadockMonitor?.refresh?.();
    feed(25);
    const fresh = OUTFITS.find(o => o.at === doneCount);
    if (fresh) {
      say(
        L('LumaDock unlocked new gear!', 'LumaDock yeni bir ekipman açtı!'),
        L(`${doneCount} tasks done: you earned ${fresh.nameEn}.`, `${doneCount} görev tamamlandı: ${fresh.nameTr} kazandınız.`)
      );
      chime('party'); confetti(); feel('heart', 2000);
    }
    const hour = new Date().getHours();
    earn('first'); if (doneCount >= 10) earn('ten'); if (doneCount >= 50) earn('fifty');
    if (hour < 5) earn('owl'); if (hour >= 5 && hour < 7) earn('bird');
    if ((status?.elapsed || 0) >= 900) earn('marathon');
    if (unlocked('crown')) earn('fashion');
  }

  // ---------- achievements ----------
  const BADGES = [
    { id: 'first', icon: '🌱', nameEn: 'First Task', nameTr: 'İlk Görev', howEn: 'Finish a coding task', howTr: 'Bir yapay zeka görevini tamamla' },
    { id: 'ten', icon: '🔟', nameEn: 'Ten Tasks', nameTr: 'On Görev', howEn: '10 tasks done', howTr: '10 görev tamamlandı' },
    { id: 'fifty', icon: '🏅', nameEn: 'Fifty Tasks', nameTr: 'Elli Görev', howEn: '50 tasks done', howTr: '50 görev tamamlandı' },
    { id: 'helper', icon: '💬', nameEn: 'Helpful', nameTr: 'Yardımsever', howEn: 'Reply 10 times from the island', howTr: 'Adadan 10 kez yanıt ver' },
    { id: 'owl', icon: '🦉', nameEn: 'Night Owl', nameTr: 'Gece Kuşu', howEn: 'A task finished after midnight', howTr: 'Gece yarısından sonra görev bitir' },
    { id: 'bird', icon: '🐦', nameEn: 'Early Bird', nameTr: 'Erkenci Kuş', howEn: 'A task finished before 7 AM', howTr: 'Sabah 07:00 öncesi görev bitir' },
    { id: 'marathon', icon: '🏃', nameEn: 'Long Haul', nameTr: 'Maratoncu', howEn: 'A task over 15 minutes', howTr: '15 dakikadan uzun bir görev' },
    { id: 'focus', icon: '🎯', nameEn: 'Focus Master', nameTr: 'Odak Ustası', howEn: '5 focus sessions finished', howTr: '5 odak oturumu tamamla' },
    { id: 'dj', icon: '🎧', nameEn: 'Cyber DJ', nameTr: 'Siber DJ', howEn: 'Control Spotify 10 times from the island', howTr: 'Spotify\'ı adadan 10 kez kontrol et' },
    { id: 'tray', icon: '📥', nameEn: 'Collector', nameTr: 'Koleksiyoncu', howEn: '5 files in the tray', howTr: 'Çekmecede 5 dosya biriktir' },
    { id: 'mirror', icon: '🪞', nameEn: 'Looking Sharp', nameTr: 'Ayna Kontrolü', howEn: 'Used the quick mirror', howTr: 'Hızlı aynayı kullan' },
    { id: 'fashion', icon: '👑', nameEn: 'Cyber Icon', nameTr: 'Stil İkonu', howEn: 'All wardrobe gear earned', howTr: 'Tüm gardırop ekipmanlarını kazan' }
  ];
  const badges = new Set(store.get('lumadock:badges', []));
  const counters = store.get('lumadock:counters', {});
  function earn(id) {
    if (badges.has(id)) return;
    const b = BADGES.find(x => x.id === id); if (!b) return;
    badges.add(id); store.set('lumadock:badges', [...badges]);
    say(`${b.icon} ${L('Achievement', 'Başarım')}: ${L(b.nameEn, b.nameTr)}`, L(b.howEn, b.howTr));
    chime('badge'); confetti(50); jump(); feel('heart', 1500);
  }
  function bump(name, goal, id) { counters[name] = (counters[name] || 0) + 1; store.set('lumadock:counters', counters); if (counters[name] >= goal) earn(id); }
  window.addEventListener('lumadock:badge', e => {
    const what = String(e.detail || '');
    if (what === 'dj') bump('dj', 10, 'dj');
    else if (what === 'mirror') earn('mirror');
    else if (what.startsWith('tray:') && Number(what.slice(5)) >= 5) earn('tray');
  });

  // ---------- hunger: finishing tasks recharges LumaDock ----------
  let food = store.get('lumadock:food', { value: 80, at: Date.now() });
  const hunger = () => {
    const lost = Math.floor((Date.now() - food.at) / 600000);
    if (lost > 0) { food = { value: Math.max(0, food.value - lost), at: food.at + lost * 600000 }; store.set('lumadock:food', food); }
    return food.value;
  };
  function feed(points) {
    if (!prefs.hunger) return;
    hunger(); food = { value: Math.min(100, food.value + points), at: food.at }; store.set('lumadock:food', food); chime('yum');
  }
  const hungry = () => prefs.hunger && hunger() < 30;
  window.__lumadockHunger = () => (prefs.hunger ? hunger() : null);
  window.__lumadockHomeTitle = () => (hungry() ? L("I'm hungry… finish a task 🍪", 'Acıktım… bir görev tamamla 🍪') : '');
  if (Date.now() - food.at > 600000) { food.at = Date.now(); store.set('lumadock:food', food); }

  // ---------- focus timer ----------
  if (!prefs.focusSec) prefs.focusSec = (prefs.focusMin || 25) * 60;
  let focusEnd = store.get('lumadock:focus-end', 0), focusLength = store.get('lumadock:focus-length', prefs.focusSec * 1000);
  const clock = ms => { const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`; };
  const focus = {
    active: () => focusEnd > Date.now(),
    left: () => Math.max(0, focusEnd - Date.now()),
    length: () => focusLength,
    chosen: () => prefs.focusSec,
    minutes: () => Math.round(prefs.focusSec / 60),
    label: () => clock(focus.left()),
    choose(sec) { prefs.focusSec = Math.max(5, Math.min(24 * 3600 - 1, Math.round(sec))); save(); },
    start(sec = prefs.focusSec) {
      focusLength = sec * 1000; focusEnd = Date.now() + focusLength;
      store.set('lumadock:focus-end', focusEnd); store.set('lumadock:focus-length', focusLength);
      chime('pop'); feel('heart', 1200); wake(); window.__lumadockSettleSize?.();
    },
    add(sec) { if (!focus.active()) return; focusEnd += sec * 1000; focusLength += sec * 1000; store.set('lumadock:focus-end', focusEnd); store.set('lumadock:focus-length', focusLength); },
    stop() { focusEnd = 0; store.set('lumadock:focus-end', 0); chime('error'); window.__lumadockSettleSize?.(); },
    toggle() { focus.active() ? focus.stop() : focus.start(); }
  };
  window.__lumadockFocus = focus;
  canvas.addEventListener('click', event => {
    if (inside(event.clientX, event.clientY, hit.focusApp)) { event.preventDefault(); event.stopImmediatePropagation(); setView('focus'); }
  }, true);

  // ---------- confetti ----------
  const layer = document.createElement('canvas');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:80';
  document.body.appendChild(layer);
  const lctx = layer.getContext('2d');
  let bits = [], running = false;
  function confetti(amount = 90) {
    if (!prefs.confetti) return;
    const cx = islandBounds.x + islandBounds.width / 2, colours = ['#00e5ff', '#38f8b2', '#ffd166', '#4cc9f0', '#f72585', EYES[prefs.eye] || '#00e5ff'];
    for (let i = 0; i < amount; i++) {
      bits.push({ x: cx + (Math.random() - 0.5) * Math.max(80, islandBounds.width * 0.6), y: islandBounds.height * 0.6, vx: (Math.random() - 0.5) * 5,
        vy: -Math.random() * 3 - 1, size: 3 + Math.random() * 4, spin: Math.random() * 6, colour: colours[i % colours.length], life: 1 });
    }
    if (!running) { running = true; requestAnimationFrame(drawConfetti); }
  }
  function drawConfetti() {
    layer.width = innerWidth; layer.height = innerHeight;
    bits = bits.filter(b => b.life > 0 && b.y < innerHeight + 10);
    for (const b of bits) {
      b.vy += 0.12; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.spin += 0.2; b.life -= 0.008;
      lctx.save(); lctx.globalAlpha = Math.min(1, b.life * 2); lctx.translate(b.x, b.y); lctx.rotate(b.spin);
      lctx.fillStyle = b.colour; lctx.fillRect(-b.size / 2, -b.size / 4, b.size, b.size / 2); lctx.restore();
    }
    if (bits.length) requestAnimationFrame(drawConfetti); else running = false;
  }

  // ---------- feelings ----------
  let feeling = null, feelingUntil = 0, bounceAt = -1e9;
  const pv = { prefs: null, feeling: null, feelingUntil: 0, bounceAt: -1e9, danceUntil: 0, waveUntil: 0, nextBlink: 0 };
  function feel(mood, ms) { pv.feeling = mood; pv.feelingUntil = now() + ms; feeling = mood; feelingUntil = now() + ms; }
  function jump() { pv.bounceAt = now(); bounceAt = now(); }
  window.__lumadockFeel = feel;
  window.__lumadockCelebrate = (kind = 'done', bits = 40) => { chime(kind); jump(); confetti(bits); };
  window.__lumadockChime = kind => chime(kind);
  window.__lumadockCheer = () => { jump(); feel('happy', 800); chime('pop'); };

  // ---------- sleeping ----------
  let lastWake = Date.now();
  function wake() { lastWake = Date.now(); }
  canvas.addEventListener('click', wake, true);
  const asleep = () => sleepEnabled && !window.__lumadockStatus?.() && !focus.active() && !spotifyState.is_playing
    && !(pointer.known && inside(pointer.x, pointer.y, islandBounds)) && Date.now() - lastWake > prefs.sleepMin * 60000;

  // ---------- hello and goodbye ----------
  let showAt = null;
  const showColours = () => [prefs.lightError, prefs.lightBusy, prefs.lightDone];
  const baseEyes = window.__lumadockEyes;
  const inLocker = () => window.__lumadockLockerDraw === true;
  let lightsDemoAt = -1e9;
  let lightPreview = null;
  const HELLO = { land: 380, hi: 700, tilt: 1300, wink: 2000, end: 2700 };
  const BYE = { squash: 650, off: 880, end: 1400 };
  const spring = (ms, amp, hz = 3, damp = 6) => ms < 0 ? 0 : amp * Math.exp(-damp * ms / 1000) * Math.sin(2 * Math.PI * hz * ms / 1000);

  // ---- Robo's voice: soft, round chirps ----
  const soundVolume = () => { const v = window.__lumadockVolume?.() ?? 1; return soundEnabled && v > 0 ? v : 0; };
  const ac = () => { audio ||= new AudioContext(); if (audio.state === 'suspended') audio.resume(); return audio; };
  function chirp(at, from, to, dur, trill = 0, gain = 0.055) {
    const V = soundVolume(); if (!V) return;
    try {
      const c = ac(), t = c.currentTime + at, out = c.createGain();
      out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(gain * V, t + 0.015);
      out.gain.setValueAtTime(gain * V, t + dur * 0.6); out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      out.connect(c.destination);
      const tones = [['sine', 1, 1], ['triangle', 2, 0.18]].map(([type, mul, level]) => {
        const o = c.createOscillator(), g = c.createGain(); o.type = type; g.gain.value = level;
        o.frequency.setValueAtTime(from * mul, t); o.frequency.exponentialRampToValueAtTime(to * mul, t + dur * 0.7);
        o.connect(g).connect(out); return o;
      });
      if (trill) { const lfo = c.createOscillator(), depth = c.createGain(); lfo.frequency.value = 16; depth.gain.setValueAtTime(0, t); depth.gain.linearRampToValueAtTime(trill, t + dur);
        lfo.connect(depth); tones.forEach(o => depth.connect(o.frequency)); lfo.start(t); lfo.stop(t + dur + 0.05); }
      tones.forEach(o => { o.start(t); o.stop(t + dur + 0.05); });
    } catch {}
  }
  function blobTone(at, from, to, dur, gain = 0.05) {
    const V = soundVolume(); if (!V) return;
    try {
      const c = ac(), t = c.currentTime + Math.max(0, at), o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain * V, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.03);
    } catch {}
  }
  const sayHi = () => { chirp(0, 760, 1180, 0.09); chirp(0.085, 1180, 1580, 0.2, 28); };
  const sayByeBye = () => { chirp(0, 1180, 940, 0.11); chirp(0.17, 1080, 640, 0.26, 24); };
  window.__lumadockVoice = { hi: sayHi, bye: sayByeBye };

  const kicks = [];
  const kick = (amp, hz = 2.6, damp = 5.5) => { kicks.push({ at: now(), amp, hz, damp }); if (kicks.length > 6) kicks.shift(); };
  window.__lumadockKick = kick;
  const baseDrawIsland = drawIsland;
  const baseDrawGhost = drawGhost;
  drawGhost = function (x, y, size, ...rest) {
    if ((showAt != null || byeAt != null) && mode === 'compact' && y < 40 && !inLocker()) { x = islandBounds.x + islandBounds.width / 2; size *= 1.2; }
    return baseDrawGhost(x, y, size, ...rest);
  };
  drawIsland = function () {
    const t = now(); let j = 0;
    for (const k of kicks) j += spring(t - k.at, k.amp, k.hz, k.damp);
    if (Math.abs(j) < 0.002) return baseDrawIsland();
    const w = visual.width, h = visual.height;
    visual.width = w * (1 + j); visual.height = h * (1 - j * 1.4);
    try { return baseDrawIsland(); } finally { visual.width = w; visual.height = h; }
  };
  let byeAt = null;
  window.__lumadockEyes = () => {
    if (lightPreview && now() < lightPreview.until) return { color: lightPreview.color };
    const demo = now() - lightsDemoAt; if (demo >= 0 && demo < 1500) return { color: showColours()[Math.min(2, Math.floor(demo / 500))] };
    if (inLocker()) return null;
    return baseEyes?.() || null;
  };
  let waveUntil = 0, popAt = -1e9;
  const waving = () => now() < waveUntil;
  window.__lumadockCompactMessage = () => byeAt != null ? (now() - byeAt < BYE.off ? ' ' : '') : showAt != null && now() - showAt < HELLO.end ? ' ' : '';

  let showId = 0;
  const step = (id, ms, fn) => setTimeout(() => { if (id === showId) fn(); }, ms);
  function startHello() {
    const id = ++showId;
    showAt = now(); popAt = now() + 180; setMode('compact', false);
    kick(0.12); blobTone(0, 180, 620, 0.16, 0.06);
    step(id, HELLO.land, () => blobTone(0, 520, 240, 0.08, 0.05));
    step(id, HELLO.hi, () => { sayHi(); feel('happy', 1100); waveUntil = now() + 1100; });
    step(id, HELLO.tilt, () => feel('happy', 600));
    step(id, HELLO.wink, () => { feel('wink', 450); blobTone(0, 900, 1300, 0.05, 0.025); });
    step(id, HELLO.end, () => { showAt = null; if (mode === 'compact' && !(pointer.known && inside(pointer.x, pointer.y, islandBounds))) { setMode('rest', false); kick(0.07, 3); } });
  }
  let helloQueued = true;
  const startShow = setInterval(() => {
    if (!introFinished) return;
    clearInterval(startShow);
    helloQueued = false;
    if (prefs.startup) startHello();
  }, 100);
  window.__lumadockHelloBusy = () => (helloQueued && prefs.startup) || showAt != null || byeAt != null;
  window.__lumadockHello = startHello;
  window.__lumadockBye = () => {
    ++showId; byeAt = now(); showAt = null; sayByeBye(); feel('happy', BYE.squash); waveUntil = now() + BYE.squash;
    if (mode !== 'compact') setMode('compact', false);
    setTimeout(() => { blobTone(0, 640, 150, 0.2, 0.06); kick(-0.1, 3.2); }, BYE.squash);
    setTimeout(() => setMode('rest', false), BYE.off);
  };
  window.lumadock?.onGoodbye?.(() => window.__lumadockBye());

  // ---------- poking ----------
  let pokes = [], dizzyUntil = 0, pokeMessage = '', pokeMessageUntil = 0;
  canvas.addEventListener('click', event => {
    if (!inside(event.clientX, event.clientY, hit.ghost)) return;
    const t = now(); pokes = pokes.filter(p => t - p < 1600); pokes.push(t);
    jump(); chime('pop');
    if (pokes.length >= 6) {
      dizzyUntil = t + 2600; pokes = []; feel('dizzy', 2600); chime('error');
      pokeMessage = L('Ouch! Too many taps… need a sec 😵', 'Ah! Çok fazla dokundun… başım döndü 😵'); pokeMessageUntil = t + 2600;
      if (mode === 'rest') setMode('compact', false);
    } else if (pokes.length >= 3) { angry = 1; feel('angry', 900); }
    else feel('surprised', 400);
  });
  setInterval(() => {
    angry = Math.max(0, angry - 0.12);
    dizzy = now() < dizzyUntil ? 1 : Math.max(0, dizzy - 0.15);
  }, 100);
  const startMessage = window.__lumadockCompactMessage;
  window.__lumadockCompactMessage = () => (now() < pokeMessageUntil ? pokeMessage : '') || startMessage?.() || '';

  // ---------- watch AI status ----------
  let lastState = null, lastDetail = '', wasFocus = focus.active();
  setInterval(() => {
    const status = window.__lumadockStatus?.(), state = status?.state || null;
    if (pointer.known && inside(pointer.x, pointer.y, islandBounds)) wake();
    if (state !== lastState) {
      if (state) wake();
      if (state === 'done') { chime('done'); jump(); countDone(status); if ((status.elapsed || 0) >= 300) confetti(); }
      if (state === 'question') chime('question');
      if (state === 'error') chime('error');
      lastState = state;
    }
    const detail = status?.detail || '';
    if (detail !== lastDetail && /Toegestaan|antwoord is verstuurd|Allowed|answer was sent/.test(detail)) { feel('heart', 1400); chime('pop'); bump('helper', 10, 'helper'); }
    lastDetail = detail;
    if (wasFocus && !focus.active()) {
      say(L('Focus complete!', 'Odak tamamlandı!'), L(`${clock(focusLength)} focused. Take a short break.`, `${clock(focusLength)} odaklandınız. Kısa bir mola verin.`));
      chime('party'); confetti(); jump(); feel('happy', 2000);
      bump('focus', 5, 'focus'); feed(10);
      window.__lumadockSettleSize?.();
    }
    wasFocus = focus.active();
    warnLimit();
  }, 300);

  function warnLimit() {
    const usage = window.__lumadockMonitor?.state()?.providers?.find(p => p.provider === 'claudecode')?.usage?.fiveHour;
    if (!usage || !prefs.warnAt) return;
    const level = usage.used >= 95 ? 95 : usage.used >= prefs.warnAt ? prefs.warnAt : 0;
    const key = `${usage.resetsAt || 'x'}:${level}`;
    if (!level || store.get('lumadock:limit-warned', '') === key) return;
    store.set('lumadock:limit-warned', key);
    const at = usage.resetsAt ? new Date(usage.resetsAt * 1000).toLocaleTimeString(isTr() ? 'tr-TR' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
    say(
      L(`You've used ${usage.used}% of your Claude limit`, `Claude limitinizin %${usage.used} kadarını kullandınız`),
      at ? L(`It resets at ${at}.`, `Saat ${at} itibarıyla yenilenecek.`) : L('Take it easy for a bit.', 'Biraz dinlenebilirsiniz.')
    );
    chime('warn'); feel('surprised', 1500);
  }

  // ---------- random life: blinking and occasional wink ----------
  let nextBlink = now() + 2500;
  function idleLife(t, mood) {
    if (!prefs.blink || mood) return mood;
    if (t > nextBlink) {
      if (t > nextBlink + 140) nextBlink = t + 2500 + Math.random() * 3500;
      else return Math.random() < 0.004 ? 'wink' : 'blink';
    }
    return null;
  }

  let danceDemoUntil = 0;
  const MOODS = { running: 'focus', sending: 'focus', question: 'curious', done: 'happy', error: 'sad', stopped: 'sad', unavailable: 'sad' };
  function fx() {
    const t = now(), status = window.__lumadockStatus?.();
    let dy = 0, tilt = 0, scale = 1;
    let mood = prefs.faces && !inLocker() ? (status?.permission ? 'surprised' : MOODS[status?.state] || null) : null;
    if (feeling && t < feelingUntil) mood = feeling;
    const hop = (t - bounceAt) / 700;
    if (hop >= 0 && hop < 1) { dy -= Math.abs(Math.sin(hop * Math.PI)) * 11 * (1 - hop * 0.5); scale = 1 + Math.sin(hop * Math.PI) * 0.06; }
    else if ((prefs.dance && spotifyState.is_playing && window.__lumadockHearing || now() < danceDemoUntil) && !mood) {
      const id = spotifyState.track?.id || spotifyState.track?.name || '';
      const move = [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % 4;
      if (move === 0) { dy -= Math.abs(Math.sin(t / 250)) * 3; tilt = Math.sin(t / 500) * 0.07; }
      if (move === 1) { tilt = Math.sin(t / 380) * 0.16; dy -= Math.abs(Math.sin(t / 380)) * 1.5; }
      if (move === 2) { dy -= Math.abs(Math.sin(t / 180)) * 4; scale = 1 + Math.abs(Math.sin(t / 180)) * 0.04; }
      if (move === 3) { tilt = Math.sin(t / 120) * 0.08; dy -= Math.abs(Math.sin(t / 240)) * 2; }
    }
    if (!mood && hungry() && prefs.faces) mood = 'sad';
    if (mood === 'sad') { dy += 2.2 + Math.sin(t / 320) * 0.8; tilt -= 0.05; }
    else if (mood === 'happy') { dy -= Math.abs(Math.sin(t / 160)) * 2.6; tilt += Math.sin(t / 320) * 0.06; }
    else if (mood === 'curious') { tilt += 0.12 + Math.sin(t / 280) * 0.05; }
    else if (mood === 'angry') { tilt += Math.sin(t / 35) * 0.045; dy += 1; }
    else if (mood === 'cool') { dy += Math.sin(t / 220) * 1.4; tilt += Math.sin(t / 440) * 0.04; }
    else if (mood === 'dizzy') { tilt += Math.sin(t / 150) * 0.14; dy += Math.cos(t / 150) * 1.6; }
    else if (mood === 'heart') { scale *= 1 + 0.04 * Math.pow(Math.sin(t / 155), 4); tilt += Math.sin(t / 310) * 0.05; }
    else if (mood === 'wink') { tilt += 0.08; }
    if (!mood && asleep()) { mood = 'sleep'; dy += Math.sin(t / 900) * 1.5; }
    else if (mood === 'sleep') { dy += Math.sin(t / 650) * 1.6; }
    mood = idleLife(t, mood);
    const pop = (t - popAt) / 420;
    if (pop >= 0 && pop < 1) scale *= 1 + 2.70158 * Math.pow(pop - 1, 3) + 1.70158 * Math.pow(pop - 1, 2);
    let sx = 1, sy = 1;
    if (showAt != null) {
      const k = t - showAt;
      if (k < 180) scale = 0;
      const land = spring(k - HELLO.land, 0.3, 3.2, 7);
      const hi = spring(k - HELLO.hi, -0.22, 3, 6);
      sx += land + hi; sy -= land + hi;
      const hop = (k - HELLO.hi) / 450; if (hop > 0 && hop < 1) dy -= Math.sin(hop * Math.PI) * 7;
      const hehe = (k - HELLO.tilt) / 600; if (hehe > 0 && hehe < 1) tilt += Math.sin(hehe * Math.PI * 2) * 0.22 * (1 - hehe);
    }
    if (byeAt != null) {
      const k = t - byeAt, pre = (k - (BYE.squash - 250)) / 250, zip = (k - BYE.squash) / 230;
      if (pre > 0 && pre < 1) { sx *= 1 + 0.25 * pre; sy *= 1 - 0.25 * pre; dy += 3 * pre; }
      if (zip > 0) { const z = Math.min(1, zip); scale *= Math.max(0, 1 - z * z); sx *= 1 - 0.35 * z; sy *= 1 + 0.5 * z; dy -= 4 * z; }
    }
    const b = window.__lumadockBasket?.(); if (b?.show) tilt += Math.max(-0.25, Math.min(0.25, b.vx * 0.03));
    return { dy, tilt, scale, sx, sy, mood };
  }
  window.__lumadockGhostFx = fx;

  // ---------- Cyber Wardrobe & Decor rendering ----------
  window.__lumadockGhostDecor = c => {
    const hk = showAt != null ? (now() - showAt - HELLO.hi - 120) / 900 : -1;
    if (hk > 0 && hk < 1) {
      c.save(); c.globalAlpha = hk < 0.7 ? 1 : 1 - (hk - 0.7) / 0.3; c.translate(20 + Math.sin(hk * 6) * 3, -34 - hk * 22); c.scale(1 + hk * 0.6, 1 + hk * 0.6);
      c.fillStyle = '#ff5ca8'; c.beginPath(); c.moveTo(0, 4); c.bezierCurveTo(-9, -3, -5, -11, 0, -6); c.bezierCurveTo(5, -11, 9, -3, 0, 4); c.fill(); c.restore();
    }
    const wear = outfit();
    c.save();
    if (wear === 'hat') {
      // Neon Halo: floating glowing cyber ring above the visor
      const hover = Math.sin(now() / 320) * 1.8;
      c.save();
      c.translate(0, -34 + hover);
      c.strokeStyle = '#00e5ff';
      c.shadowColor = '#00e5ff';
      c.shadowBlur = 12;
      c.lineWidth = 4;
      c.beginPath();
      c.ellipse(0, 0, 22, 5.5, 0, 0, Math.PI * 2);
      c.stroke();
      c.strokeStyle = '#ffffff';
      c.lineWidth = 1.4;
      c.beginPath();
      c.ellipse(0, 0, 22, 5.5, 0, 0, Math.PI);
      c.stroke();
      c.restore();
    }
    if (wear === 'shades') {
      // Cyber Visor shades: futuristic neon synthwave visor band on the forehead/visor rim
      const grad = c.createLinearGradient(-24, -22, 24, -12);
      grad.addColorStop(0, '#ff2a85');
      grad.addColorStop(0.5, '#7b2cbf');
      grad.addColorStop(1, '#00e5ff');
      c.fillStyle = grad;
      c.strokeStyle = '#ffffff';
      c.lineWidth = 1.5;
      c.shadowColor = '#00e5ff';
      c.shadowBlur = 8;
      c.beginPath();
      c.moveTo(-25, -21);
      c.lineTo(25, -21);
      c.lineTo(21, -11);
      c.lineTo(4, -11);
      c.lineTo(0, -15);
      c.lineTo(-4, -11);
      c.lineTo(-21, -11);
      c.closePath();
      c.fill();
      c.stroke();
      c.shadowBlur = 0;
    }
    if (wear === 'headphones') {
      // Holo Headset: glowing cyber-DJ headband + ear-cups + mic boom
      c.save();
      c.strokeStyle = '#1e293b';
      c.lineWidth = 5;
      c.lineCap = 'round';
      c.beginPath();
      c.arc(0, -2, 39, Math.PI * 1.12, Math.PI * 1.88);
      c.stroke();
      c.strokeStyle = '#38f8b2';
      c.lineWidth = 2;
      c.shadowColor = '#38f8b2';
      c.shadowBlur = 8;
      c.beginPath();
      c.arc(0, -2, 39, Math.PI * 1.2, Math.PI * 1.8);
      c.stroke();
      for (const side of [-1, 1]) {
        c.fillStyle = '#0f172a';
        c.strokeStyle = '#38f8b2';
        c.lineWidth = 2;
        c.beginPath();
        c.roundRect(side * 39 - 6, -10, 12, 22, 6);
        c.fill();
        c.stroke();
      }
      c.restore();
    }
    if (wear === 'horns') {
      // Mecha Horns: sleek glowing cyber-mecha crest fins
      c.save();
      for (const side of [-1, 1]) {
        const g = c.createLinearGradient(0, -24, side * 28, -48);
        g.addColorStop(0, '#1e293b');
        g.addColorStop(1, '#ff3b6b');
        c.fillStyle = g;
        c.strokeStyle = '#ff7aa2';
        c.lineWidth = 1.4;
        c.shadowColor = '#ff3b6b';
        c.shadowBlur = 8;
        c.beginPath();
        c.moveTo(side * 12, -25);
        c.lineTo(side * 28, -46);
        c.lineTo(side * 24, -22);
        c.closePath();
        c.fill();
        c.stroke();
      }
      c.restore();
    }
    if (wear === 'crown') {
      // Cyber Crown: holographic gold & cyan geometric crown
      const gold = '#ffd23f';
      c.beginPath();
      c.moveTo(-20, -25);
      c.lineTo(-22, -44);
      c.lineTo(-10, -34);
      c.lineTo(0, -49);
      c.lineTo(10, -34);
      c.lineTo(22, -44);
      c.lineTo(20, -25);
      c.closePath();
      c.fillStyle = gold;
      c.shadowColor = gold;
      c.shadowBlur = 12;
      c.fill();
      c.shadowBlur = 0;
      c.fillStyle = '#00e5ff';
      c.beginPath();
      c.arc(0, -33, 3.6, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#ff3b6b';
      c.beginPath();
      c.arc(-11, -30, 2.2, 0, Math.PI * 2);
      c.arc(11, -30, 2.2, 0, Math.PI * 2);
      c.fill();
    }
    if (wear === 'santa') {
      c.beginPath(); c.moveTo(-24, -24); c.quadraticCurveTo(-6, -66, 26, -50); c.lineTo(20, -24); c.closePath();
      c.fillStyle = '#e63946'; c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.roundRect(-26, -30, 50, 9, 4.5); c.fill();
      c.beginPath(); c.arc(27, -50, 6, 0, Math.PI * 2); c.fill();
    }
    if (wear === 'witch') {
      c.fillStyle = '#2b1d3a'; c.beginPath(); c.ellipse(0, -26, 34, 6, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.moveTo(-16, -27); c.lineTo(16, -27); c.lineTo(10, -54); c.lineTo(20, -66); c.lineTo(2, -56); c.closePath(); c.fill();
      c.fillStyle = '#ff9a1f'; c.fillRect(-15, -33, 30, 5);
    }
    const curMood = fx().mood;
    if (curMood === 'sleep') {
      c.fillStyle = '#00e5ff'; c.font = '700 16px Arial';
      const t = now() / 1000;
      ['z', 'Z', 'Z'].forEach((letter, i) => { const k = (t * 0.5 + i / 3) % 1; c.globalAlpha = 1 - k; c.fillText(letter, 30 + k * 18, -20 - k * 34); });
    } else if (curMood === 'heart') {
      const t = now() / 1000;
      for (let i = 0; i < 2; i++) {
        const k = (t * 0.65 + i * 0.5) % 1;
        c.save(); c.globalAlpha = 1 - k; c.translate((i === 0 ? 32 : -32) + Math.sin(k * 5 + i) * 4, -18 - k * 28); c.scale(0.65 + k * 0.35, 0.65 + k * 0.35);
        c.fillStyle = '#ff4d88'; c.beginPath(); c.moveTo(0, 4); c.bezierCurveTo(-8, -2, -5, -10, 0, -5); c.bezierCurveTo(5, -10, 8, -2, 0, 4); c.fill(); c.restore();
      }
    }
    if (focus.active() && mode !== 'expanded' && !previewing) {
      const part = 1 - focus.left() / focusLength;
      c.globalAlpha = 1; c.lineWidth = 5; c.lineCap = 'round';
      c.beginPath(); c.arc(0, 0, 50, 0, Math.PI * 2); c.strokeStyle = 'rgba(255,255,255,.12)'; c.stroke();
      c.beginPath(); c.arc(0, 0, 50, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * part); c.strokeStyle = '#00e5ff'; c.stroke();
    }
    const hand = (x, y, angle = 0) => {
      const look = window.__lumadockLook?.() || {};
      c.save(); c.translate(x, y); c.rotate(angle); c.globalAlpha = 1;
      c.beginPath(); c.ellipse(0, 0, 8, 10, 0, 0, Math.PI * 2); c.fillStyle = look.shell1 || '#f2f7ff'; c.fill();
      c.beginPath(); c.ellipse(-6, 3, 3.5, 4.5, -0.6, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(0, 0, 8, 10, 0, 0, Math.PI * 2); c.stroke();
      c.restore();
    };
    if (waving()) hand(50, -14, Math.sin(now() / 85) * 0.55);
    const b = window.__lumadockBasket?.();
    if (b?.show) {
      c.save(); c.translate(0, 48); c.rotate(b.wobble * 0.3); c.globalAlpha = 1;
      c.beginPath(); c.moveTo(-36, -8); c.lineTo(36, -8); c.lineTo(26, 24); c.lineTo(-26, 24); c.closePath();
      const wood = c.createLinearGradient(0, -8, 0, 24); wood.addColorStop(0, '#c98d4a'); wood.addColorStop(1, '#8a5a2b'); c.fillStyle = wood; c.fill();
      c.strokeStyle = 'rgba(70,40,15,.55)'; c.lineWidth = 2;
      for (const y of [2, 12]) { c.beginPath(); c.moveTo(-33 + (y + 8) * 0.3, y); c.lineTo(33 - (y + 8) * 0.3, y); c.stroke(); }
      for (const x of [-20, -7, 7, 20]) { c.beginPath(); c.moveTo(x, -8); c.lineTo(x * 0.75, 24); c.stroke(); }
      c.beginPath(); c.roundRect(-39, -13, 78, 8, 4); c.fillStyle = '#d9a05c'; c.fill();
      c.restore();
      hand(-38, 38, 0.4); hand(38, 38, -0.4);
    }
    c.restore();
  };

  // ---------- Settings: make LumaDock yours (Bilingual EN + TR) ----------
  const style = document.createElement('style');
  style.textContent = `
#lumadock-settings-v2 .tc-group{margin:14px 2px 6px;color:#c6e994;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
#lumadock-settings-v2 .tc-chips{display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end;max-width:62%}
#lumadock-settings-v2 .tc-chip{border:0;border-radius:12px;padding:6px 10px;background:#262e23;color:#dfe7da;font-size:10px}
#lumadock-settings-v2 .tc-chip.on{background:#c6e994;color:#11180d;font-weight:700}
#lumadock-settings-v2 .tc-swatch{width:22px;height:22px;border-radius:50%;border:2px solid transparent;padding:0}
#lumadock-settings-v2 .tc-swatch.on{border-color:#fff;box-shadow:0 0 0 2px #c6e994}
#lumadock-settings-v2 .tc-lights{flex-direction:column;align-items:stretch !important;gap:8px}
#lumadock-settings-v2 .tc-lights-head{display:flex;flex-direction:column;gap:8px}
#lumadock-settings-v2 .tc-lights-head .tc-chips,#lumadock-settings-v2 .tc-light-line .tc-chips{justify-content:flex-start;max-width:none}
#lumadock-settings-v2 .tc-light-line{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 10px;border-radius:10px;background:rgba(255,255,255,.03)}
#lumadock-settings-v2 .tc-light-line > span{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:600;color:#dfe7da;white-space:nowrap}
#lumadock-settings-v2 .tc-light-line > span i{width:10px;height:10px;border-radius:50%;display:block}
#lumadock-settings-v2 .tc-light-line .tc-swatch{width:20px;height:20px}
#lumadock-settings-v2 .tc-tests{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:8px 0 4px}
#lumadock-settings-v2 .tc-tests .tc-chip{padding:9px 8px;font-size:11px;border-radius:11px}
#lumadock-settings-v2 .tc-name{width:140px;font-size:12px;font-weight:600}
#lumadock-settings-v2 .tc-step{display:flex;align-items:center;gap:6px}
#lumadock-settings-v2 .tc-step b{min-width:46px;text-align:center;font-size:12px}
#lumadock-settings-v2 .tc-input{width:170px;border:1px solid #4b5943;border-radius:10px;padding:6px 9px;background:#1b2219;color:#f0f5ed;font-size:10px;user-select:text}
#lumadock-settings-v2 .tc-badges{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px}
#lumadock-settings-v2 .tc-badge{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 6px;border-radius:12px;background:#121611;opacity:.55;text-align:center}
#lumadock-settings-v2 .tc-badge.on{opacity:1;background:#1d2619;box-shadow:inset 0 0 0 1px #c6e994}
#lumadock-settings-v2 .tc-badge span{font-size:18px}
#lumadock-settings-v2 .tc-badge b{font-size:10px}
#lumadock-settings-v2 .tc-badge small{font-size:8px;color:#aab4a5}
#lumadock-settings-v2 .tc-preview{display:inline-flex;gap:3px;margin-right:6px;vertical-align:middle}
#lumadock-settings-v2 .tc-preview i{width:5px;height:8px;border-radius:50%;display:block}`;
  document.head.appendChild(style);

  const esc = s => String(s).replace(/[&<>"]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[x]));
  const row = (title, help, control, demo = '') => `<div class="tc-setting-row${demo ? ' tc-demo' : ''}"${demo ? ` data-demo="${demo}"` : ''}><div><strong>${title}</strong><small>${help}</small></div>${control}</div>`;
  const chips = (key, options) => `<div class="tc-chips">${options.map(([value, label, locked]) =>
    `<button type="button" class="tc-chip ${prefs[key] === value ? 'on' : ''}" data-pref="${key}" data-value="${esc(value)}" ${locked ? `disabled title="${L('Not earned yet', 'Henüz kazanılmadı')}"` : ''}>${locked ? '🔒 ' : ''}${label}</button>`).join('')}</div>`;
  const toggle = key => `<button type="button" class="tc-toggle ${prefs[key] ? 'on' : ''}" data-pref="${key}" data-toggle="1" aria-pressed="${prefs[key]}">${prefs[key] ? L('On', 'Açık') : L('Off', 'Kapalı')}</button>`;
  const swatches = (key, colours, labelsMap) => `<div class="tc-chips">${Object.entries(colours).map(([name, c]) => {
    const label = labelsMap?.[name] ? L(labelsMap[name][0], labelsMap[name][1]) : name;
    return `<button type="button" class="tc-swatch ${prefs[key] === name ? 'on' : ''}" style="background:${Array.isArray(c) ? `linear-gradient(135deg,${c[0]},${c[1]})` : c}" data-pref="${key}" data-value="${name}" title="${esc(label)}" aria-label="${esc(label)}"></button>`;
  }).join('')}</div>`;
  const preview = p => `<span class="tc-preview">${[p.busy, p.done, p.error].map(c => `<i style="background:${c};box-shadow:0 0 6px ${c}"></i>`).join('')}</span>`;

  const LIGHT_OPTIONS = {
    lightBusy: ['#ff9a1f', '#ffb000', '#ffd23f', '#ff6b9d', '#c9a7ff', '#00e5ff'],
    lightDone: ['#22e05a', '#38f8b2', '#c6e994', '#00e5ff', '#3d9bff', '#ffffff'],
    lightError: ['#ff3b3b', '#ff8a8a', '#e11d48', '#ff6b00', '#ff5ac8', '#b04bff']
  };
  const LIGHT_PRESETS = {
    klassiek: ['#ff9a1f', '#22e05a', '#ff3b3b', 'Classic', 'Klasik'],
    zacht: ['#ffc27a', '#8ef0a8', '#ff8a8a', 'Soft', 'Yumuşak'],
    kleurenblind: ['#ffb000', '#3d9bff', '#ff5ac8', 'High Contrast', 'Yüksek Kontrast']
  };
  const lightsBlock = () => `<div class="tc-setting-row tc-demo tc-lights" data-demo="lights"><div class="tc-lights-head"><div><strong>${L('Status Visor Colours', 'Durum Vizör Renkleri')}</strong><small>${L('Pick the eye colour for each AI status. Click to test.', 'Her yapay zeka durumu için göz rengini seçin. Test için tıklayın.')}</small></div>
    <div class="tc-chips">${Object.entries(LIGHT_PRESETS).map(([k, [b, d, e, enL, trL]]) => `<button type="button" class="tc-chip ${prefs.lightBusy === b && prefs.lightDone === d && prefs.lightError === e ? 'on' : ''}" data-lightpreset="${k}">${preview({ busy: b, done: d, error: e })}${L(enL, trL)}</button>`).join('')}</div></div>
    ${[['lightBusy', L('Busy or question', 'Meşgul veya soru')], ['lightDone', L('Done', 'Tamamlandı')], ['lightError', L('Error', 'Hata')]].map(([key, label]) => `<div class="tc-light-line"><span><i style="background:${prefs[key]};box-shadow:0 0 8px ${prefs[key]}"></i>${label}</span><div class="tc-chips">${LIGHT_OPTIONS[key].map(c => `<button type="button" class="tc-swatch ${prefs[key] === c ? 'on' : ''}" style="background:${c}" data-pref="${key}" data-value="${c}" aria-label="${label}: ${c}"></button>`).join('')}</div></div>`).join('')}</div>`;

  const ALL_MOODS = ['happy', 'focus', 'curious', 'surprised', 'angry', 'cool', 'wink', 'heart', 'sad', 'dizzy', 'sleep'];
  const MOOD_DEMO = () => [
    ['all', L('▶️ Play All', '▶️ Tümünü Oynat')],
    ['happy', L('😊 Happy', '😊 Mutlu')],
    ['focus', L('🎯 Focused', '🎯 Odaklı')],
    ['curious', L('🤨 Curious', '🤨 Meraklı')],
    ['surprised', L('✨ Surprised', '✨ Şaşkın')],
    ['angry', L('😠 Glare', '😠 Kızgın')],
    ['cool', L('😎 Cool', '😎 Havalı')],
    ['wink', L('😉 Wink', '😉 Göz Kırpma')],
    ['heart', L('😍 Lovely', '😍 Sevgi Dolu')],
    ['sad', L('😢 Sad', '😢 Üzgün')],
    ['dizzy', L('😵 Dizzy', '😵 Baş Dönmesi')],
    ['sleep', L('😴 Standby', '😴 Uyku Modu')]
  ];

  window.__lumadockSettingsCharacter = (sleepRow = '') => [
    `<div class="tc-group" data-icon="🏷️" style="--g:#5ad1c4">${L('Name', 'İsim')}</div>`,
    row(L('What is his name?', 'Onun adı ne?'), L('Shown in the greeting and status cards', 'Karşılama ve durum kartlarında görünür'), `<div class="tc-step"><input class="tc-input tc-name" id="tc-in-petname" maxlength="18" placeholder="LumaDock" value="${esc(prefs.name || '')}"><button type="button" class="tc-chip on" data-setname="1">${L('Save', 'Kaydet')}</button></div>`),
    `<div class="tc-group" data-icon="🎨" style="--g:#ff86c2">${L('Appearance', 'Görünüm')}</div>`,
    row(L('Visor Eye Colour', 'Vizör Göz Rengi'), L('Default OLED eye glow when idle', 'Boştayken varsayılan OLED göz parıltısı'), swatches('eye', EYES, EYE_LABELS), 'look'),
    row(L('Chassis Finish', 'Gövde Kaplaması'), L('Choose your Cyber-Bot shell colour', 'Siber-Bot gövde rengini seçin'), swatches('body', BODIES, BODY_LABELS), 'look'),
    lightsBlock(),
    row(L('Wardrobe Gear', 'Gardırop Ekipmanı'), L(`${doneCount} tasks done. Earn more gear by finishing tasks.`, `${doneCount} görev tamamlandı. Görevleri bitirerek yeni ekipmanlar açın.`),
      chips('outfit', [['auto', L('Best', 'En İyi')], ['geen', L('None', 'Yok')], ...OUTFITS.map(o => [o.id, outfitName(o), !unlocked(o.id)])]), 'look'),
    row(L('Seasonal Gear', 'Mevsimsel Ekipmanlar'), L('Festive hats on holidays and special dates', 'Yılbaşı ve özel günlerde otomatik kutlama şapkaları'), toggle('seasonal'), 'look'),
    `<div class="tc-group" data-icon="🤖" style="--g:#7fb2ff">${L('Behaviour · click a row to preview', 'Davranış · önizlemek için bir satıra tıklayın')}</div>`,
    row(L('Visor Expressions', 'Yüz İfadeleri'), L('Dynamic OLED visor eyes for every mood', 'Her duruma özel dinamik OLED vizör ifadeleri'), toggle('faces'), 'faces'),
    row(L('Preview Expressions', 'İfadeleri Dene'), L('Click any expression to test it on the visor', 'Vizörde görmek için bir ifadeye tıklayın'), `<div class="tc-chips">${MOOD_DEMO().map(([m, label]) => `<button type="button" class="tc-chip" data-mood="${m}">${label}</button>`).join('')}</div>`),
    row(L('Blinking', 'Göz Kırpma'), L('Natural OLED eyelid blinks and occasional winks', 'Doğal OLED göz kırpma ve ara sıra selam verme'), toggle('blink'), 'blink'),
    row(L('Dance to Music', 'Müzikle Dans Et'), L('Moves to the beat while Spotify is playing', 'Spotify çalarken ritme göre hareket eder'), toggle('dance'), 'dance'),
    sleepRow,
    row(L('Standby After', 'Uyku Modu Süresi'), L('Enters sleep mode when idle (Sleep effect must be on)', 'Boşta kaldığında uyku moduna geçer (Uyku efekti açık olmalı)'), chips('sleepMin', [[5, L('5 min', '5 dk')], [10, L('10 min', '10 dk')], [30, L('30 min', '30 dk')]]), 'sleep'),
    row(L('Startup Animation', 'Başlangıç Animasyonu'), L('Waves and chirps when LumaDock launches', 'LumaDock açıldığında el sallar ve selam verir'), toggle('startup'), 'hello'),
    row(L('Energy & Hunger', 'Enerji & Açlık'), prefs.hunger ? L(`${petName()} is ${window.__lumadockHunger?.() ?? 0}% charged. Every finished task recharges 🍪`, `${petName()} %${window.__lumadockHunger?.() ?? 0} dolu. Her tamamlanan görev enerji verir 🍪`) : L('Gets hungry when no tasks are finished for a while', 'Uzun süre görev tamamlanmadığında acıkır'), toggle('hunger'), 'hunger'),
    `<div class="tc-group" data-icon="🏆" style="--g:#ffc93c">${L('Achievements', 'Başarımlar')} · ${badges.size}/${BADGES.length}</div>`,
    `<div class="tc-badges">${BADGES.map(b => `<div class="tc-badge ${badges.has(b.id) ? 'on' : ''}" title="${esc(L(b.howEn, b.howTr))}"><span>${badges.has(b.id) ? b.icon : '🔒'}</span><b>${esc(L(b.nameEn, b.nameTr))}</b><small>${esc(L(b.howEn, b.howTr))}</small></div>`).join('')}</div>`,
  ].join('');

  window.__lumadockLocker = () => ({ name: petName(), done: doneCount, badges: badges.size, total: BADGES.length });

  // Settings → General
  const TESTS = () => [
    ['hello', L('👋 Start up', '👋 Başlangıç')],
    ['bye', L('😴 Shut down', '😴 Kapanış')],
    ['busy', L('🟠 AI working', '🟠 YZ çalışıyor')],
    ['question', L('❓ AI asks', '❓ YZ soruyor')],
    ['done', L('🟢 AI done', '🟢 YZ tamamlandı')],
    ['error', L('🔴 AI error', '🔴 YZ hatası')],
    ['music', L('🎵 Demo music', '🎵 Demo müzik')],
    ['focus', L('⏱️ Focus 1 min', '⏱️ Odak 1 dk')],
    ['clear', L('🧹 Stop all', '🧹 Tümünü durdur')]
  ];
  window.__lumadockSettingsExtra = () => [
    `<div class="tc-group" data-icon="🌍" style="--g:#7fb2ff">${L('Language', 'Dil')}</div>`,
    row(L('Language · Dil', 'Dil · Language'), L('Interface language for the island and settings', 'Ada ve ayarlar penceresinin arayüz dili'), chips('lang', [['en', 'English'], ['tr', 'Türkçe']])),
    `<div class="tc-group" data-icon="🧪" style="--g:#b98cff">${L('Testing', 'Test Modu')}</div>`,
    row(L('Test Mode', 'Test Modu'), L('Try all MCP Robot visor expressions and island states live', 'Tüm MCP Robot yüz ifadelerini ve ada durumlarını canlı test edin'), toggle('testMode')),
    prefs.testMode ? [
      `<div class="tc-group" data-icon="🤖" style="--g:#00e5ff">${L('MCP Robot Visor Expressions · Live Test', 'MCP Robot Yüz İfadeleri · Canlı Test')}</div>`,
      `<div class="tc-tests">${MOOD_DEMO().map(([m, label]) => `<button type="button" class="tc-chip${m === 'all' ? ' on' : ''}" data-mood="${m}">${label}</button>`).join('')}</div>`,
      `<div class="tc-group" data-icon="⚡" style="--g:#c6e994">${L('Island States · Live Test', 'Ada Durumları · Canlı Test')}</div>`,
      `<div class="tc-tests">${TESTS().map(([k, label]) => `<button type="button" class="tc-chip" data-test="${k}">${label}</button>`).join('')}</div>`
    ].join('') : '',
    `<div class="tc-group" data-icon="✨" style="--g:#ffb35c">${L('Animations', 'Animasyonlar')}</div>`,
    row(L('Speed', 'Hız'), L('How fast the island expands, collapses and reacts', 'Adanın açılma, kapanma ve tepki verme hızı'), chips('speed', [['snel', L('Fast', 'Hızlı')], ['normaal', L('Normal', 'Normal')]])),
    row(L('App Transitions', 'Uygulama Geçişleri'), L('Smooth blur and bounce transitions when switching views', 'Ekranlar arasında yumuşak geçiş animasyonları'), toggle('appAnim')),
    row(L('Confetti', 'Konfeti'), L('Celebrate long tasks, completed focus sessions and new gear', 'Uzun görevler, biten odak oturumları ve yeni ekipmanlarda kutlama'), toggle('confetti'), 'confetti'),
    `<div class="tc-group" data-icon="🔔" style="--g:#ff6b6b">${L('Focus & Notifications', 'Odak & Bildirimler')}</div>`,
    row(L('Status Chimes', 'Durum Sesleri'), L('Audio cues when tasks finish, ask a question or fail', 'Görev bittiğinde, soru sorduğunda veya hata verdiğinde ses çal'), toggle('chimes'), 'chimes'),
    row(L('Windows Notifications', 'Windows Bildirimleri'), L('Desktop notifications for completed tasks, questions and focus', 'Tamamlanan görev, soru, odak ve limit için masaüstü bildirimi'), toggle('notify')),
    row(L('Usage Limit Warning', 'Limit Uyarısı'), L('Warn when your 5-hour AI usage reaches this threshold', '5 saatlik kullanım limitiniz bu seviyeye ulaştığında uyar'), chips('warnAt', [[70, '70%'], [80, '80%'], [90, '90%'], [0, L('Never', 'Asla')]])),
    row(L('Sound Pack', 'Ses Paketi'), L('Choose how the synth chimes sound (click to preview)', 'Durum seslerinin tonunu seçin (dinlemek için tıklayın)'), chips('pack', Object.entries(PACKS).map(([k, p]) => [k, L(p.labelEn, p.labelTr)]))),
    `<div class="tc-group" data-icon="🏝️" style="--g:#c6e994">${L('Island Extras', 'Ada Ekstraları')}</div>`,
    row(L('Weather', 'Hava Durumu'), extrasCfg.city ? L(`Current: ${esc(extrasCfg.city)}`, `Şu an: ${esc(extrasCfg.city)}`) : L('Enter your city to show live weather on the home screen', 'Ana ekranda hava durumunu görmek için şehrinizi yazın'),
      `<div class="tc-step"><input class="tc-input" id="tc-in-city" maxlength="80" placeholder="${L('e.g. Istanbul', 'Örn. İstanbul')}" value="${esc(extrasCfg.city || '')}"><button type="button" class="tc-chip" data-pref="city" data-save="1">${L('Save', 'Kaydet')}</button></div>`),
    row(L('Calendar', 'Takvim'), extrasCfg.calendarUrl ? L('Connected: your next event is shown on the home screen', 'Bağlı: sıradaki etkinliğiniz ana ekranda gösterilir') : L('Paste a private iCal (.ics) URL to show upcoming events', 'Yaklaşan etkinlikleri görmek için gizli iCal (.ics) bağlantınızı yapıştırın'),
      `<div class="tc-step"><input class="tc-input" id="tc-in-calendarUrl" maxlength="2000" placeholder="https://… .ics" value="${esc(extrasCfg.calendarUrl || '')}"><button type="button" class="tc-chip" data-pref="calendarUrl" data-save="1">${L('Save', 'Kaydet')}</button></div>`),
    extrasError ? `<p class="tc-ai-error" role="alert">${esc(extrasError)}</p>` : '',
    row(L('Volume HUD', 'Ses Çubuğu'), L('Display the volume bar inside the island when adjusting audio', 'Sesi değiştirdiğinizde adada ses seviyesini göster'), toggle('volumeHud')),
    row(L('Battery Warning', 'Pil Uyarısı'), L('Warn when laptop or Bluetooth device battery is low', 'Bilgisayar veya Bluetooth cihazlarının pili azaldığında uyar'), toggle('batteryWarn')),
    `<div class="tc-setting-row"><div><strong>${L('Reset Defaults', 'Varsayılanlara Sıfırla')}</strong><small>${L('Restore all preferences to their original settings', 'Tüm tercihleri varsayılan değerlerine döndür')}</small></div><button type="button" class="tc-toggle" data-pref="reset">${L('Reset', 'Sıfırla')}</button></div>`,
    `<div class="tc-group" data-icon="⏻" style="--g:#ff8a8a">LumaDock</div>`,
    row(L('Start with Windows', 'Windows ile Başlat'), L('Launch LumaDock automatically when you sign in to Windows', 'Bilgisayarınızı açtığınızda LumaDock otomatik başlasın'), `<button type="button" class="tc-toggle ${loginOn ? 'on' : ''}" data-login="1" aria-pressed="${loginOn}">${loginOn ? L('On', 'Açık') : L('Off', 'Kapalı')}</button>`),
    row(L('Restart LumaDock', 'Yeniden Başlat'), L('Close LumaDock and relaunch immediately', 'LumaDock\'u kapatıp hemen yeniden başlatır'), `<button type="button" class="tc-chip" data-restart="1">${L('Restart', 'Yeniden Başlat')}</button>`),
    row(L('Quit LumaDock', 'Çıkış Yap'), L('Close LumaDock completely (also available in the system tray)', 'LumaDock\'u tamamen kapatır (saatin yanındaki simgeden de yapılabilir)'), `<button type="button" class="tc-chip" data-quit="1">${L('Quit', 'Çıkış')}</button>`)
  ].join('');

  const later = (ms, fn) => setTimeout(fn, ms);
  let moodTimers = [];
  function playAllMoods() {
    moodTimers.forEach(clearTimeout);
    moodTimers = ALL_MOODS.map((m, i) => later(i * 1600, () => { feel(m, 1550); jump(); chime('pop'); }));
  }
  const DEMOS = {
    look: () => { jump(); feel('happy', 900); chime('pop'); },
    lights: () => { lightsDemoAt = now(); chime('pop'); },
    faces: () => playAllMoods(),
    blink: () => [0, 450, 900].forEach(ms => later(ms, () => feel('blink', 160))),
    dance: () => { danceDemoUntil = now() + 3200; },
    sleep: () => { feel('sleep', 3200); chime('pop'); },
    hello: () => { sayHi(); jump(); feel('happy', 1300); waveUntil = now() + 1300; },
    hunger: () => { feel('sad', 1800); later(1900, () => { jump(); feel('happy', 900); }); },
    confetti: () => { confetti(30); jump(); feel('happy', 900); },
    chimes: () => chime('done')
  };
  window.__lumadockDemo = name => { if (drafting) previewDemo(name); else DEMOS[name]?.(); };

  // ---------- test mode ----------
  let fakeMusicUntil = 0;
  function fakeMusic() {
    const realRefresh = window.__lumadockRealRefresh || refreshSpotify;
    window.__lumadockRealRefresh = realRefresh;
    refreshSpotify = async () => {};
    const c = document.createElement('canvas'); c.width = c.height = 200; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 200, 200); gr.addColorStop(0, '#00e5ff'); gr.addColorStop(1, '#3d1a8e'); g.fillStyle = gr; g.fillRect(0, 0, 200, 200);
    g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(100, 100, 46, 0, Math.PI * 2); g.fill();
    albumImage = new Image(); albumImage.src = c.toDataURL(); window.__lumadockAlbumColour = '#00e5ff';
    spotifyConnected = true; spotifyState = { is_playing: true, progress_ms: 0, duration_ms: 210000, track: { name: L('Cyber Synth Demo', 'Siber Synth Demo'), artist: 'LumaDock', id: 'test' } }; spotifySyncAt = performance.now();
    fakeMusicUntil = now() + 30000; window.__lumadockSettleSize?.();
    setTimeout(() => { if (now() >= fakeMusicUntil) stopFakeMusic(); }, 30100);
  }
  function stopFakeMusic() {
    fakeMusicUntil = 0;
    if (window.__lumadockRealRefresh) { refreshSpotify = window.__lumadockRealRefresh; window.__lumadockRealRefresh = null; }
    spotifyState = { is_playing: false, track: null }; albumImage = null; window.__lumadockAlbumColour = null; refreshSpotify(); window.__lumadockSettleSize?.();
  }
  function runTest(kind) {
    const claude = k => window.lumadock?.aiMonitorHooksTest?.(k, isTr() ? 'tr' : 'en').then(() => window.__lumadockMonitor?.refresh()).catch(() => {});
    if (kind === 'hello') startHello();
    else if (kind === 'bye') { window.__lumadockBye(); setTimeout(() => { byeAt = null; jump(); feel('happy', 900); }, BYE.end + 500); }
    else if (kind === 'music') fakeMusic();
    else if (kind === 'focus') focus.start(60);
    else if (kind === 'clear') { claude('clear'); if (fakeMusicUntil) stopFakeMusic(); if (focus.active()) focus.stop(); }
    else if (kind === 'hungry') { food = { value: 12, at: Date.now() }; store.set('lumadock:food', food); }
    else claude(kind);
  }
  window.__lumadockTest = runTest;

  let extrasCfg = {}, extrasError = '';
  const rerender = () => window.dispatchEvent(new Event('lumadock:open-ai-settings'));
  window.lumadock?.extrasConfig?.().then(r => { if (r.ok) extrasCfg = r.config; }).catch(() => {});
  let loginOn = false;
  window.lumadock?.loginGet?.().then(r => { if (r?.ok) loginOn = r.on; }).catch(() => {});
  window.__lumadockSettingsAction = target => {
    if (target.dataset.quit) { window.lumadock?.close?.(); return true; }
    if (target.dataset.restart) { window.lumadock?.restart?.(); return true; }
    if (target.dataset.login) { window.lumadock?.loginSet?.(!loginOn).then(r => { if (r?.ok) loginOn = r.on; rerender(); }).catch(() => {}); return true; }
    if (target.dataset.mood) {
      moodTimers.forEach(clearTimeout); moodTimers = [];
      if (target.dataset.mood === 'all') { playAllMoods(); return true; }
      feel(target.dataset.mood, 4500); jump(); chime('pop'); return true;
    }
    if (target.dataset.test) { runTest(target.dataset.test); return true; }
    if (target.dataset.setname) {
      prefs.name = (document.getElementById('tc-in-petname')?.value || '').trim().slice(0, 18) || 'LumaDock'; save();
      jump(); feel('heart', 1400); chime('pop'); return true;
    }
    if (target.dataset.lightpreset) {
      const [b, d, e] = LIGHT_PRESETS[target.dataset.lightpreset]; Object.assign(prefs, { lightBusy: b, lightDone: d, lightError: e }); save();
      if (!drafting) lightsDemoAt = now(); return true;
    }
    const key = target.dataset.pref; if (!key) return false;
    if (target.dataset.save) {
      const value = document.getElementById('tc-in-' + key)?.value || '';
      window.lumadock.extrasConfig({ [key]: value }).then(r => {
        extrasError = r.ok ? '' : r.error; if (r.ok) extrasCfg = r.config;
        window.__lumadockRefreshInfo?.(); rerender();
      });
      return true;
    }
    if (key === 'reset') Object.assign(prefs, DEFAULTS);
    else if (target.dataset.toggle) prefs[key] = !prefs[key];
    else if (target.dataset.step) prefs[key] = Math.min(120, Math.max(5, prefs[key] + Number(target.dataset.step)));
    else { const raw = target.dataset.value; prefs[key] = typeof DEFAULTS[key] === 'number' ? Number(raw) : raw; }
    save();
    if (key === 'eye' || key === 'body' || key === 'palette' || key === 'outfit' || key === 'seasonal') { jump(); feel('happy', 700); }
    if (key === 'pack') chime('done');
    if (/^light(Busy|Done|Error)$/.test(key) && !drafting) lightPreview = { color: prefs[key], until: now() + 1400 };
    return true;
  };

  // ---------- LumaDock Settings preview & draft handling ----------
  let previewing = false;
  const later2 = (ms, fn) => setTimeout(fn, ms);
  const pFeel = (mood, ms) => { pv.feeling = mood; pv.feelingUntil = now() + ms; };
  function previewDemo(name) {
    const hop = () => { pv.bounceAt = now(); };
    ({
      look: () => { hop(); pFeel('happy', 900); },
      lights: () => { hop(); pFeel('happy', 700); },
      faces: () => playAllMoods(),
      blink: () => [0, 450, 900].forEach(ms => later2(ms, () => pFeel('blink', 160))),
      dance: () => { pv.danceUntil = now() + 3200; },
      sleep: () => pFeel('sleep', 3200),
      hello: () => { hop(); pFeel('happy', 1300); pv.waveUntil = now() + 1300; },
      hunger: () => { pFeel('sad', 1800); later2(1900, () => { hop(); pFeel('happy', 900); }); },
      confetti: () => { hop(); pFeel('happy', 900); },
      chimes: () => { chime('done'); pFeel('happy', 700); }
    })[name]?.();
  }
  window.__lumadockPreviewPrefs = p => { pv.prefs = p ? { ...p } : null; };
  window.__lumadockRealPrefs = () => ({ ...prefs });
  window.__lumadockWithDraft = (draft, fn) => {
    const real = { ...prefs };
    for (const k of Object.keys(prefs)) delete prefs[k];
    Object.assign(prefs, draft); drafting = true;
    try { return fn(); }
    finally {
      const out = { ...prefs };
      for (const k of Object.keys(prefs)) delete prefs[k];
      Object.assign(prefs, real); drafting = false;
      for (const k of Object.keys(draft)) delete draft[k];
      Object.assign(draft, out);
    }
  };
  window.__lumadockSaveDraft = draft => { Object.assign(prefs, draft); save(); jump(); feel('happy', 1400); chime('pop'); };
  window.__lumadockDrawPreview = draw => {
    const keep = { prefs: { ...prefs }, feeling, feelingUntil, bounceAt, danceDemoUntil, waveUntil, showAt, byeAt, popAt, nextBlink, lastWake,
      spotify: spotifyState, angry: typeof angry === 'number' ? angry : 0, dizzy: typeof dizzy === 'number' ? dizzy : 0, basket: window.__lumadockBasket, locker: window.__lumadockLockerDraw };
    if (pv.prefs) Object.assign(prefs, pv.prefs);
    feeling = pv.feeling; feelingUntil = pv.feelingUntil; bounceAt = pv.bounceAt; danceDemoUntil = pv.danceUntil;
    waveUntil = pv.waveUntil; showAt = null; byeAt = null; popAt = -1e9; nextBlink = pv.nextBlink || now() + 2000; lastWake = Date.now();
    spotifyState = { is_playing: false, track: null }; angry = 0; dizzy = 0; window.__lumadockBasket = null; window.__lumadockLockerDraw = true;
    previewing = true;
    try { draw(); }
    finally {
      previewing = false; pv.nextBlink = nextBlink;
      for (const k of Object.keys(prefs)) delete prefs[k];
      Object.assign(prefs, keep.prefs);
      ({ feeling, feelingUntil, bounceAt, danceDemoUntil, waveUntil, showAt, byeAt, popAt, nextBlink, lastWake } = keep);
      spotifyState = keep.spotify; angry = keep.angry; dizzy = keep.dizzy; window.__lumadockBasket = keep.basket; window.__lumadockLockerDraw = keep.locker;
    }
  };
})();
