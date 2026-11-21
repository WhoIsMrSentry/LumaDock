'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

test('native PowerShell scripts parse with zero syntax errors', () => {
  if (process.platform !== 'win32') return;
  const nativeDir = path.join(ROOT, 'src', 'native');
  const scripts = fs.readdirSync(nativeDir).filter(f => f.endsWith('.ps1')).map(f => path.join(nativeDir, f));
  assert.ok(scripts.length >= 4, 'Expected native .ps1 scripts');
  const checkScript = `
$errors = 0
foreach ($f in $args) {
  $tokens = $null; $parseErr = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile($f, [ref]$tokens, [ref]$parseErr)
  if ($parseErr -and $parseErr.Count -gt 0) {
    foreach ($e in $parseErr) { Write-Error "$($f): $($e.Message)" }
    $errors++
  }
}
exit $errors
`;
  execFileSync(POWERSHELL, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', checkScript, ...scripts], { encoding: 'utf8' });
});

test('volume-watch.ps1 starts and exits cleanly when parent PID is gone', () => {
  if (process.platform !== 'win32') return;
  const scriptPath = path.join(ROOT, 'src', 'native', 'volume-watch.ps1');
  const out = execFileSync(POWERSHELL, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-Parent', '999999'], { encoding: 'utf8', timeout: 8000 });
  assert.match(out, /^\d+ [01]/m);
});

test('calendar ICS parser extracts meeting URLs and ignores unsafe schemes', () => {
  const { parseIcs } = require(path.join(ROOT, 'src', 'main', 'extras-main.cjs'));
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'SUMMARY:Sprint Standup',
    'DTSTART:20261120T090000Z',
    'X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'SUMMARY:Client Sync',
    'DTSTART:20261120T110000Z',
    'LOCATION:Zoom',
    'DESCRIPTION:Join here https://us06web.zoom.us/j/123456789?pwd=xyz thanks',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'SUMMARY:Unsafe Link',
    'DTSTART:20261120T120000Z',
    'URL:javascript:alert(1)',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  const events = parseIcs(ics);
  assert.equal(events.length, 3);
  assert.equal(events[0].url, 'https://meet.google.com/abc-defg-hij');
  assert.equal(events[1].url, 'https://us06web.zoom.us/j/123456789?pwd=xyz');
  assert.equal(events[2].url || '', '');
});

test('settings-app URL allowlist & semver comparison behave securely', () => {
  const { isAllowedExternalUrl, compareVersions } = require(path.join(ROOT, 'src', 'main', 'settings-app-main.cjs'));
  assert.equal(isAllowedExternalUrl('https://github.com/WhoIsMrSentry/LumaDock/releases'), true);
  assert.equal(isAllowedExternalUrl('https://lumadock.app/docs'), true);
  assert.equal(isAllowedExternalUrl('https://github.com/WhoIsMrSentry/LumaDockEvil'), false);
  assert.equal(isAllowedExternalUrl('http://github.com/WhoIsMrSentry/LumaDock'), false);
  assert.equal(isAllowedExternalUrl('https://example.com'), false);

  assert.ok(compareVersions('1.2.1', '1.2.0-beta.2') > 0);
  assert.equal(compareVersions('v1.2.0', '1.2.0'), 0);
  assert.ok(compareVersions('1.1.9', '1.2.0') < 0);
});

test('claude-code-hooks supports Gemini CLI & Cursor hooks plus token/cost telemetry', async () => {
  process.env.LUMADOCK_HOOK_PORT ||= '47898';
  const { createHub, GEMINI_EVENTS, CURSOR_EVENTS } = require(path.join(ROOT, 'src', 'main', 'claude-code-hooks.cjs'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumadock-multiagent-'));
  let hub;
  try {
    const geminiHome = path.join(dir, '.gemini');
    const cursorHome = path.join(dir, '.cursor');
    fs.mkdirSync(geminiHome, { recursive: true });
    fs.mkdirSync(cursorHome, { recursive: true });

    hub = createHub({ userData: dir, settingsFile: path.join(dir, '.claude', 'settings.json'), geminiHome, cursorHome });
    assert.equal(hub.geminiAvailable(), true);
    assert.equal(hub.cursorAvailable(), true);
    assert.equal(hub.geminiInstalled(), false);
    assert.equal(hub.cursorInstalled(), false);

    hub.installGemini();
    hub.installCursor();
    hub.start();
    await new Promise(r => setTimeout(r, 80));
    assert.equal(hub.geminiInstalled(), true);
    assert.equal(hub.cursorInstalled(), true);

    const gCfg = JSON.parse(fs.readFileSync(path.join(geminiHome, 'settings.json'), 'utf8'));
    for (const ev of GEMINI_EVENTS) assert.ok(Array.isArray(gCfg.hooks[ev]));
    const cCfg = JSON.parse(fs.readFileSync(path.join(cursorHome, 'hooks.json'), 'utf8'));
    for (const ev of CURSOR_EVENTS) assert.ok(Array.isArray(cCfg.hooks[ev]));

    // Simulate Gemini CLI hook events via aliases + token usage
    hub.apply({ session_id: 'gem-1', cwd: 'C:\\Work\\proj', hook_event_name: 'BeforeAgent', prompt: 'Add tests' }, null, 'gemini');
    hub.apply({ session_id: 'gem-1', hook_event_name: 'BeforeTool', tool_name: 'Read', tool_input: { file_path: 'a.js' } }, null, 'gemini');
    hub.applyUsage({ session_id: 'gem-1', tokens: 4200, total_cost_usd: 0.012 });
    hub.apply({ session_id: 'gem-1', hook_event_name: 'AfterTool', tool_name: 'Read' }, null, 'gemini');
    hub.apply({ session_id: 'gem-1', hook_event_name: 'AfterAgent', last_assistant_message: 'Added all tests.', usage: { total_tokens: 4500, total_cost_usd: 0.015 } }, null, 'gemini');

    const gView = hub.view('gemini');
    assert.equal(gView.state, 'done');
    assert.equal(gView.tokens, 4500);
    assert.equal(gView.costUsd, 0.015);
    assert.equal(hub.history()[0].agent, 'gemini');
    assert.equal(hub.history()[0].tokens, 4500);

    hub.uninstallGemini();
    hub.uninstallCursor();
    assert.equal(hub.geminiInstalled(), false);
    assert.equal(hub.cursorInstalled(), false);
  } finally {
    hub?.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('AI model catalog uses real models and custom base URL config', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'main', 'project-mode-main.js'), 'utf8');
  assert.doesNotMatch(src, /gpt-6-luna|gpt-6\.1-sol|gpt-6-astra/);
  assert.match(src, /'gpt-4\.1'/);
  assert.match(src, /ai-settings:set-base-url/);
});

test('inline scripts in mascot.html, settings-app.html and buddy.html parse with zero syntax errors', () => {
  const vm = require('node:vm');
  for (const name of ['mascot.html', 'settings-app.html', 'buddy.html']) {
    const html = fs.readFileSync(path.join(ROOT, name), 'utf8');
    const scripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
    assert.ok(scripts.length >= 1, `Expected inline script in ${name}`);
    scripts.forEach((m, idx) => {
      new vm.Script(m[1], { filename: `${name}#script-${idx}` });
    });
  }
});

test('spotify helpers normalize Turkish/remastered metadata, parse extended LRC tags, and classify 401 vs 403', () => {
  const {
    DEFAULT_SPOTIFY_CLIENT_ID,
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
  } = require(path.join(ROOT, 'src', 'main', 'spotify-helpers.cjs'));

  assert.equal(DEFAULT_SPOTIFY_CLIENT_ID, '');
  assert.equal(isValidSpotifyClientId('0123456789abcdef0123456789abcdef'), true);
  assert.equal(isValidSpotifyClientId('bad-id'), false);

  assert.equal(hasSpotifyPlaylistScope({ scope: 'user-read-playback-state playlist-read-private' }), true);
  assert.equal(hasSpotifyPlaylistScope({ scope: 'user-read-playback-state' }), false);

  const meta = normalizeTrackMeta('Şebnem Ferah - Yağmurlar (Official Video) - YouTube Music', 'Chrome');
  assert.equal(meta.artist, 'Şebnem Ferah');
  assert.equal(meta.title, 'Yağmurlar');

  const queries = buildLyricsQueries('Dönence - Remastered 2021 (Live)', 'Barış Manço');
  assert.ok(queries.some(q => q.title === 'Dönence' && q.artist === 'Barış Manço'));

  const lrc = parseLrcLines([
    '[0:05.5]İlk satır',
    '[00:12.34][01:02]Nakarat ğüşiöç',
    '[00:25.125]Üçüncü satır'
  ].join('\r\n'));
  assert.equal(lrc.length, 4);
  assert.deepEqual(lrc.map(l => l.timeMs), [5500, 12340, 25125, 62000]);
  assert.equal(lrc[1].text, 'Nakarat ğüşiöç');
  assert.equal(lrc[3].text, 'Nakarat ğüşiöç');

  const err401 = classifySpotifyPlaylistsError({ status: 401, message: 'Unauthorized' });
  assert.equal(err401.needsReauth, true);

  const errScope = classifySpotifyPlaylistsError({ status: 403, message: 'Insufficient client scope' });
  assert.equal(errScope.needsReauth, true);

  const errDev403 = classifySpotifyPlaylistsError({ status: 403, message: 'User not registered in the Developer Dashboard' });
  assert.equal(errDev403.needsReauth, false);
  assert.equal(errDev403.devModeError, true);

  const { setLanguage, getLanguage } = require(path.join(ROOT, 'src', 'shared', 'i18n.cjs'));
  const prevLang = getLanguage();
  try {
    setLanguage('en');
    const htmlEn = renderSpotifyCallbackHtml(true);
    assert.match(htmlEn, /<meta charset="utf-8">/i);
    assert.match(htmlEn, /Spotify connected/);
    setLanguage('tr');
    const htmlTr = renderSpotifyCallbackHtml(true);
    assert.match(htmlTr, /Spotify bağlandı/);
  } finally {
    setLanguage(prevLang);
  }

  const plUrl = parseSpotifyPlaylistInput('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc123');
  assert.deepEqual(plUrl, {
    id: '37i9dQZF1DXcBWIGoYBM5M',
    uri: 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M',
    url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'
  });
  assert.equal(parseSpotifyPlaylistInput('https://example.com/not-spotify'), null);

  const tracks = extractPlaylistTracks({
    items: [
      { track: { id: 't1', name: 'Şarkı 1', artists: [{ name: 'Sanatçı' }], uri: 'spotify:track:t1', duration_ms: 185000, album: { images: [{ url: 'https://img/0' }] } } },
      { item: { id: 't2', name: 'Song 2', artists: [{ name: 'Artist A' }, { name: 'Artist B' }], uri: 'spotify:track:t2', duration_ms: 210000 } },
      { item: { id: 'e3', type: 'episode', name: 'Podcast Bölümü', show: { name: 'Podcast Show' }, duration_ms: 600000 } },
      { track: null }
    ]
  });
  assert.equal(tracks.length, 3);
  assert.equal(tracks[0].name, 'Şarkı 1');
  assert.equal(tracks[0].image_url, 'https://img/0');
  assert.equal(tracks[1].artist, 'Artist A, Artist B');
  assert.equal(tracks[2].uri, 'spotify:episode:e3');
  assert.equal(tracks[2].artist, 'Podcast Show');

  assert.equal(
    parseSpotifyNextPath('https://api.spotify.com/v1/playlists/pl123/items?offset=100&limit=100'),
    '/v1/playlists/pl123/items?offset=100&limit=100'
  );
  assert.equal(parseSpotifyNextPath('https://evil.example.com/v1/playlists/pl123/items'), '');
});

test('Spotify playlist pagination collects all tracks and playlists across multiple pages', async () => {
  const {
    collectPagedSpotifyTracks,
    collectPagedSpotifyPlaylists
  } = require(path.join(ROOT, 'src', 'main', 'spotify-helpers.cjs'));

  // 1. Multi-page playlist (>100 tracks: 235 total across 3 pages)
  const makeTrack = i => ({
    item: {
      id: `trk${i}`,
      name: `Parça ${i}`,
      artists: [{ name: `Sanatçı ${i}` }],
      uri: `spotify:track:trk${i}`,
      duration_ms: 180000 + i
    }
  });
  const seenRoutes = [];
  const resAll = await collectPagedSpotifyTracks(async route => {
    seenRoutes.push(route);
    if (route.includes('offset=0')) {
      return {
        items: Array.from({ length: 100 }, (_, i) => makeTrack(i)),
        total: 235,
        next: 'https://api.spotify.com/v1/playlists/abc123456789/items?offset=100&limit=100&additional_types=track,episode'
      };
    }
    if (route.includes('offset=100')) {
      return {
        items: Array.from({ length: 100 }, (_, i) => makeTrack(100 + i)),
        total: 235,
        next: 'https://api.spotify.com/v1/playlists/abc123456789/items?offset=200&limit=100&additional_types=track,episode'
      };
    }
    return {
      items: Array.from({ length: 35 }, (_, i) => makeTrack(200 + i)),
      total: 235,
      next: null
    };
  }, 'abc123456789');

  assert.equal(resAll.tracks.length, 235);
  assert.equal(resAll.total, 235);
  assert.equal(resAll.partial, false);
  assert.equal(resAll.tracks[234].id, 'trk234');
  assert.equal(seenRoutes.length, 3);

  // 2. Fallback from /items to legacy /tracks on page 0 continues subsequent pages via /tracks + offset
  const fallbackRoutes = [];
  const resFallback = await collectPagedSpotifyTracks(async route => {
    fallbackRoutes.push(route);
    if (route.includes('/items?')) throw new Error('Spotify HTTP 404');
    if (route.includes('offset=0')) {
      return {
        items: Array.from({ length: 100 }, (_, i) => makeTrack(i)),
        total: 120,
        next: null
      };
    }
    return {
      items: Array.from({ length: 20 }, (_, i) => makeTrack(100 + i)),
      total: 120,
      next: null
    };
  }, 'fallback123456');

  assert.equal(resFallback.tracks.length, 120);
  assert.ok(fallbackRoutes[1].includes('/tracks?'));
  assert.ok(fallbackRoutes[2].includes('/tracks?') && fallbackRoutes[2].includes('offset=100'));

  // 3. Playlists pagination (>50 playlists)
  const pls = await collectPagedSpotifyPlaylists(async route => {
    if (route.includes('offset=0')) {
      return {
        items: Array.from({ length: 50 }, (_, i) => ({
          id: `pl${i}`, name: `Liste ${i}`, uri: `spotify:playlist:pl${i}`, items: { total: i + 10 }
        })),
        next: 'https://api.spotify.com/v1/me/playlists?offset=50&limit=50'
      };
    }
    return {
      items: Array.from({ length: 12 }, (_, i) => ({
        id: `pl${50 + i}`, name: `Liste ${50 + i}`, uri: `spotify:playlist:pl${50 + i}`, tracks: { total: i + 5 }
      })),
      next: null
    };
  });
  assert.equal(pls.length, 62);
  assert.equal(pls[0].tracks_total, 10);
  assert.equal(pls[61].tracks_total, 16);
});

test('Windows media watcher preserves Turkish UTF-8 characters without mojibake', () => {
  if (process.platform !== 'win32') return;
  const { StringDecoder } = require('node:string_decoder');
  const scriptPath = path.join(ROOT, 'src', 'native', 'media-watch.ps1');
  const src = fs.readFileSync(scriptPath, 'utf8');
  assert.match(src, /OutputEncoding\s*=\s*New-Object\s+System\.Text\.UTF8Encoding\(\$false\)/);
  // Test PowerShell UTF-8 pipe output with Turkish characters across multi-byte chunk splits
  const psCmd = `[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false); Write-Output (@{title='Öğle Güneşi';artist='Şebnem Ferah'} | ConvertTo-Json -Compress)`;
  const buf = execFileSync(POWERSHELL, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', psCmd]);
  const dec = new StringDecoder('utf8');
  let out = '';
  for (let i = 0; i < buf.length; i += 3) out += dec.write(buf.subarray(i, i + 3));
  out += dec.end();
  const parsed = JSON.parse(out.trim());
  assert.equal(parsed.title, 'Öğle Güneşi');
  assert.equal(parsed.artist, 'Şebnem Ferah');
});

test('i18n catalogs have full EN/TR key and placeholder parity and support only en/tr', () => {
  const i18n = require(path.join(ROOT, 'src', 'shared', 'i18n.cjs'));
  const { en, tr } = i18n.getCatalogs(true);
  const flatten = (obj, prefix = '') => {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, key));
      else out[key] = v;
    }
    return out;
  };
  const enFlat = flatten(en);
  const trFlat = flatten(tr);
  assert.deepEqual(Object.keys(trFlat).sort(), Object.keys(enFlat).sort(), 'EN and TR locale keys must match');

  const placeholders = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
  for (const key of Object.keys(enFlat)) {
    if (typeof enFlat[key] === 'string' && typeof trFlat[key] === 'string') {
      assert.deepEqual(placeholders(trFlat[key]), placeholders(enFlat[key]), `Placeholder mismatch in ${key}`);
    }
    assert.doesNotMatch(String(trFlat[key]), /twocode/i, `Legacy brand in tr.${key}`);
    assert.doesNotMatch(String(enFlat[key]), /twocode/i, `Legacy brand in en.${key}`);
  }

  assert.deepEqual(i18n.SUPPORTED_LANGS, ['en', 'tr']);
  assert.equal(i18n.normalizeLang('tr-TR'), 'tr');
  assert.equal(i18n.normalizeLang('nl-NL'), 'en');
  assert.equal(i18n.normalizeLang('en-US'), 'en');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumadock-i18n-'));
  const prevLang = i18n.getLanguage();
  try {
    let notified = null;
    const off = i18n.onLanguageChange(lang => { notified = lang; });
    i18n.setLanguage('en');
    assert.equal(i18n.setLanguage('tr', { persist: true, userDataDir: tmpDir }), 'tr');
    assert.equal(notified, 'tr');
    off();
    assert.equal(i18n.detectLanguage(tmpDir), 'tr');
    assert.equal(i18n.tn('monitor.files', 1, null, 'en'), '1 file');
    assert.equal(i18n.tn('monitor.files', 3, null, 'en'), '3 files');
    assert.equal(i18n.tn('monitor.files', 3, null, 'tr'), '3 dosya');
  } finally {
    i18n.setLanguage(prevLang);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('AI monitor supports Turkish and English chat window detection without Dutch phrases', () => {
  const { observe, questionFrom } = require(path.join(ROOT, 'src', 'main', 'ai-monitor-model.cjs'));
  const obsTr = observe({
    ok: true,
    provider: 'chatgpt',
    contextKey: '1:1:1:https://chatgpt.com/c/tr',
    nodes: [
      { index: 0, parent: -1, id: 'n0', type: 'Document', name: 'ChatGPT', enabled: true },
      { index: 1, parent: 0, id: 'n1', type: 'Text', name: 'ChatGPT dedi:', enabled: true },
      { index: 2, parent: 0, id: 'n2', type: 'Text', name: 'Hangi rengi istersin?', enabled: true },
      { index: 3, parent: 0, id: 'n3', type: 'Button', name: 'Kopyala', enabled: true },
      { index: 4, parent: 0, id: 'n4', type: 'Edit', name: 'ChatGPT\'e sor', enabled: true }
    ]
  }, 'chatgpt');
  assert.equal(obsTr.valid, true);
  assert.equal(obsTr.completed, true);
  assert.equal(obsTr.question, 'Hangi rengi istersin?');
  assert.notEqual(questionFrom('Hazır. Haber ver.'), '');
  assert.equal(questionFrom('Örnek: hangi rengi istersin?'), '');
});

test('all C#/PowerShell native AI monitor exceptions map to localized EN/TR keys and unwrap InnerException', () => {
  const { resolveNativeError } = require(path.join(ROOT, 'src', 'main', 'ai-monitor-model.cjs'));
  const { setLanguage, getLanguage } = require(path.join(ROOT, 'src', 'shared', 'i18n.cjs'));
  const cs = fs.readFileSync(path.join(ROOT, 'src', 'native', 'windows-ai-access.cs'), 'utf8');
  const ps = fs.readFileSync(path.join(ROOT, 'src', 'native', 'windows-ai-access.ps1'), 'utf8');
  assert.match(ps, /while\s*\(\$ex\.InnerException\)\s*\{\s*\$ex\s*=\s*\$ex\.InnerException\s*\}/);

  const rawMsgs = [...cs.matchAll(/throw\s+new\s+Exception\("([^"]+)"\)/g)].map(m => m[1]);
  rawMsgs.push('Unknown command.');
  assert.ok(rawMsgs.length >= 25);

  const prev = getLanguage();
  try {
    setLanguage('tr');
    for (const msg of rawMsgs) {
      const r = resolveNativeError(msg);
      assert.ok(r.key, `Missing native i18n mapping for: ${msg}`);
      assert.notEqual(r.text, msg, `Expected Turkish translation for: ${msg}`);
      const wrapped = resolveNativeError(`Exception calling "Open" with "1" argument(s): "${msg}"`);
      assert.equal(wrapped.key, r.key);
      assert.equal(wrapped.text, r.text);
    }
  } finally {
    setLanguage(prev);
  }
});
