'use strict';
// Spotify screen: album cover, song, progress bar (click to jump) and previous / play-pause / next.
// Replaces the old drawSpotify in mascot.html, which only showed the song title.
(function spotifyScreen() {
  const api = window.lumadock;
  const isTr = () => {
    try {
      const p = JSON.parse(localStorage.getItem('lumadock:prefs') || '{}');
      return p.lang === 'tr';
    } catch { return false; }
  };
  const L = (en, tr) => (isTr() ? tr : en);

  // Colour of the album cover (extras-ui.js), Spotify green as fallback.
  let seeking = false, seekPreviewMs = 0;
  const accent = () => window.__lumadockAlbumColour || '#1ed760';
  const time = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const position = () => {
    if (seeking) return seekPreviewMs;
    return Math.min(spotifyState.duration_ms || 0,
      (spotifyState.progress_ms || 0) + (spotifyState.is_playing ? performance.now() - spotifySyncAt : 0));
  };

  // Vector media icons (crisper than text glyphs).
  function mediaIcon(kind, x, y, s, colour) {
    ctx.save(); ctx.fillStyle = colour; ctx.beginPath();
    const tri = (x0, dir) => { ctx.moveTo(x0, y - s / 2); ctx.lineTo(x0 + dir * s * 0.75, y); ctx.lineTo(x0, y + s / 2); ctx.closePath(); };
    if (kind === 'play') tri(x - s * 0.3, 1);
    else if (kind === 'pause') { ctx.roundRect(x - s * 0.4, y - s / 2, s * 0.28, s, 2); ctx.roundRect(x + s * 0.12, y - s / 2, s * 0.28, s, 2); }
    else { const d = kind === 'next' ? 1 : -1; tri(x - d * s * 0.6, d); tri(x - d * s * 0.05, d); ctx.roundRect(x + d * s * 0.7 - (d > 0 ? 0 : s * 0.16), y - s / 2, s * 0.16, s, 1); }
    ctx.fill(); ctx.restore();
  }
  window.__lumadockMediaIcon = mediaIcon;

  // ---- Spotify Lyrics (Time-synced lyrics with timestamps) ----
  let lyrics = null, lyricsLoading = false, lastLyricsKey = '', lyricsOpen = false;

  async function loadLyrics(trackName, artistName, dur) {
    if (!trackName) { lyrics = null; return; }
    const key = `${trackName}:::${artistName || ''}`.toLowerCase();
    if (key === lastLyricsKey && lyrics) return;
    lastLyricsKey = key;
    lyricsLoading = true;
    try {
      const res = await api.spotifyLyrics?.({ title: trackName, artist: artistName, duration: dur });
      if (res?.ok && res.lines?.length) {
        lyrics = res;
      } else if (res?.plain) {
        lyrics = {
          synced: false,
          lines: res.plain.split('\n').filter(Boolean).map(t => ({ displayTime: '--:--', timeMs: 0, text: t.trim() }))
        };
      } else {
        lyrics = null;
      }
    } catch {
      lyrics = null;
    } finally {
      lyricsLoading = false;
    }
  }

  window.__lumadockLoadLyrics = loadLyrics;
  window.__lumadockGetActiveLyric = () => {
    if (!spotifyState.is_playing || !lyrics?.lines?.length) return null;
    const curPos = position();
    if (typeof lyrics.lines.findLast === 'function') {
      return lyrics.lines.findLast(l => l.timeMs <= curPos) || null;
    }
    for (let i = lyrics.lines.length - 1; i >= 0; i--) {
      if (lyrics.lines[i].timeMs <= curPos) return lyrics.lines[i];
    }
    return null;
  };
  window.__lumadockGetLyrics = () => lyrics;

  window.lumadock?.onMediaStateChanged?.(data => {
    if (data?.title && data.active) {
      loadLyrics(data.title, data.artist, data.duration);
    }
  });

  setInterval(() => {
    if (spotifyState.track?.name && !lyricsLoading) {
      const key = `${spotifyState.track.name}:::${spotifyState.track.artist || ''}`.toLowerCase();
      if (key !== lastLyricsKey) {
        loadLyrics(spotifyState.track.name, spotifyState.track.artist, spotifyState.duration_ms);
      }
    }
  }, 1200);
  // ---- Spotify Connect: where the music plays (this PC, your phone, the car…) and moving it, like Spotify's speaker button ----
  let devicesOpen = false, devices = [], devicesNote = '';
  function devIcon(type, x, y, s, colour) { // small line icons per kind of device
    ctx.save(); ctx.strokeStyle = colour; ctx.fillStyle = colour; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.beginPath();
    if (type === 'Smartphone') ctx.roundRect(x - s * 0.28, y - s * 0.5, s * 0.56, s, 2.5);
    else if (type === 'Automobile') { ctx.roundRect(x - s * 0.5, y - s * 0.1, s, s * 0.38, 3); ctx.moveTo(x - s * 0.32, y - s * 0.1); ctx.lineTo(x - s * 0.2, y - s * 0.38); ctx.lineTo(x + s * 0.2, y - s * 0.38); ctx.lineTo(x + s * 0.32, y - s * 0.1); }
    else if (type === 'Speaker' || type === 'CastAudio' || type === 'AVR') { ctx.roundRect(x - s * 0.34, y - s * 0.5, s * 0.68, s, 3); ctx.moveTo(x + s * 0.14, y + s * 0.12); ctx.arc(x, y + s * 0.12, s * 0.14, 0, Math.PI * 2); }
    else if (type === 'TV' || type === 'CastVideo') { ctx.roundRect(x - s * 0.5, y - s * 0.38, s, s * 0.62, 2); ctx.moveTo(x - s * 0.22, y + s * 0.42); ctx.lineTo(x + s * 0.22, y + s * 0.42); }
    else { ctx.roundRect(x - s * 0.42, y - s * 0.36, s * 0.84, s * 0.56, 2); ctx.moveTo(x - s * 0.55, y + s * 0.34); ctx.lineTo(x + s * 0.55, y + s * 0.34); } // a laptop
    ctx.stroke(); ctx.restore();
  }
  async function loadDevices() {
    devicesNote = '…';
    try {
      const r = await api.spotifyDevices?.();
      devices = r?.devices || [];
      if (!r?.ok && r?.error) {
        if (/403|premium/i.test(r.error)) {
          devicesNote = L('Device switching requires Spotify Premium.', 'Cihaz aktarımı için Spotify Premium gereklidir.');
        } else {
          devicesNote = r.error;
        }
      } else {
        devicesNote = devices.length ? '' : L('Open Spotify on another device to see it here.', 'Başka bir cihazda Spotify açarsanız burada görünür.');
      }
    } catch {
      devicesNote = L('Could not retrieve devices.', 'Cihazlar alınamadı.');
    }
  }
  async function moveTo(device) {
    if (device.id === 'local' || device.here) {
      devicesOpen = false;
      return;
    }
    devicesNote = L('Switching to ' + device.name + '…', device.name + ' cihazına geçiliyor…');
    const r = await api.spotifyTransfer?.(device.id).catch(e => ({ ok: false, error: e.message }));
    if (r?.ok) {
      devicesOpen = false;
      devicesNote = '';
      window.__lumadockFlash?.('🔊  ' + device.name, 1200);
      window.__lumadockChime?.('pop');
      setTimeout(() => refreshSpotify(), 250);
    } else {
      if (/403|premium/i.test(r?.error)) {
        devicesNote = L('Spotify Premium required to transfer playback.', 'Cihaz değiştirmek için Spotify Premium gereklidir.');
      } else {
        devicesNote = r?.error || L('Action failed.', 'İşlem başarısız oldu.');
      }
    }
  }
  function control3(x, y, r, kind, key, primary) {
    const bounds = { x: x - r, y: y - r, width: r * 2, height: r * 2 }, over = inside(pointer.x, pointer.y, bounds);
    if (primary || over) { ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = primary ? '#f4f7f0' : 'rgba(255,255,255,.08)'; ctx.fill(); ctx.restore(); }
    mediaIcon(kind, x, y, primary ? 15 : 13, primary ? '#050605' : (over ? '#fff' : '#d9dfd4'));
    hit[key] = bounds;
  }

  // Wide, low player (inspired by NotchNook / Alcove / Apple's Dynamic Island): a big album cover on the left,
  // then the song with a live visualizer, a long progress bar, and big controls. The album colour lights it up.
  drawSpotify = function (content) {
    const left = content.x + 4, right = content.x + content.width - 6, top = content.y + 2, track = spotifyState.track;
    hit.ghost = null;
    if (!spotifyConnected) {
      window.__lumadockIcon?.('music', left + 24, top + 40, 30);
      text(L('Connect Spotify', 'Spotify\'ı Bağla'), left + 56, top + 36, 19, '#fff', 700);
      text(L('See and control your music right here.', 'Müziğinizi doğrudan buradan görün ve kontrol edin.'), left + 56, top + 56, 12, '#9aa596');
      pill(left + 56, top + 74, 190, '♫', L('Connect Spotify', 'Spotify\'ı Bağla'), 'spConnect');
      return;
    }
    const size = Math.min(content.height - 4, 132), art = albumImage?.complete && albumImage.naturalWidth, colour = accent();
    // soft album-coloured glow behind the cover (a radial gradient: no hard edges)
    if (art) {
      const gx = left + size / 2, gy = top + size / 2, glow = ctx.createRadialGradient(gx, gy, size * 0.2, gx, gy, size * 2.1);
      glow.addColorStop(0, colour.replace('rgb(', 'rgba(').replace(')', ',.38)').replace(/^#(..)(..)(..)$/, (m, r, g, b) => `rgba(${parseInt(r, 16)},${parseInt(g, 16)},${parseInt(b, 16)},.38)`));
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save(); ctx.fillStyle = glow; ctx.beginPath(); ctx.roundRect(left + size / 2, top, right - left - size / 2, size, 16); ctx.fill(); ctx.restore(); // starts behind the cover: no edges
    }
    // cover
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
    box(left, top, size, size, 16, '#1b211a'); ctx.restore();
    if (art) { ctx.save(); ctx.beginPath(); ctx.roundRect(left, top, size, size, 16); ctx.clip(); ctx.drawImage(albumImage, left, top, size, size); ctx.restore(); }
    else window.__lumadockIcon?.('music', left + size / 2, top + size / 2, 40, '#5d6858');

    const x = left + size + 24, w = right - x, vizW = 168;

    // Load time-synced lyrics if track changed
    if (track?.name && `${track.name}:::${track.artist || ''}`.toLowerCase() !== lastLyricsKey && !lyricsLoading) {
      loadLyrics(track.name, track.artist, spotifyState.duration_ms);
    }

    // title + artist, visualizer on the right
    if (!track) {
      text(L('Nothing is playing right now', 'Şu an çalan bir şey yok'), x, top + 26, 17, '#fff', 700, 'left', w - vizW - 16);
      text(L('Start music in Spotify or press play.', 'Spotify\'da müzik başlatın veya oynat\'a basın.'), x, top + 44, 12, 'rgba(235,240,230,.6)', 500, 'left', w - vizW - 16);
      hit.spTitle = { x, y: top + 10, width: w - vizW, height: 28 };
    } else {
      const over = inside(pointer.x, pointer.y, { x, y: top + 10, width: w - vizW - 16, height: 24 });
      text(track.name, x, top + 26, 17, over ? colour : '#fff', 700, 'left', w - vizW - 16);
      text(track.artist, x, top + 44, 12, 'rgba(235,240,230,.62)', 500, 'left', w - vizW - 16);
      hit.spTitle = { x, y: top + 10, width: w - vizW, height: 24 };

      // Live timestamped lyrics line
      const curPos = position();
      const activeLine = lyrics?.lines?.findLast?.(l => l.timeMs <= curPos);
      if (activeLine) {
        const overLrc = inside(pointer.x, pointer.y, { x, y: top + 49, width: w - 30, height: 18 });
        text(`[${activeLine.displayTime}]`, x, top + 61, 10, colour, 700, 'left');
        text(activeLine.text, x + 38, top + 61, 11, overLrc ? '#fff' : 'rgba(240,245,235,.88)', 600, 'left', w - 60);
        hit.spLiveLrc = { x, y: top + 49, width: w - 30, height: 18 };
      } else if (lyricsLoading) {
        text(L('Loading lyrics…', 'Sözler yükleniyor…'), x, top + 61, 10.5, 'rgba(255,255,255,.4)', 500, 'left');
      }
    }
    const dev = spotifyState.device, elsewhere = dev && !dev.here, bw = 150, bx = right - bw, by = top + 12;
    const overDev = inside(pointer.x, pointer.y, { x: bx, y: by, width: bw, height: 30 });
    box(bx, by, bw, 30, 15, devicesOpen || overDev ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.08)');
    devIcon(dev?.type || 'Computer', bx + 18, by + 15, 15, elsewhere ? colour : '#e8ece6');
    text(dev ? dev.name : L('Devices', 'Cihazlar'), bx + 34, by + 19.5, 11.5, elsewhere ? colour : '#e8ece6', 700, 'left', bw - 44);
    hit.spDevices = { x: bx, y: by, width: bw, height: 30 };

    // long progress bar with times
    const barY = top + 76, part = spotifyState.duration_ms ? position() / spotifyState.duration_ms : 0;
    const overBar = inside(pointer.x, pointer.y, { x, y: barY - 14, width: w, height: 28 }), bh = (overBar || seeking) ? 6 : 4;
    box(x, barY - bh / 2, w, bh, 3, 'rgba(255,255,255,.14)');
    box(x, barY - bh / 2, Math.max(bh, w * part), bh, 3, (overBar || seeking) ? colour : '#f4f7f0');
    if (overBar || seeking) { ctx.save(); ctx.beginPath(); ctx.arc(x + w * part, barY, 6, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore(); }
    hit.spSeek = { x, y: barY - 14, width: w, height: 28 };
    text(time(position()), x, barY + 17, 10, 'rgba(235,240,230,.5)', 600);
    text(spotifyState.duration_ms ? '-' + time(spotifyState.duration_ms - position()) : '0:00', right, barY + 17, 10, 'rgba(235,240,230,.5)', 600, 'right');

    // controls, centred under the bar
    const cy = top + size - 18, cx = x + w / 2;
    control3(cx - 58, cy, 18, 'prev', 'spPrev');
    control3(cx, cy, 21, spotifyState.is_playing ? 'pause' : 'play', 'spPlay', true);
    control3(cx + 58, cy, 18, 'next', 'spNext');
    // open in Spotify (small, right)
    const ox = right - 14, overOpen = inside(pointer.x, pointer.y, { x: ox - 16, y: cy - 16, width: 32, height: 32 });
    window.__lumadockIcon?.('music', ox, cy, 16, overOpen ? colour : 'rgba(235,240,230,.55)');
    hit.spOpen = { x: ox - 16, y: cy - 16, width: 32, height: 32 };

    // LRC Lyrics button
    const lx = right - 46, overLrcBtn = inside(pointer.x, pointer.y, { x: lx - 16, y: cy - 16, width: 32, height: 32 });
    if (lyricsOpen || overLrcBtn) {
      box(lx - 15, cy - 11, 30, 22, 6, lyricsOpen ? colour : 'rgba(255,255,255,.12)');
    }
    text('LRC', lx, cy + 3.5, 9.5, lyricsOpen ? '#050605' : (overLrcBtn ? '#fff' : (lyrics ? colour : 'rgba(235,240,230,.5)')), 700, 'center');
    hit.spLyrics = { x: lx - 16, y: cy - 16, width: 32, height: 32 };

    for (let i = 0; i < 5; i++) hit['spDev' + i] = null;
    for (let i = 0; i < 4; i++) hit['spLrc' + i] = null;

    if (lyricsOpen) {
      const px = x - 8, py = top - 2, pw = right - px + 4, ph = size + 4;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = 20; box(px, py, pw, ph, 16, '#121512'); ctx.restore();
      text('♫ ' + L('Lyrics · Timestamped', 'Şarkı Sözleri · Zaman Damgalı'), px + 16, py + 24, 13, colour, 700);
      text('✕', px + pw - 18, py + 24, 13, 'rgba(255,255,255,.6)', 700, 'center');
      hit.spLyricsClose = { x: px + pw - 32, y: py + 6, width: 28, height: 28 };

      if (!lyrics || !lyrics.lines?.length) {
        text(lyricsLoading ? L('Loading lyrics…', 'Sözler yükleniyor…') : L('No lyrics found for this track.', 'Bu parça için söz bulunamadı.'), px + 16, py + 56, 12, 'rgba(255,255,255,.5)', 500);
      } else {
        const curPos = position();
        let curIdx = lyrics.lines.findLastIndex(l => l.timeMs <= curPos);
        if (curIdx < 0) curIdx = 0;
        const start = Math.max(0, Math.min(lyrics.lines.length - 4, curIdx - 1));
        const slice = lyrics.lines.slice(start, start + 4);

        slice.forEach((l, i) => {
          const globalIdx = start + i;
          const isCur = globalIdx === curIdx;
          const ry = py + 36 + i * 24;
          const over = inside(pointer.x, pointer.y, { x: px + 8, y: ry, width: pw - 16, height: 22 });
          if (over || isCur) {
            box(px + 8, ry, pw - 16, 22, 6, isCur ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.06)');
          }
          text(l.displayTime, px + 16, ry + 15, 10.5, isCur ? colour : 'rgba(255,255,255,.45)', 700, 'left');
          text(l.text, px + 58, ry + 15, isCur ? 12 : 11, isCur ? '#ffffff' : (over ? '#eef2ec' : 'rgba(235,240,230,.6)'), isCur ? 700 : 500, 'left', pw - 76);
          hit['spLrc' + i] = { x: px + 8, y: ry, width: pw - 16, height: 22, timeMs: l.timeMs };
        });
      }
    } else if (devicesOpen) {
      const px = x - 8, py = top - 2, pw = right - px + 4, ph = size + 4;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 20; box(px, py, pw, ph, 16, '#121512'); ctx.restore();
      text(L('Play on', 'Cihazda Çal'), px + 16, py + 24, 13, '#fff', 700);
      text('✕', px + pw - 18, py + 24, 13, 'rgba(255,255,255,.6)', 700, 'center'); hit.spDevClose = { x: px + pw - 32, y: py + 6, width: 28, height: 28 };
      const list = devices.slice(0, 4);
      list.forEach((d, i) => {
        const ry = py + 36 + i * 24, over = inside(pointer.x, pointer.y, { x: px + 8, y: ry, width: pw - 16, height: 22 });
        if (over) box(px + 8, ry, pw - 16, 22, 8, 'rgba(255,255,255,.07)');
        devIcon(d.type, px + 24, ry + 11, 13, d.active ? colour : '#cfd5cc');
        text(d.name, px + 40, ry + 15, 12, d.active ? colour : '#eef2ec', d.active ? 700 : 600, 'left', pw - 150);
        text(d.active ? L('Playing now', 'Şu an çalıyor') : d.here ? L('This PC', 'Bu bilgisayar') : '', px + pw - 16, ry + 15, 10.5, d.active ? colour : 'rgba(255,255,255,.45)', 600, 'right');
        hit['spDev' + i] = { x: px + 8, y: ry, width: pw - 16, height: 22, device: d };
      });
      if (devicesNote) text(devicesNote, px + 16, py + ph - 12, 10.5, 'rgba(255,255,255,.55)', 600, 'left', pw - 32);
    }
  };

  async function control(action) {
    window.dispatchEvent(new CustomEvent('lumadock:badge', { detail: 'dj' }));
    if (action === 'play' || action === 'pause') { spotifyState.is_playing = action === 'play'; spotifySyncAt = performance.now(); }
    api.spotifyControl(action).catch(() => {});
    setTimeout(() => refreshSpotify(), 50);
    setTimeout(() => refreshSpotify(), 300);
  }
  // ---- swipe for music: drag left/right over the island (or swipe with two fingers on the touchpad) ----
  // left = next song, right = previous song. Works on the small island and on the Spotify page.
  let drag = null, swallowClick = false, wheelX = 0, wheelAt = 0, lastSwipe = 0;
  const canSwipe = (x, y) => spotifyConnected && spotifyState.track && inside(x, y, islandBounds) && (mode === 'compact' || currentView === 'spotify');
  function swipe(dir) {
    if (performance.now() - lastSwipe < 700) return; lastSwipe = performance.now();
    window.__lumadockFlash?.(dir > 0 ? (L('⏭ Next track', '⏭ Sonraki parça')) : (L('⏮ Previous track', '⏮ Önceki parça')), 900);
    window.__lumadockKick?.(dir > 0 ? -0.05 : 0.05);
    control(dir > 0 ? 'next' : 'previous');
  }
  canvas.addEventListener('pointerdown', e => {
    if (currentView === 'spotify' && mode === 'expanded' && hit.spSeek && inside(e.clientX, e.clientY, hit.spSeek)) {
      seeking = true;
      const frac = Math.max(0, Math.min(1, (e.clientX - hit.spSeek.x) / hit.spSeek.width));
      seekPreviewMs = Math.round(frac * (spotifyState.duration_ms || 0));
      spotifyState.progress_ms = seekPreviewMs;
      spotifySyncAt = performance.now();
      return;
    }
    drag = canSwipe(e.clientX, e.clientY) ? { x: e.clientX, y: e.clientY } : null;
  });
  window.addEventListener('pointermove', e => {
    if (seeking && hit.spSeek) {
      const frac = Math.max(0, Math.min(1, (e.clientX - hit.spSeek.x) / hit.spSeek.width));
      seekPreviewMs = Math.round(frac * (spotifyState.duration_ms || 0));
      spotifyState.progress_ms = seekPreviewMs;
      spotifySyncAt = performance.now();
    }
  });
  window.addEventListener('pointerup', e => {
    if (seeking) {
      seeking = false;
      swallowClick = true;
      const finalMs = seekPreviewMs;
      api.spotifySeek(finalMs).catch(() => {});
      setTimeout(() => refreshSpotify(), 80);
      return;
    }
    if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag = null;
    if (Math.abs(dx) > 48 && Math.abs(dy) < 36) { swallowClick = true; swipe(dx < 0 ? 1 : -1); }
  });
  // on window (capture) so it runs before every other click handler: a swipe is not a click
  window.addEventListener('click', e => { if (swallowClick) { swallowClick = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  canvas.addEventListener('wheel', e => {
    if (!canSwipe(e.clientX, e.clientY) || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    const now = performance.now(); if (now - wheelAt > 250) wheelX = 0; wheelAt = now; wheelX += e.deltaX;
    if (Math.abs(wheelX) > 90) { swipe(wheelX > 0 ? 1 : -1); wheelX = 0; }
  }, { passive: true });
  canvas.addEventListener('click', async event => {
    if (currentView !== 'spotify' || mode !== 'expanded') return;
    const x = event.clientX, y = event.clientY, hits = {
      spDevClose: () => { devicesOpen = false; },
      ...Object.fromEntries([0, 1, 2, 3].map(i => ['spDev' + i, () => hit['spDev' + i]?.device && moveTo(hit['spDev' + i].device)])),
      spDevices: () => { devicesOpen = !devicesOpen; if (devicesOpen) { lyricsOpen = false; loadDevices(); } },
      spLyrics: () => { lyricsOpen = !lyricsOpen; if (lyricsOpen) devicesOpen = false; },
      spLyricsClose: () => { lyricsOpen = false; },
      spLiveLrc: () => { lyricsOpen = true; devicesOpen = false; },
      ...Object.fromEntries([0, 1, 2, 3].map(i => ['spLrc' + i, () => {
        const item = hit['spLrc' + i];
        if (item && item.timeMs !== undefined) {
          spotifyState.progress_ms = item.timeMs;
          spotifySyncAt = performance.now();
          api.spotifySeek(item.timeMs).catch(() => {});
          setTimeout(() => refreshSpotify(), 80);
        }
      }])),
      spPrev: () => control('previous'), spNext: () => control('next'),
      spPlay: () => control(spotifyState.is_playing ? 'pause' : 'play'), spOpen: () => control('open'), spTitle: () => control('open'),
      spConnect: async () => { try { await api.spotifyConnect(); } catch {} refreshSpotify(); },
      spSeek: () => {
        if (!hit.spSeek) return;
        const bar = hit.spSeek, frac = Math.max(0, Math.min(1, (x - bar.x) / bar.width));
        const ms = Math.round(frac * (spotifyState.duration_ms || 0));
        spotifyState.progress_ms = ms;
        spotifySyncAt = performance.now();
        api.spotifySeek(ms).catch(() => {});
        setTimeout(() => refreshSpotify(), 80);
        setTimeout(() => refreshSpotify(), 300);
      }
    };
    if (lyricsOpen && !['spLyrics', 'spLyricsClose', 'spLrc0', 'spLrc1', 'spLrc2', 'spLrc3'].some(k => inside(x, y, hit[k]))) { lyricsOpen = false; event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (devicesOpen && !['spDevices', 'spDevClose', 'spDev0', 'spDev1', 'spDev2', 'spDev3'].some(k => inside(x, y, hit[k]))) { devicesOpen = false; event.preventDefault(); event.stopImmediatePropagation(); return; } // a click elsewhere closes the list
    for (const [key, run] of Object.entries(hits)) {
      if (inside(x, y, hit[key])) { event.preventDefault(); event.stopImmediatePropagation(); run(); return; }
    }
  }, true);
})();
