'use strict';

/** Spotify Client ID must be supplied locally via Settings or LUMADOCK_SPOTIFY_CLIENT_ID (never hardcoded in git). */
const DEFAULT_SPOTIFY_CLIENT_ID = '';

/** Validate a Spotify 32-char hexadecimal Client ID. */
function isValidSpotifyClientId(value) {
  return /^[0-9a-f]{32}$/i.test(String(value || '').trim());
}

/** Check whether stored token scopes cover private/collaborative playlist reading. */
function hasSpotifyPlaylistScope(tokens) {
  if (!tokens || typeof tokens.scope !== 'string' || !tokens.scope.trim()) return true;
  const scopes = tokens.scope.trim().split(/\s+/);
  return scopes.includes('playlist-read-private') || scopes.includes('playlist-read-collaborative');
}

/** Normalize raw desktop/browser media metadata into clean title and artist strings. */
function normalizeTrackMeta(rawTitle, rawArtist) {
  let title = String(rawTitle || '')
    .replace(/\s*[-|•]\s*(YouTube Music|YouTube|Spotify|SoundCloud|Apple Music)\s*$/i, '')
    .trim();
  let artist = String(rawArtist || '').trim();
  if ((!artist || /^(youtube|chrome|msedge|brave|firefox|opera|music)$/i.test(artist)) && title.includes(' - ')) {
    const idx = title.indexOf(' - ');
    artist = title.slice(0, idx).trim();
    title = title.slice(idx + 3).trim();
  }
  const cleanTitle = title
    .replace(/\s*[\(\[]\s*(?:official|lyric|lyrics|audio|video|hd|4k|visualizer|remaster(?:ed)?|live|feat\.?|ft\.?)[^\)\]]*[\)\]]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || title;
  const cleanArtist = artist.replace(/\s*[-–]\s*Topic$/i, '').trim();
  return { title: cleanTitle, artist: cleanArtist };
}

/** Build ordered LRCLIB candidate track/artist pairs (handles parentheticals & ' - Remastered/Live'). */
function buildLyricsQueries(rawTitle, rawArtist) {
  const norm = normalizeTrackMeta(rawTitle, rawArtist);
  const candidates = [];
  const push = (t, a) => {
    const title = String(t || '').trim();
    const artist = String(a || '').trim();
    if (!title) return;
    if (!candidates.some(c => c.title.toLowerCase() === title.toLowerCase() && c.artist.toLowerCase() === artist.toLowerCase())) {
      candidates.push({ title, artist });
    }
  };
  const noParen = norm.title.replace(/\s*[\(\[].*$/, '').trim();
  const base = noParen || norm.title;
  const noDashTag = base.replace(/\s+[-–]\s+(?:remaster(?:ed)?|live|acoustic|radio\s*edit|single(?:\s+version)?|version|mix|edit|mono|stereo|deluxe|bonus|\d{4}\b).*$/i, '').trim();
  const beforeDash = base.replace(/\s+[-–]\s+.*$/, '').trim();

  push(base, norm.artist);
  push(noDashTag, norm.artist);
  push(beforeDash, norm.artist);
  push(norm.title, norm.artist);
  return candidates;
}

/** Parse standard/extended LRC synced timestamps ([m:ss], [mm:ss.xx], [mm:ss.xxx], multi-tag) sorted ascending. */
function parseLrcLines(syncedLyrics) {
  if (!syncedLyrics) return [];
  const lines = [];
  for (const rawLine of String(syncedLyrics).split(/\r?\n/)) {
    const tagRe = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g;
    const timestamps = [];
    let match;
    let lastEnd = 0;
    while ((match = tagRe.exec(rawLine)) !== null) {
      if (match.index !== lastEnd && rawLine.slice(lastEnd, match.index).trim()) break;
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const msRaw = match[3] ? match[3].padEnd(3, '0').slice(0, 3) : '000';
      const ms = parseInt(msRaw, 10);
      timestamps.push({ min, sec, timeMs: min * 60000 + sec * 1000 + ms });
      lastEnd = match.index + match[0].length;
    }
    if (!timestamps.length) continue;
    const text = rawLine.slice(lastEnd).trim();
    if (!text) continue;
    for (const ts of timestamps) {
      lines.push({
        timeMs: ts.timeMs,
        displayTime: `${ts.min}:${String(ts.sec).padStart(2, '0')}`,
        text
      });
    }
  }
  lines.sort((a, b) => a.timeMs - b.timeMs);
  return lines;
}

/** Classify Spotify /v1/me/playlists errors so HTTP 403 Dev Mode restrictions don't trigger an infinite re-auth loop. */
function classifySpotifyPlaylistsError(error, cachedItems = []) {
  const msg = String(error?.message || '');
  const status = Number(error?.status || (/403/.test(msg) ? 403 : /401/.test(msg) ? 401 : 0));
  const isScopeErr = /insufficient\s+client\s+scope|\bscope\b/i.test(msg);
  if (status === 401 || isScopeErr) {
    return { ok: false, needsReauth: true, playlists: [], error: msg || 'Spotify oturumu yenilenmeli.' };
  }
  if (status === 403) {
    return {
      ok: false,
      needsReauth: false,
      devModeError: true,
      playlists: [],
      error: `Spotify 403 (Geliştirici Modu / hesap izni): ${msg || 'Forbidden'}. Bağlantılar'dan kendi Spotify Client ID'nizi girebilirsiniz.`
    };
  }
  return {
    ok: false,
    playlists: Array.isArray(cachedItems) ? cachedItems : [],
    error: msg || 'Playlistler alınamadı.'
  };
}

/** Render UTF-8 Spotify OAuth callback HTML with explicit charset meta tag. */
function renderSpotifyCallbackHtml(ok, detail = '') {
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const title = ok ? 'Spotify bağlandı ✓' : 'Spotify bağlantısı başarısız';
  const body = ok ? "Bu sekmeyi kapatıp LumaDock'a dönebilirsiniz." : esc(detail || 'Lütfen LumaDock üzerinden tekrar deneyin.');
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>LumaDock — Spotify</title></head><body style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#0b0e0b;color:#fff;padding:50px;text-align:center;"><h2>${title}</h2><p style="color:#a7b4a5">${body}</p></body></html>`;
}

/** Extract and validate a Spotify playlist ID from an open.spotify.com URL or spotify:playlist URI. */
function parseSpotifyPlaylistInput(input) {
  const raw = String(input || '').trim();
  const uriMatch = /^spotify:playlist:([A-Za-z0-9]{10,40})$/.exec(raw);
  if (uriMatch) {
    const id = uriMatch[1];
    return { id, uri: `spotify:playlist:${id}`, url: `https://open.spotify.com/playlist/${id}` };
  }
  const urlMatch = /open\.spotify\.com\/(?:intl-[a-z-]+\/)?playlist\/([A-Za-z0-9]{10,40})(?:[/?#]|$)/i.exec(raw);
  if (urlMatch) {
    const id = urlMatch[1];
    return { id, uri: `spotify:playlist:${id}`, url: `https://open.spotify.com/playlist/${id}` };
  }
  return null;
}

module.exports = {
  DEFAULT_SPOTIFY_CLIENT_ID,
  isValidSpotifyClientId,
  hasSpotifyPlaylistScope,
  normalizeTrackMeta,
  buildLyricsQueries,
  parseLrcLines,
  classifySpotifyPlaylistsError,
  renderSpotifyCallbackHtml,
  parseSpotifyPlaylistInput
};
