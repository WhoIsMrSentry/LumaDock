'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { t, getLanguage } = require('../shared/i18n.cjs');

/** Spotify Client ID must be supplied locally via Settings, env var, or CI build-config.json (never hardcoded in git). */
function isValidSpotifyClientId(value) {
  return /^[0-9a-f]{32}$/i.test(String(value || '').trim());
}

function getBundledSpotifyClientId() {
  try {
    const cfgPath = path.join(__dirname, 'build-config.json');
    if (fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      const id = String(parsed?.spotifyClientId || '').trim();
      if (isValidSpotifyClientId(id)) return id;
    }
  } catch {}
  return '';
}

function getDefaultSpotifyClientId() {
  const envId = String(process.env.LUMADOCK_SPOTIFY_CLIENT_ID || '').trim();
  if (isValidSpotifyClientId(envId)) return envId;
  return getBundledSpotifyClientId();
}

const DEFAULT_SPOTIFY_CLIENT_ID = getDefaultSpotifyClientId();

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
    return { ok: false, needsReauth: true, playlists: [], error: msg || t('spotify.errors.sessionNeedsRefresh') };
  }
  if (status === 403) {
    return {
      ok: false,
      needsReauth: false,
      devModeError: true,
      playlists: [],
      error: t('spotify.errors.devModeForbidden', { msg: msg || 'Forbidden' })
    };
  }
  return {
    ok: false,
    playlists: Array.isArray(cachedItems) ? cachedItems : [],
    error: msg || t('spotify.couldNotLoadPlaylists')
  };
}

