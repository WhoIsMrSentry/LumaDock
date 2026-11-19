'use strict';
// Spotify screen: album cover, song, playlists (cover-only grid), progress bar (click/drag to seek),
// timestamped lyrics (+ sync offset), device switcher, and real-time controls.
(function spotifyScreen() {
  const api = window.lumadock;
  const isTr = () => {
    try {
      const p = JSON.parse(localStorage.getItem('lumadock:prefs') || '{}');
      return p.lang === 'tr';
    } catch { return false; }
  };
  const L = (en, tr) => (isTr() ? tr : en);

  let seeking = false, seekPreviewMs = 0, smoothPart = 0, lastFrameNow = performance.now();
  const accent = () => window.__lumadockAlbumColour || '#1ed760';
  const time = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const position = () => {
    if (seeking) return seekPreviewMs;
    const raw = (spotifyState.progress_ms || 0) + (spotifyState.is_playing ? performance.now() - spotifySyncAt : 0);
    return spotifyState.duration_ms > 0 ? Math.min(spotifyState.duration_ms, raw) : raw;
  };

  let lrcOffsetMs = 0;
  try { lrcOffsetMs = Number(localStorage.getItem('lumadock:lrc-offset')) || 0; } catch {}
  const setLrcOffset = next => {
    lrcOffsetMs = Math.max(-10000, Math.min(10000, Math.round(next / 500) * 500));
    try { localStorage.setItem('lumadock:lrc-offset', String(lrcOffsetMs)); } catch {}
  };
  const lrcPosition = () => Math.max(0, position() + lrcOffsetMs);

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

  function gridIcon(x, y, s, colour) {
    const gap = s * 0.18, boxS = (s - gap) / 2, x0 = x - s / 2, y0 = y - s / 2;
    ctx.save(); ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.roundRect(x0, y0, boxS, boxS, 2.2);
    ctx.roundRect(x0 + boxS + gap, y0, boxS, boxS, 2.2);
    ctx.roundRect(x0, y0 + boxS + gap, boxS, boxS, 2.2);
    ctx.roundRect(x0 + boxS + gap, y0 + boxS + gap, boxS, boxS, 2.2);
    ctx.fill(); ctx.restore();
  }

  // ---- Spotify Lyrics (Time-synced lyrics with timestamps) ----
  let lyrics = null, lyricsLoading = false, lastLyricsKey = '', lastLyricsAt = 0, lyricsOpen = false;

  async function loadLyrics(trackName, artistName, dur) {
    if (!trackName) { lyrics = null; lastLyricsKey = ''; return; }
    const key = `${trackName}:::${artistName || ''}`.toLowerCase();
    const now = Date.now();
    if (key === lastLyricsKey) {
      if (lyrics || lyricsLoading || (now - lastLyricsAt) < 4500) return;
    } else {
      lyrics = null;
      lastLyricsKey = key;
    }
    lastLyricsAt = now;
    lyricsLoading = true;
    try {
      const res = await api.spotifyLyrics?.({ title: trackName, artist: artistName, duration: dur });
      if (key !== lastLyricsKey) return;
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
      if (key === lastLyricsKey) lyrics = null;
    } finally {
      lyricsLoading = false;
    }
  }

  let lastLrcPlayAt = 0;
  window.__lumadockLoadLyrics = loadLyrics;
  window.__lumadockGetActiveLyric = () => {
    if (spotifyState.is_playing) lastLrcPlayAt = performance.now();
    const recentlyPlaying = spotifyState.is_playing || (spotifyState.active && (performance.now() - lastLrcPlayAt) < 3500);
    if (!recentlyPlaying || !lyrics?.synced || !lyrics?.lines?.length) return null;
    const curPos = lrcPosition();
    for (let i = lyrics.lines.length - 1; i >= 0; i--) {
      const line = lyrics.lines[i];
      if (line.timeMs <= curPos && line.text && line.text.trim()) {
        return line;
      }
    }
    return null;
  };
  window.__lumadockGetLyrics = () => lyrics;

  window.lumadock?.onMediaStateChanged?.(data => {
    const tName = data?.cleanTitle || data?.title;
    const tArtist = data?.cleanArtist || data?.artist;
    if (tName && data.active) {
      loadLyrics(tName, tArtist, data.duration);
    }
  });

  setInterval(() => {
    if (spotifyState.track?.name && !lyricsLoading) {
      loadLyrics(spotifyState.track.name, spotifyState.track.artist, spotifyState.duration_ms);
    }
  }, 1200);

  // ---- Spotify Cover-Only Playlists ----
  let playlistsOpen = false, playlistsLoading = false, playlists = [], playlistsAuthNeed = false, playlistsNote = '', plPage = 0;
  const playlistImages = new Map();
  const plHover = new Array(8).fill(0);

  function getPlaylistImage(url) {
    if (!url) return null;
    let img = playlistImages.get(url);
    if (!img) {
      img = new Image();
      img.src = url;
      playlistImages.set(url, img);
    }
    return img.complete && img.naturalWidth ? img : null;
  }

  async function loadPlaylists(force = false) {
    if (playlistsLoading && !force) return;
    playlistsLoading = true;
    if (force) playlistsNote = '';
    try {
      const r = await api.spotifyPlaylists?.(force);
      playlists = Array.isArray(r?.playlists) ? r.playlists : [];
      playlistsAuthNeed = Boolean(r?.needsAuth || r?.needsReauth);
      if (r?.ok) {
        playlistsNote = playlists.length ? '' : L('No playlist covers found.', 'Kapaklı çalma listesi bulunamadı.');
      } else if (r?.error) {
        playlistsNote = r.error;
      } else if (!playlists.length && !playlistsAuthNeed) {
        playlistsNote = L('No playlist covers found.', 'Kapaklı çalma listesi bulunamadı.');
      }
    } catch (err) {
      playlistsNote = String(err?.message || '') || L('Could not load playlists.', 'Çalma listeleri yüklenemedi.');
    } finally {
      playlistsLoading = false;
    }
  }

  api.onSpotifyAuthUpdated?.(() => {
    playlistsAuthNeed = false;
    refreshSpotify();
    if (playlistsOpen) loadPlaylists(true);
  });

  async function openPlaylist(pl) {
    if (!pl?.uri) return;
    playlistsOpen = false;
    window.__lumadockChime?.('pop');
    window.__lumadockFlash?.('♫', 900);
    await api.spotifyPlayPlaylist?.(pl.uri, pl.external_url).catch(() => {});
    setTimeout(() => refreshSpotify(), 350);
  }

  // ---- Spotify Connect: where the music plays ----
  let devicesOpen = false, devices = [], devicesNote = '';
  let drawerAnim = 0; // 0..1 smooth animation for active overlay drawer (lyrics / devices / playlists)

  function devIcon(type, x, y, s, colour) {
    ctx.save(); ctx.strokeStyle = colour; ctx.fillStyle = colour; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.beginPath();
    if (type === 'Smartphone') ctx.roundRect(x - s * 0.28, y - s * 0.5, s * 0.56, s, 2.5);
    else if (type === 'Automobile') { ctx.roundRect(x - s * 0.5, y - s * 0.1, s, s * 0.38, 3); ctx.moveTo(x - s * 0.32, y - s * 0.1); ctx.lineTo(x - s * 0.2, y - s * 0.38); ctx.lineTo(x + s * 0.2, y - s * 0.38); ctx.lineTo(x + s * 0.32, y - s * 0.1); }
    else if (type === 'Speaker' || type === 'CastAudio' || type === 'AVR') { ctx.roundRect(x - s * 0.34, y - s * 0.5, s * 0.68, s, 3); ctx.moveTo(x + s * 0.14, y + s * 0.12); ctx.arc(x, y + s * 0.12, s * 0.14, 0, Math.PI * 2); }
    else if (type === 'TV' || type === 'CastVideo') { ctx.roundRect(x - s * 0.5, y - s * 0.38, s, s * 0.62, 2); ctx.moveTo(x - s * 0.22, y + s * 0.42); ctx.lineTo(x + s * 0.22, y + s * 0.42); }
    else { ctx.roundRect(x - s * 0.42, y - s * 0.36, s * 0.84, s * 0.56, 2); ctx.moveTo(x - s * 0.55, y + s * 0.34); ctx.lineTo(x + s * 0.55, y + s * 0.34); }
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

  drawSpotify = function (content) {
    const now = performance.now(), dt = Math.min(0.05, Math.max(0.001, (now - lastFrameNow) / 1000));
    lastFrameNow = now;
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
    if (art) {
      const gx = left + size / 2, gy = top + size / 2, glow = ctx.createRadialGradient(gx, gy, size * 0.2, gx, gy, size * 2.1);
      glow.addColorStop(0, colour.replace('rgb(', 'rgba(').replace(')', ',.38)').replace(/^#(..)(..)(..)$/, (m, r, g, b) => `rgba(${parseInt(r, 16)},${parseInt(g, 16)},${parseInt(b, 16)},.38)`));
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save(); ctx.fillStyle = glow; ctx.beginPath(); ctx.roundRect(left + size / 2, top, right - left - size / 2, size, 16); ctx.fill(); ctx.restore();
    }

    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
    box(left, top, size, size, 16, '#1b211a'); ctx.restore();
    if (art) { ctx.save(); ctx.beginPath(); ctx.roundRect(left, top, size, size, 16); ctx.clip(); ctx.drawImage(albumImage, left, top, size, size); ctx.restore(); }
    else window.__lumadockIcon?.('music', left + size / 2, top + size / 2, 40, '#5d6858');

    const x = left + size + 24, w = right - x, vizW = 168;

    if (track?.name && `${track.name}:::${track.artist || ''}`.toLowerCase() !== lastLyricsKey && !lyricsLoading) {
      loadLyrics(track.name, track.artist, spotifyState.duration_ms);
    }

    if (!track) {
      text(L('Nothing is playing right now', 'Şu an çalan bir şey yok'), x, top + 26, 17, '#fff', 700, 'left', w - vizW - 16);
      text(L('Start music in Spotify or pick a playlist cover.', 'Spotify\'da müzik başlatın veya sağ alttan playlist seçin.'), x, top + 44, 12, 'rgba(235,240,230,.6)', 500, 'left', w - vizW - 16);
      hit.spTitle = { x, y: top + 10, width: w - vizW, height: 28 };
    } else {
      const over = inside(pointer.x, pointer.y, { x, y: top + 10, width: w - vizW - 16, height: 24 });
      text(track.name, x, top + 26, 17, over ? colour : '#fff', 700, 'left', w - vizW - 16);
      text(track.artist, x, top + 44, 12, 'rgba(235,240,230,.62)', 500, 'left', w - vizW - 16);
      hit.spTitle = { x, y: top + 10, width: w - vizW, height: 24 };

      const curPos = lrcPosition();
      let activeLine = null;
      if (lyrics?.lines?.length) {
        for (let i = lyrics.lines.length - 1; i >= 0; i--) {
          if (lyrics.lines[i].timeMs <= curPos && lyrics.lines[i].text?.trim()) { activeLine = lyrics.lines[i]; break; }
        }
      }
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

    // Smooth progress bar
    const barY = top + 76, targetPart = spotifyState.duration_ms ? Math.min(1, Math.max(0, position() / spotifyState.duration_ms)) : 0;
    if (seeking || Math.abs(targetPart - smoothPart) > 0.25) smoothPart = targetPart;
    else smoothPart += (targetPart - smoothPart) * (1 - Math.exp(-18 * dt));
    const overBar = inside(pointer.x, pointer.y, { x, y: barY - 14, width: w, height: 28 }), bh = (overBar || seeking) ? 6 : 4;
    box(x, barY - bh / 2, w, bh, 3, 'rgba(255,255,255,.14)');
    box(x, barY - bh / 2, Math.max(bh, w * smoothPart), bh, 3, (overBar || seeking) ? colour : '#f4f7f0');
    if (overBar || seeking) { ctx.save(); ctx.beginPath(); ctx.arc(x + w * smoothPart, barY, 6, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore(); }
    hit.spSeek = { x, y: barY - 14, width: w, height: 28 };
    text(time(position()), x, barY + 17, 10, 'rgba(235,240,230,.5)', 600);
    text(spotifyState.duration_ms ? '-' + time(spotifyState.duration_ms - position()) : '0:00', right, barY + 17, 10, 'rgba(235,240,230,.5)', 600, 'right');

    // Controls centered under bar
    const cy = top + size - 18, cx = x + w / 2;
    control3(cx - 58, cy, 18, 'prev', 'spPrev');
    control3(cx, cy, 21, spotifyState.is_playing ? 'pause' : 'play', 'spPlay', true);
    control3(cx + 58, cy, 18, 'next', 'spNext');

    // Open in Spotify button
    const ox = right - 14, overOpen = inside(pointer.x, pointer.y, { x: ox - 15, y: cy - 15, width: 30, height: 30 });
    window.__lumadockIcon?.('music', ox, cy, 15, overOpen ? colour : 'rgba(235,240,230,.55)');
    hit.spOpen = { x: ox - 15, y: cy - 15, width: 30, height: 30 };

    // LRC Lyrics button
    const lx = right - 46, overLrcBtn = inside(pointer.x, pointer.y, { x: lx - 15, y: cy - 15, width: 30, height: 30 });
    if (lyricsOpen || overLrcBtn) box(lx - 15, cy - 11, 30, 22, 6, lyricsOpen ? colour : 'rgba(255,255,255,.12)');
    text('LRC', lx, cy + 3.5, 9.5, lyricsOpen ? '#050605' : (overLrcBtn ? '#fff' : (lyrics ? colour : 'rgba(235,240,230,.5)')), 700, 'center');
    hit.spLyrics = { x: lx - 15, y: cy - 15, width: 30, height: 30 };

    // Cover-only Playlists button (4-square grid icon)
    const plx = right - 80, overPlBtn = inside(pointer.x, pointer.y, { x: plx - 15, y: cy - 15, width: 30, height: 30 });
    if (playlistsOpen || overPlBtn) box(plx - 14, cy - 11, 28, 22, 6, playlistsOpen ? colour : 'rgba(255,255,255,.12)');
    gridIcon(plx, cy, 12, playlistsOpen ? '#050605' : (overPlBtn ? '#fff' : (playlists.length ? colour : 'rgba(235,240,230,.6)')));
    hit.spPlaylists = { x: plx - 15, y: cy - 15, width: 30, height: 30 };

    // Clear overlay hit zones
    for (let i = 0; i < 5; i++) hit['spDev' + i] = null;
    for (let i = 0; i < 4; i++) hit['spLrc' + i] = null;
    for (let i = 0; i < 8; i++) hit['spPlTile' + i] = null;
    hit.spLyricsClose = hit.spLrcMinus = hit.spLrcReset = hit.spLrcPlus = null;
    hit.spDevClose = hit.spPlClose = hit.spPlRefresh = hit.spPlPrev = hit.spPlNext = hit.spPlAuth = hit.spPlAddClip = hit.spPlSettings = null;

    const anyDrawer = lyricsOpen || devicesOpen || playlistsOpen;
    drawerAnim += ((anyDrawer ? 1 : 0) - drawerAnim) * (1 - Math.exp(-20 * dt));
    if (!anyDrawer || drawerAnim < 0.02) return;

    const px = x - 8, py = top - 2, pw = right - px + 4, ph = size + 4;
    ctx.save();
    ctx.globalAlpha *= drawerAnim;
    const sc = 0.97 + 0.03 * drawerAnim, pcx = px + pw / 2, pcy = py + ph / 2;
    ctx.translate(pcx, pcy); ctx.scale(sc, sc); ctx.translate(-pcx, -pcy);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = 20; box(px, py, pw, ph, 16, '#121512'); ctx.restore();

    if (playlistsOpen) {
      // Header: icon only + refresh + paging arrows + close — ZERO playlist names!
      gridIcon(px + 20, py + 19, 11, colour);
      const totalPages = Math.max(1, Math.ceil(playlists.length / 8));
      if (plPage >= totalPages) plPage = totalPages - 1;

      const ax = px + pw - 66, overAdd = inside(pointer.x, pointer.y, { x: ax - 11, y: py + 6, width: 22, height: 24 });
      text('+', ax, py + 23, 15.5, overAdd ? colour : 'rgba(255,255,255,.72)', 700, 'center');
      hit.spPlAddClip = { x: ax - 11, y: py + 6, width: 22, height: 24 };

      const rx = px + pw - 42, overRef = inside(pointer.x, pointer.y, { x: rx - 11, y: py + 6, width: 22, height: 24 });
      text('↻', rx, py + 23, 13.5, overRef ? '#fff' : 'rgba(255,255,255,.6)', 700, 'center');
      hit.spPlRefresh = { x: rx - 11, y: py + 6, width: 22, height: 24 };

      text('✕', px + pw - 18, py + 23, 13, 'rgba(255,255,255,.65)', 700, 'center');
      hit.spPlClose = { x: px + pw - 30, y: py + 6, width: 24, height: 24 };

      if (totalPages > 1) {
        const ax1 = px + pw - 114, ax2 = px + pw - 90;
        const o1 = inside(pointer.x, pointer.y, { x: ax1 - 10, y: py + 6, width: 20, height: 24 });
        const o2 = inside(pointer.x, pointer.y, { x: ax2 - 10, y: py + 6, width: 20, height: 24 });
        text('‹', ax1, py + 23, 15, plPage > 0 ? (o1 ? '#fff' : 'rgba(255,255,255,.75)') : 'rgba(255,255,255,.2)', 700, 'center');
        text('›', ax2, py + 23, 15, plPage < totalPages - 1 ? (o2 ? '#fff' : 'rgba(255,255,255,.75)') : 'rgba(255,255,255,.2)', 700, 'center');
        if (plPage > 0) hit.spPlPrev = { x: ax1 - 10, y: py + 6, width: 20, height: 24 };
        if (plPage < totalPages - 1) hit.spPlNext = { x: ax2 - 10, y: py + 6, width: 20, height: 24 };
      }

      if (playlistsAuthNeed) {
        text(L('Spotify permission needed for auto-sync.', 'Otomatik liste için Spotify izni veya link ekleme kullanın.'), px + 16, py + 48, 11, 'rgba(255,255,255,.8)', 600, 'left', pw - 32);
        if (playlistsNote) text(playlistsNote, px + 16, py + 64, 10, '#ffb35c', 500, 'left', pw - 32);
        const btnW = Math.floor((pw - 40) / 2);
        pill(px + 16, py + 82, btnW, '♫', L('Authorize', 'Spotify Yetki'), 'spPlAuth');
        pill(px + 24 + btnW, py + 82, btnW, '+', L('Paste Link', 'Pano\'dan Ekle'), 'spPlAddClip');
      } else if (playlistsLoading && !playlists.length) {
        text(L('Loading covers…', 'Kapaklar yükleniyor…'), px + 16, py + 64, 12, 'rgba(255,255,255,.5)', 500);
      } else if (!playlists.length) {
        const msg = String(playlistsNote || L('Copy a Spotify playlist link or set Client ID in Connections.', 'Spotify\'dan playlist linki kopyalayıp ekleyin veya Client ID girin.'));
        text(msg, px + 16, py + 52, 10.8, '#ffb35c', 600, 'left', pw - 32);
        text(L('Tip: Right-click any Spotify playlist -> Share -> Copy link', 'İpucu: Spotify\'da playlist\'e sağ tık -> Paylaş -> Bağlantıyı Kopyala'), px + 16, py + 68, 10, 'rgba(255,255,255,.55)', 500, 'left', pw - 32);
        const btnW = Math.floor((pw - 40) / 2);
        pill(px + 16, py + 84, btnW, '+', L('Add from Clipboard', 'Pano\'dan Ekle'), 'spPlAddClip');
        pill(px + 24 + btnW, py + 84, btnW, '⚙', L('Connections', 'Bağlantılar'), 'spPlSettings');
      } else {
        // Cover-only 4x2 grid (NO playlist names shown!)
        const cols = 4, padX = 16, gapX = 12, gapY = 8;
        const tileS = Math.min(44, Math.floor((pw - padX * 2 - gapX * (cols - 1)) / cols), Math.floor((ph - 42 - gapY) / 2));
        const gridW = cols * tileS + (cols - 1) * gapX;
        const startX = px + Math.round((pw - gridW) / 2);
        const startY = py + 33;
        const slice = playlists.slice(plPage * 8, plPage * 8 + 8);

        slice.forEach((pl, i) => {
          const col = i % cols, row = Math.floor(i / cols);
          const tx = startX + col * (tileS + gapX), ty = startY + row * (tileS + gapY);
          const bounds = { x: tx, y: ty, width: tileS, height: tileS };
          const over = inside(pointer.x, pointer.y, bounds);
          plHover[i] += ((over ? 1 : 0) - plHover[i]) * (1 - Math.exp(-22 * dt));
          const hv = plHover[i], scale = 1 + 0.08 * hv;
          const cxT = tx + tileS / 2, cyT = ty + tileS / 2;

          ctx.save();
          ctx.translate(cxT, cyT); ctx.scale(scale, scale); ctx.translate(-cxT, -cyT);
          if (hv > 0.04) { ctx.shadowColor = colour; ctx.shadowBlur = 12 * hv; }
          box(tx, ty, tileS, tileS, 9, '#1c211c');
          ctx.shadowBlur = 0;

          const img = getPlaylistImage(pl.image_url);
          if (img) {
            ctx.save(); ctx.beginPath(); ctx.roundRect(tx, ty, tileS, tileS, 9); ctx.clip();
            ctx.drawImage(img, tx, ty, tileS, tileS);
            ctx.restore();
          } else {
            window.__lumadockIcon?.('music', cxT, cyT, 18, '#667262');
          }

          if (hv > 0.04) {
            ctx.save();
            ctx.beginPath(); ctx.roundRect(tx + 0.5, ty + 0.5, tileS - 1, tileS - 1, 9);
            ctx.strokeStyle = colour; ctx.globalAlpha = 0.85 * hv; ctx.lineWidth = 1.6; ctx.stroke();
            ctx.fillStyle = `rgba(0,0,0,${0.42 * hv})`; ctx.beginPath(); ctx.arc(cxT, cyT, tileS * 0.28, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = hv;
            mediaIcon('play', cxT + 1, cyT, 10, '#fff');
            ctx.restore();
          }
          ctx.restore();

          hit['spPlTile' + i] = { ...bounds, playlist: pl };
        });
      }
    } else if (lyricsOpen) {
      text('♫ ' + L('Lyrics · LRC', 'Şarkı Sözleri · LRC'), px + 16, py + 24, 12.5, colour, 700);
      // Offset steppers: -0.5s | +0.0s | +0.5s
      const oLabel = (lrcOffsetMs >= 0 ? '+' : '') + (lrcOffsetMs / 1000).toFixed(1) + 's';
      const bxM = px + pw - 118, bxR = px + pw - 86, bxP = px + pw - 56;
      const pillBtn = (bx0, bw0, lbl, k) => {
        const b = { x: bx0, y: py + 9, width: bw0, height: 20 }, o = inside(pointer.x, pointer.y, b);
        box(b.x, b.y, b.width, b.height, 6, o ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.06)');
        text(lbl, b.x + b.width / 2, b.y + 13.5, 9.5, o ? '#fff' : 'rgba(235,240,230,.75)', 700, 'center');
        hit[k] = b;
      };
      pillBtn(bxM, 28, '-0.5', 'spLrcMinus');
      pillBtn(bxR, 28, oLabel, 'spLrcReset');
      pillBtn(bxP, 24, '+0.5', 'spLrcPlus');

      text('✕', px + pw - 18, py + 24, 13, 'rgba(255,255,255,.6)', 700, 'center');
      hit.spLyricsClose = { x: px + pw - 32, y: py + 6, width: 28, height: 28 };

      if (!lyrics || !lyrics.lines?.length) {
        text(lyricsLoading ? L('Loading lyrics…', 'Sözler yükleniyor…') : L('No lyrics found for this track.', 'Bu parça için söz bulunamadı.'), px + 16, py + 56, 12, 'rgba(255,255,255,.5)', 500);
      } else {
        const curPos = lrcPosition();
        let curIdx = lyrics.lines.findLastIndex(l => l.timeMs <= curPos);
        if (curIdx < 0) curIdx = 0;
        const start = Math.max(0, Math.min(lyrics.lines.length - 4, curIdx - 1));
        const slice = lyrics.lines.slice(start, start + 4);

        slice.forEach((l, i) => {
          const globalIdx = start + i;
          const isCur = globalIdx === curIdx;
          const ry = py + 36 + i * 24;
          const over = inside(pointer.x, pointer.y, { x: px + 8, y: ry, width: pw - 16, height: 22 });
          if (over || isCur) box(px + 8, ry, pw - 16, 22, 6, isCur ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.06)');
          text(l.displayTime, px + 16, ry + 15, 10.5, isCur ? colour : 'rgba(255,255,255,.45)', 700, 'left');
          text(l.text, px + 58, ry + 15, isCur ? 12 : 11, isCur ? '#ffffff' : (over ? '#eef2ec' : 'rgba(235,240,230,.6)'), isCur ? 700 : 500, 'left', pw - 76);
          hit['spLrc' + i] = { x: px + 8, y: ry, width: pw - 16, height: 22, timeMs: l.timeMs };
        });
      }
    } else if (devicesOpen) {
      text(L('Play on', 'Cihazda Çal'), px + 16, py + 24, 13, '#fff', 700);
      text('✕', px + pw - 18, py + 24, 13, 'rgba(255,255,255,.6)', 700, 'center');
      hit.spDevClose = { x: px + pw - 32, y: py + 6, width: 28, height: 28 };
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

    ctx.restore();
  };

  async function control(action) {
    window.dispatchEvent(new CustomEvent('lumadock:badge', { detail: 'dj' }));
    if (action === 'play' || action === 'pause') { spotifyState.is_playing = action === 'play'; spotifySyncAt = performance.now(); }
    api.spotifyControl(action).catch(() => {});
    setTimeout(() => refreshSpotify(), 50);
    setTimeout(() => refreshSpotify(), 300);
  }
  window.__lumadockSpotifyControl = control;

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
  window.addEventListener('click', e => { if (swallowClick) { swallowClick = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  canvas.addEventListener('wheel', e => {
    if (currentView === 'spotify' && mode === 'expanded' && playlistsOpen && playlists.length > 8 && inside(e.clientX, e.clientY, islandBounds)) {
      const totalPages = Math.ceil(playlists.length / 8);
      if (e.deltaY > 0 || e.deltaX > 0) plPage = Math.min(totalPages - 1, plPage + 1);
      else if (e.deltaY < 0 || e.deltaX < 0) plPage = Math.max(0, plPage - 1);
      return;
    }
    if (!canSwipe(e.clientX, e.clientY) || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    const now = performance.now(); if (now - wheelAt > 250) wheelX = 0; wheelAt = now; wheelX += e.deltaX;
    if (Math.abs(wheelX) > 90) { swipe(wheelX > 0 ? 1 : -1); wheelX = 0; }
  }, { passive: true });
  canvas.addEventListener('click', async event => {
    if (currentView !== 'spotify' || mode !== 'expanded') return;
    const x = event.clientX, y = event.clientY, hits = {
      spDevClose: () => { devicesOpen = false; },
      ...Object.fromEntries([0, 1, 2, 3].map(i => ['spDev' + i, () => hit['spDev' + i]?.device && moveTo(hit['spDev' + i].device)])),
      spDevices: () => { devicesOpen = !devicesOpen; if (devicesOpen) { lyricsOpen = false; playlistsOpen = false; loadDevices(); } },
      spLyrics: () => { lyricsOpen = !lyricsOpen; if (lyricsOpen) { devicesOpen = false; playlistsOpen = false; } },
      spLyricsClose: () => { lyricsOpen = false; },
      spLrcMinus: () => setLrcOffset(lrcOffsetMs - 500),
      spLrcReset: () => setLrcOffset(0),
      spLrcPlus: () => setLrcOffset(lrcOffsetMs + 500),
      spLiveLrc: () => { lyricsOpen = true; devicesOpen = false; playlistsOpen = false; },
      ...Object.fromEntries([0, 1, 2, 3].map(i => ['spLrc' + i, () => {
        const item = hit['spLrc' + i];
        if (item && item.timeMs !== undefined) {
          spotifyState.progress_ms = item.timeMs;
          spotifySyncAt = performance.now();
          api.spotifySeek(item.timeMs).catch(() => {});
          setTimeout(() => refreshSpotify(), 80);
        }
      }])),
      spPlaylists: () => {
        playlistsOpen = !playlistsOpen;
        if (playlistsOpen) { devicesOpen = false; lyricsOpen = false; loadPlaylists(false); }
      },
      spPlClose: () => { playlistsOpen = false; },
      spPlRefresh: () => { loadPlaylists(true); },
      spPlAddClip: async () => {
        const res = await api.spotifyAddPlaylistUrl?.({ fromClipboard: true }).catch(e => ({ ok: false, error: e?.message }));
        if (res?.ok) {
          playlistsAuthNeed = false;
          playlistsNote = '';
          window.__lumadockChime?.('pop');
          await loadPlaylists(true);
        } else {
          playlistsNote = res?.error || L('No playlist URL in clipboard.', 'Panoda playlist bağlantısı yok.');
        }
      },
      spPlSettings: () => { api.settingsOpen?.('connect'); },
      spPlPrev: () => { if (plPage > 0) plPage--; },
      spPlNext: () => { plPage++; },
      spPlAuth: async () => {
        playlistsNote = L('Waiting for Spotify browser approval…', 'Tarayıcıda Spotify onayı bekleniyor…');
        try {
          await api.spotifyReconnect?.();
          playlistsAuthNeed = false;
          playlistsNote = '';
          refreshSpotify();
        } catch (err) {
          playlistsNote = String(err?.message || err || L('Authorization failed.', 'Yetkilendirme başarısız.'));
          return;
        }
        await loadPlaylists(true);
      },
      ...Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7].map(i => ['spPlTile' + i, () => hit['spPlTile' + i]?.playlist && openPlaylist(hit['spPlTile' + i].playlist)])),
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
    const lrcKeys = ['spLyrics', 'spLyricsClose', 'spLrcMinus', 'spLrcReset', 'spLrcPlus', 'spLrc0', 'spLrc1', 'spLrc2', 'spLrc3'];
    const plKeys = ['spPlaylists', 'spPlClose', 'spPlRefresh', 'spPlAddClip', 'spPlSettings', 'spPlPrev', 'spPlNext', 'spPlAuth', ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => 'spPlTile' + i)];
    if (playlistsOpen && !plKeys.some(k => inside(x, y, hit[k]))) { playlistsOpen = false; event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (lyricsOpen && !lrcKeys.some(k => inside(x, y, hit[k]))) { lyricsOpen = false; event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (devicesOpen && !['spDevices', 'spDevClose', 'spDev0', 'spDev1', 'spDev2', 'spDev3'].some(k => inside(x, y, hit[k]))) { devicesOpen = false; event.preventDefault(); event.stopImmediatePropagation(); return; }
    for (const [key, run] of Object.entries(hits)) {
      if (inside(x, y, hit[key])) { event.preventDefault(); event.stopImmediatePropagation(); run(); return; }
    }
  }, true);
})();