/** Render UTF-8 Spotify OAuth callback HTML with explicit charset meta tag. */
function renderSpotifyCallbackHtml(ok, detail = '') {
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lang = getLanguage();
  const title = ok ? t('spotify.callbackTitleSuccess', null, lang) : t('spotify.callbackTitleFail', null, lang);
  const body = ok ? t('spotify.callbackBodySuccess', null, lang) : esc(detail || t('spotify.callbackBodyFail', null, lang));
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>LumaDock — Spotify</title></head><body style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#0b0e0b;color:#fff;padding:50px;text-align:center;"><h2>${title}</h2><p style="color:#a7b4a5">${body}</p></body></html>`;
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

/** Normalize Spotify playlist items response (/items and legacy /tracks) into uniform track entries. */
function extractPlaylistTracks(data) {
  return (data?.items || [])
    .map(entry => entry?.track || entry?.item || (entry?.name ? entry : null))
    .map(t => {
      if (!t || !t.name) return null;
      const type = t.type === 'episode' ? 'episode' : 'track';
      const uri = String(t.uri || (t.id ? `spotify:${type}:${t.id}` : '')).trim();
      if (!uri) return null;
      const artist = Array.isArray(t.artists)
        ? t.artists.map(a => a?.name).filter(Boolean).join(', ')
        : (t.show?.name || (Array.isArray(t.album?.artists) ? t.album.artists.map(a => a?.name).filter(Boolean).join(', ') : ''));
      return {
        id: String(t.id || ''),
        name: String(t.name || ''),
        artist,
        uri,
        image_url: String(t.album?.images?.[2]?.url || t.album?.images?.[0]?.url || t.images?.[0]?.url || ''),
        duration_ms: Number(t.duration_ms || 0),
        external_url: String(t.external_urls?.spotify || '')
      };
    })
    .filter(Boolean);
}

/** Convert a full Spotify API pagination URL into a safe relative /v1/... path. */
function parseSpotifyNextPath(nextUrl) {
  if (!nextUrl || typeof nextUrl !== 'string') return '';
  try {
    const u = new URL(nextUrl.trim());
    if (u.protocol !== 'https:' || u.hostname !== 'api.spotify.com') return '';
    return `${u.pathname}${u.search}`;
  } catch {
    return '';
  }
}

/** Fetch all pages of a Spotify playlist track list up to maxTracks, preferring /items and falling back to /tracks. */
async function collectPagedSpotifyTracks(fetchPage, playlistId, options = {}) {
  const encId = encodeURIComponent(String(playlistId || '').trim());
  const pageLimit = Math.max(1, Math.min(100, Number(options.pageLimit) || 100));
  const maxTracks = Math.max(pageLimit, Number(options.maxTracks) || 2000);
  const maxPages = Math.ceil(maxTracks / pageLimit) + 4;

  let endpoint = 'items';
  let route = `/v1/playlists/${encId}/${endpoint}?limit=${pageLimit}&offset=0&additional_types=track,episode`;
  let data;
  try {
    data = await fetchPage(route);
  } catch {
    endpoint = 'tracks';
    route = `/v1/playlists/${encId}/${endpoint}?limit=${pageLimit}&offset=0&additional_types=track,episode`;
    data = await fetchPage(route);
  }

  const tracks = [];
  const seenRoutes = new Set([route]);
  let offset = 0;
  let apiTotal = 0;
  let partial = false;
  let truncated = false;

  for (let page = 0; page < maxPages; page++) {
    if (page > 0) {
      try {
        data = await fetchPage(route);
      } catch {
        try {
          data = await fetchPage(route);
        } catch {
          partial = true;
          break;
        }
      }
    }

    const batch = extractPlaylistTracks(data);
    for (const item of batch) {
      if (tracks.length >= maxTracks) {
        truncated = true;
        break;
      }
      tracks.push(item);
    }

    const rawCount = Array.isArray(data?.items) ? data.items.length : 0;
    if (Number.isFinite(Number(data?.total))) {
      apiTotal = Math.max(apiTotal, Number(data.total));
    }
    offset += rawCount;

    if (tracks.length >= maxTracks) {
      if (apiTotal > tracks.length) truncated = true;
      break;
    }

    let nextRoute = parseSpotifyNextPath(data?.next);
    if (!nextRoute && rawCount > 0 && apiTotal > offset) {
      nextRoute = `/v1/playlists/${encId}/${endpoint}?limit=${pageLimit}&offset=${offset}&additional_types=track,episode`;
    }
    if (!nextRoute || seenRoutes.has(nextRoute)) break;
    seenRoutes.add(nextRoute);
    route = nextRoute;
  }

  return {
    tracks,
    total: Math.max(tracks.length, apiTotal),
    partial,
    truncated
  };
}

/** Fetch all pages of the user's Spotify playlists up to maxPlaylists. */
async function collectPagedSpotifyPlaylists(fetchPage, options = {}) {
  const pageLimit = Math.max(1, Math.min(50, Number(options.pageLimit) || 50));
  const maxPlaylists = Math.max(pageLimit, Number(options.maxPlaylists) || 250);
  const maxPages = Math.ceil(maxPlaylists / pageLimit) + 2;

  let route = `/v1/me/playlists?limit=${pageLimit}&offset=0`;
  const seenRoutes = new Set([route]);
  const playlists = [];

  for (let page = 0; page < maxPages; page++) {
    let data;
    try {
      data = await fetchPage(route);
    } catch (err) {
      if (page === 0) throw err;
      break;
    }

    const items = (data?.items || [])
      .filter(p => p && p.uri)
      .map(p => ({
        id: String(p.id || ''),
        name: String(p.name || ''),
        uri: String(p.uri || ''),
        image_url: String(p.images?.[0]?.url || ''),
        external_url: String(p.external_urls?.spotify || ''),
        tracks_total: Number(p.items?.total ?? p.tracks?.total ?? 0)
      }));

    for (const item of items) {
      if (playlists.length >= maxPlaylists) break;
      playlists.push(item);
    }
    if (playlists.length >= maxPlaylists) break;

    const nextRoute = parseSpotifyNextPath(data?.next);
    if (!nextRoute || seenRoutes.has(nextRoute)) break;
    seenRoutes.add(nextRoute);
    route = nextRoute;
  }

  return playlists;
}

module.exports = {
  DEFAULT_SPOTIFY_CLIENT_ID,
  getDefaultSpotifyClientId,
  getBundledSpotifyClientId,
  isValidSpotifyClientId,
  hasSpotifyPlaylistScope,
  normalizeTrackMeta,
  buildLyricsQueries,
  parseLrcLines,
  classifySpotifyPlaylistsError,
  renderSpotifyCallbackHtml,
  parseSpotifyPlaylistInput,
  extractPlaylistTracks,
  parseSpotifyNextPath,
  collectPagedSpotifyTracks,
  collectPagedSpotifyPlaylists
};
