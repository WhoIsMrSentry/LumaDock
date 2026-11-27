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
  assert.match(out, /^P [01] [01]/m);
  assert.match(out, /^F [01]/m);
  const volLine = out.split(/\r?\n/).find(l => /^\d+\s+[01]$/.test(l.trim()));
  if (volLine) assert.match(volLine.trim(), /^\d+ [01]$/);
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

test('packaging metadata includes all renderers/preloads, distinct Windows .exe artifacts, and macOS dmg/zip targets', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  for (const requiredFile of ['main.js', 'preload.js', 'buddy-preload.js', 'settings-app-preload.js', 'mascot.html', 'buddy.html', 'settings-app.html']) {
    assert.ok(pkg.build.files.includes(requiredFile), `package.json build.files must include ${requiredFile}`);
  }
  assert.notEqual(pkg.build.nsis?.artifactName, pkg.build.portable?.artifactName, 'nsis and portable must not overwrite the same .exe name');
  const macTargets = (pkg.build.mac?.target || []).map(t => t.target);
  assert.ok(macTargets.includes('dmg'));
  assert.ok(macTargets.includes('zip'));
});

test('preload exposes autostart login IPC and settings bridge awaits __lumadockSetLogin before saving', () => {
  const preloadSrc = fs.readFileSync(path.join(ROOT, 'preload.js'), 'utf8');
  assert.match(preloadSrc, /loginGet:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('app:login-get'\)/);
  assert.match(preloadSrc, /loginSet:\s*on\s*=>\s*ipcRenderer\.invoke\('app:login-set'/);
  assert.match(preloadSrc, /onLoginChanged:/);
  assert.match(preloadSrc, /restart:\s*\(\)\s*=>\s*ipcRenderer\.send\('app:restart'\)/);

  const bridgeSrc = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'settings-bridge-ui.js'), 'utf8');
  assert.match(bridgeSrc, /await\s+window\.__lumadockSetLogin\(/);
});

test('spotify helpers resolve build-config.json or LUMADOCK_SPOTIFY_CLIENT_ID without hardcoding secrets in git', () => {
  const helperPath = path.join(ROOT, 'src', 'main', 'spotify-helpers.cjs');
  const buildCfgPath = path.join(ROOT, 'src', 'main', 'build-config.json');
  const prevEnv = process.env.LUMADOCK_SPOTIFY_CLIENT_ID;
  const hadCfg = fs.existsSync(buildCfgPath);
  const prevCfg = hadCfg ? fs.readFileSync(buildCfgPath, 'utf8') : null;
  try {
    const sampleId = '0123456789abcdef0123456789abcdef';
    process.env.LUMADOCK_SPOTIFY_CLIENT_ID = '';
    fs.writeFileSync(buildCfgPath, JSON.stringify({ spotifyClientId: sampleId }));
    delete require.cache[require.resolve(helperPath)];
    const h = require(helperPath);
    assert.equal(h.getBundledSpotifyClientId(), sampleId);
    assert.equal(h.getDefaultSpotifyClientId(), sampleId);

    const envId = 'fedcba9876543210fedcba9876543210';
    process.env.LUMADOCK_SPOTIFY_CLIENT_ID = envId;
    assert.equal(h.getDefaultSpotifyClientId(), envId);
  } finally {
    if (prevEnv === undefined) delete process.env.LUMADOCK_SPOTIFY_CLIENT_ID;
    else process.env.LUMADOCK_SPOTIFY_CLIENT_ID = prevEnv;
    if (hadCfg) fs.writeFileSync(buildCfgPath, prevCfg);
    else fs.rmSync(buildCfgPath, { force: true });
    delete require.cache[require.resolve(helperPath)];
  }
});

test('QR generator builds valid ISO finder patterns and SVG data URLs locally', () => {
  const { generateQrMatrix, generateQrSvg, generateQrDataUrl } = require(path.join(ROOT, 'src', 'shared', 'qr.cjs'));
  const m = generateQrMatrix('http://192.168.1.10:54321/q/abc123');
  assert.ok(m.size >= 25 && (m.size - 21) % 4 === 0);
  // Top-left 7x7 finder outer ring + center
  for (let i = 0; i < 7; i++) {
    assert.equal(m.modules[0][i], 1);
    assert.equal(m.modules[6][i], 1);
    assert.equal(m.modules[i][0], 1);
    assert.equal(m.modules[i][6], 1);
  }
  assert.equal(m.modules[3][3], 1);
  // Dark module at (size - 8, 8)
  assert.equal(m.modules[m.size - 8][8], 1);

  const svg = generateQrSvg('LUMADOCK');
  assert.match(svg, /^<svg\b[^>]*viewBox="0 0 25 25"/);
  const uri = generateQrDataUrl('LUMADOCK');
  assert.match(uri, /^data:image\/svg\+xml;utf8,/);
  assert.throws(() => generateQrMatrix('x'.repeat(200)), /capacity/);
});

test('command evaluator safely parses math expressions, units and currency ratios', () => {
  const { evaluateMath, evaluateConversion } = require(path.join(ROOT, 'src', 'shared', 'command-eval.cjs'));
  assert.equal(evaluateMath('2 + 3 * 4')?.value, 14);
  assert.equal(evaluateMath('(10 + 5)^2 / 5')?.value, 45);
  assert.equal(evaluateMath('sqrt(144) + 0x10')?.value, 28);
  assert.equal(evaluateMath('1 / 0'), null);
  assert.equal(evaluateMath('process.exit(1)'), null);

  assert.equal(evaluateConversion('10 km to mi')?.formatted, '6.2137 mi');
  assert.equal(evaluateConversion('100 c to f')?.value, 212);
  assert.equal(evaluateConversion('2 gb to mb')?.value, 2048);
  const fx = evaluateConversion('200 usd to try', { USD: 1, TRY: 35.5, EUR: 0.92 });
  assert.equal(fx?.value, 7100);
  assert.match(fx?.formatted || '', /7,100 TRY/);
});

test('dev-tools parsers and LAN QR Drop server enforce token auth and parse netstat/git', async () => {
  const { parseNetstatPorts, parseLsofPorts, parseGitStatus, createLanDropManager } = require(path.join(ROOT, 'src', 'main', 'dev-tools-main.cjs'));
  const ns = [
    '  TCP    127.0.0.1:3000         0.0.0.0:0              LISTENING       4120',
    '  TCP    0.0.0.0:5173           0.0.0.0:0              LISTENING       5512',
    '  TCP    0.0.0.0:47823          0.0.0.0:0              LISTENING       9999'
  ].join('\n');
  const tl = '"node.exe","4120","Console","1","10,000 K"\n"vite.exe","5512","Console","1","8,000 K"\n';
  const ports = parseNetstatPorts(ns, tl, 9999);
  assert.deepEqual(ports.map(p => [p.port, p.process]), [[3000, 'node'], [5173, 'vite']]);

  const lsof = 'COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\nnode 444 me 21u IPv4 0x1 0t0 TCP 127.0.0.1:8080 (LISTEN)\n';
  assert.equal(parseLsofPorts(lsof, 1)[0].port, 8080);

  const git = parseGitStatus('## main...origin/main [ahead 2]\n M src/ui/tools-ui.js\n?? new.txt\n', 'C:\\Work\\app');
  assert.equal(git.branch, 'main');
  assert.equal(git.ahead, 2);
  assert.equal(git.modified, 1);
  assert.equal(git.untracked, 1);
  assert.equal(git.dirty, 2);

  // LAN QR Drop server roundtrip test
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumadock-qrdrop-'));
  const tmpFile = path.join(dir, 'hello.txt');
  fs.writeFileSync(tmpFile, 'LumaDock LAN Drop Payload', 'utf8');
  const mgr = createLanDropManager();
  try {
    const share = await mgr.start([tmpFile]);
    assert.ok(share.active);
    assert.match(share.qrDataUrl, /^data:image\/svg\+xml;utf8,/);
    const u = new URL(share.url);
    const localUrl = `http://127.0.0.1:${u.port}${u.pathname}`;
    const pageRes = await fetch(localUrl);
    assert.equal(pageRes.status, 200);
    assert.match(await pageRes.text(), /hello\.txt/);

    const fileRes = await fetch(localUrl + '/f/0');
    assert.equal(fileRes.status, 200);
    assert.equal(await fileRes.text(), 'LumaDock LAN Drop Payload');

    const badRes = await fetch(`http://127.0.0.1:${u.port}/q/wrongtoken/f/0`);
    assert.equal(badRes.status, 404);
  } finally {
    await mgr.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('all modified UI scripts parse with zero syntax errors', () => {
  const vm = require('node:vm');
  for (const rel of [
    'src/ui/command-ui.js',
    'src/ui/focus-ui.js',
    'src/ui/tools-ui.js',
    'src/ui/dock-studio-ui.js',
    'src/ui/extras-ui.js',
    'src/ui/lumadock-fun.js',
    'src/ui/spotify-ui.js',
    'src/ui/ai-monitor-ui.js',
    'src/ui/pages-ui.js',
    'src/ui/blob-ui.js',
    'src/ui/icons-ui.js',
    'src/ui/chat-ui.js'
  ]) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    new vm.Script(src, { filename: rel });
  }
  for (const rel of ['src/ui/snip.html', 'src/ui/pin.html']) {
    const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    assert.ok(scripts.length > 0, `${rel} must contain inline script`);
    scripts.forEach((m, idx) => new vm.Script(m[1], { filename: `${rel}#${idx}` }));
  }
});

test('non-blocking architecture: no screen-capture loop, PDH GPU stall, or unguarded clipboard toPNG poll', () => {
  const extrasUi = fs.readFileSync(path.join(ROOT, 'src/ui/extras-ui.js'), 'utf8');
  const extrasMain = fs.readFileSync(path.join(ROOT, 'src/main/extras-main.cjs'), 'utf8');
  const devToolsMain = fs.readFileSync(path.join(ROOT, 'src/main/dev-tools-main.cjs'), 'utf8');
  const commandUi = fs.readFileSync(path.join(ROOT, 'src/ui/command-ui.js'), 'utf8');
  const volWatch = fs.readFileSync(path.join(ROOT, 'src/native/volume-watch.ps1'), 'utf8');

  assert.ok(!/getDisplayMedia/.test(extrasUi), 'extras-ui must not invoke getDisplayMedia screen capture');
  assert.ok(!/desktopCapturer\.getSources/.test(extrasMain), 'extras-main must not capture screen sources for visualizer');
  assert.ok(/availableFormats/.test(extrasMain), 'extras-main must inspect clipboard formats before reading images');
  assert.ok(/hasClipSeqWatcher/.test(extrasMain), 'extras-main must rely on Windows clipboard sequence watcher');
  assert.ok(!/Get-Counter/.test(devToolsMain), 'dev-tools-main must not spawn PowerShell Get-Counter telemetry');
  assert.ok(/--no-optional-locks/.test(devToolsMain), 'dev-tools-main git status must pass --no-optional-locks');
  assert.ok(!/refreshTelemetry\(\);\s*refreshMarket\(\);/.test(commandUi), 'command-ui must not eagerly run telemetry on startup');
  assert.ok(/GetClipboardSequenceNumber/.test(volWatch), 'volume-watch.ps1 must expose GetClipboardSequenceNumber');
  assert.ok(/ReleaseComObject/.test(volWatch), 'volume-watch.ps1 must release COM wrappers');
});

test('content detective classifies developer/clipboard patterns cleanly & skips password managers', () => {
  const { analyzeClipboardContent, validateIbanMod97, isSensitiveOwner } = require(path.join(ROOT, 'src/shared/content-detective.cjs'));

  assert.equal(isSensitiveOwner('Bitwarden'), true);
  assert.equal(analyzeClipboardContent('{"secret":1}', 'KeePassXC')?.skip, true);
  assert.equal(analyzeClipboardContent('ghp_abcdefghijklmnopqrstuvwxyz123456')?.skip, true);

  const port = analyzeClipboardContent('Error: listen EADDRINUSE: address already in use :::3000');
  assert.equal(port?.kind, 'port-error');
  assert.equal(port?.meta.port, 3000);

  const hdr = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const pay = Buffer.from(JSON.stringify({ sub: '42', exp: 4102444800 })).toString('base64url');
  const jwt = analyzeClipboardContent(`${hdr}.${pay}.sig`);
  assert.equal(jwt?.kind, 'jwt');
  assert.equal(jwt?.meta.payload.sub, '42');
  assert.equal(jwt?.meta.expired, false);

  const epoch = analyzeClipboardContent('1764000000');
  assert.equal(epoch?.kind, 'epoch');

  const clr = analyzeClipboardContent('#c6e994');
  assert.equal(clr?.kind, 'color');
  assert.equal(clr?.badge, '#C6E994');

  assert.equal(validateIbanMod97('DE89370400440532013000'), true);
  assert.equal(analyzeClipboardContent('DE89 3704 0044 0532 0130 00')?.kind, 'iban');

  const b64 = Buffer.from('LumaDock Studio Ready').toString('base64');
  assert.equal(analyzeClipboardContent(b64)?.meta.decoded, 'LumaDock Studio Ready');
});

test('pure Node ZIP builder generates valid PKZIP archives', async () => {
  const { createZipBuffer, createZipFromPaths } = require(path.join(ROOT, 'src/main/zip-and-media.cjs'));
  const rawBuf = createZipBuffer([{ name: 'hello.txt', data: Buffer.from('Merhaba LumaDock!', 'utf8') }]);
  assert.equal(rawBuf.readUInt32LE(0), 0x04034b50);
  assert.ok(rawBuf.includes(Buffer.from('hello.txt', 'utf8')));

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumadock-zip-'));
  try {
    const f1 = path.join(dir, 'sample.txt');
    fs.writeFileSync(f1, 'test payload 123', 'utf8');
    const out = await createZipFromPaths([f1], dir);
    assert.ok(out.outPath.endsWith('.zip'));
    assert.equal(out.count, 1);
    assert.ok(fs.existsSync(out.outPath));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('context engine tracks foreground autopilot, undo, and local standup summary', () => {
  const { createContextEngine } = require(path.join(ROOT, 'src/main/context-engine.cjs'));
  let duckedLog = [];
  const store = {};
  const ctx = createContextEngine({
    readJson: (k, fb) => store[k] || fb,
    writeJson: (k, v) => { store[k] = v; },
    onDuckChange: d => duckedLog.push(d)
  });

  ctx.onForegroundWindow({ hwnd: '1', pid: 10, process: 'ms-teams', title: 'Daily Sync | Microsoft Teams' });
  assert.equal(ctx.getState().context, 'meeting');
  assert.equal(ctx.getState().ducked, true);
  assert.equal(duckedLog[duckedLog.length - 1], true);

  assert.equal(ctx.undoAutoAction().ok, true);
  assert.equal(ctx.getState().ducked, false);

  ctx.setFocusActive(true, 25);
  ctx.recordAiActivity({ files: ['src/ui/dock-studio-ui.js'], branch: 'main', ok: true });
  const md = ctx.formatStandupMarkdown('en');
  assert.match(md, /25 min/);
  assert.match(md, /dock-studio-ui\.js/);
});

test('navigation fix: separate header apps button and blur-free view switch', () => {
  const iconsUi = fs.readFileSync(path.join(ROOT, 'src/ui/icons-ui.js'), 'utf8');
  const blobUi = fs.readFileSync(path.join(ROOT, 'src/ui/blob-ui.js'), 'utf8');
  assert.ok(/hit\.appsMenu/.test(iconsUi), 'icons-ui must expose dedicated hit.appsMenu header button');
  assert.ok(!/setView\(was === 'home' \? 'apps' : 'home'\)/.test(iconsUi), 'hit.home must not toggle to apps silently');
  assert.ok(!/ctx\.filter/.test(blobUi), 'blob-ui must not run software Canvas filter blur');
});

test('apps directory shows full un-truncated names on Canvas, completes Studio/Tools CRUD, avoids emojis, and supports 5s buddy grow', () => {
  const mascot = fs.readFileSync(path.join(ROOT, 'mascot.html'), 'utf8');
  const aiUi = fs.readFileSync(path.join(ROOT, 'src/ui/ai-monitor-ui.js'), 'utf8');
  const studioUi = fs.readFileSync(path.join(ROOT, 'src/ui/dock-studio-ui.js'), 'utf8');
  const toolsUi = fs.readFileSync(path.join(ROOT, 'src/ui/tools-ui.js'), 'utf8');
  const commandUi = fs.readFileSync(path.join(ROOT, 'src/ui/command-ui.js'), 'utf8');
  const extrasUi = fs.readFileSync(path.join(ROOT, 'src/ui/extras-ui.js'), 'utf8');

  assert.ok(/__lumadockBuddyBurst/.test(mascot), 'mascot.html must expose __lumadockBuddyBurst');
  assert.ok(/REST_W:\s*\n?\s*136/.test(mascot) && /BAR_H:\s*\n?\s*40/.test(mascot), 'resting bar must be upgraded larger Buddy size 136x40');

  assert.ok(/const cols = 3/.test(aiUi) && /appsScroll/.test(aiUi) && /appsMaxScroll/.test(aiUi), 'ai-monitor-ui must draw wide 3-column Canvas Apps with scroll');
  assert.ok(/VIEWS\s*=\s*\['mixer',\s*'studio',\s*'relay'\]/.test(studioUi), 'dock-studio-ui must leave apps view on native Canvas');
  assert.ok(/st-ws-name/.test(studioUi) && /data-ws-del/.test(studioUi) && /data-wdel/.test(studioUi), 'dock-studio-ui must support Workspaces add/delete and Watchdog delete');
  assert.ok(/data-pr-save/.test(toolsUi) && /data-prdel/.test(toolsUi), 'tools-ui must support Prompt template add/delete');
  assert.ok(/noteTab\s*=\s*tab/.test(toolsUi) && /clipsTab\s*=\s*tab/.test(toolsUi), 'tools-ui must support direct sub-tab navigation from Apps');
  assert.ok(/__lumadockConvertWebp/.test(studioUi) && /__lumadockConvertWebp/.test(extrasUi), 'tray quick image/EXIF converters must be wired');

  const emojiRe = /[\u{1F300}-\u{1FAFF}]/u;
  for (const [name, src] of [['dock-studio-ui', studioUi], ['tools-ui', toolsUi], ['command-ui', commandUi]]) {
    assert.ok(!emojiRe.test(src), `${name} must not contain emojis`);
  }
});

test('github-main computes contribution streaks and event summaries accurately', () => {
  const { computeContributionStreaks, summarizeEvent } = require(path.join(ROOT, 'src', 'main', 'github-main.cjs'));
  const days = [
    { date: '2026-11-20', count: 2 },
    { date: '2026-11-21', count: 5 },
    { date: '2026-11-22', count: 1 },
    { date: '2026-11-23', count: 0 },
    { date: '2026-11-24', count: 3 },
    { date: '2026-11-25', count: 4 },
    { date: '2026-11-26', count: 2 },
    { date: '2026-11-27', count: 0 }
  ];
  const st = computeContributionStreaks(days, '2026-11-27');
  assert.equal(st.totalYear, 17);
  assert.equal(st.todayCount, 0);
  assert.equal(st.currentStreak, 3); // 24, 25, 26 grace while today=0
  assert.equal(st.longestStreak, 3);

  const st2 = computeContributionStreaks([
    { date: '2026-11-24', count: 1 },
    { date: '2026-11-25', count: 2 },
    { date: '2026-11-26', count: 1 },
    { date: '2026-11-27', count: 4 }
  ], '2026-11-27');
  assert.equal(st2.currentStreak, 4);
  assert.equal(st2.longestStreak, 4);

  const push = summarizeEvent({ type: 'PushEvent', actor: { login: 'alice' }, repo: { name: 'a/b' }, payload: { size: 2, ref: 'refs/heads/main' } });
  assert.equal(push.action, 'push');
  assert.match(push.detail, /2 commit.*main/);
  const star = summarizeEvent({ type: 'WatchEvent', actor: { login: 'bob' }, repo: { name: 'a/b' } });
  assert.equal(star.action, 'star');
  const pr = summarizeEvent({ type: 'PullRequestEvent', actor: { login: 'carol' }, repo: { name: 'a/b' }, payload: { action: 'opened', pull_request: { number: 12, title: 'Fix bug', html_url: 'https://github.com/a/b/pull/12' } } });
  assert.equal(pr.action, 'pr');
  assert.match(pr.detail, /opened #12 Fix bug/);
});

test('power-tools-main generates RFC 6238 TOTP, parses otpauth URIs, generates passwords and parses SSH config', () => {
  const { generateTotp, parseOtpAuthUri, generateSecurePassword, parseSshConfig } = require(path.join(ROOT, 'src', 'main', 'power-tools-main.cjs'));
  const rfcSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // "12345678901234567890"
  assert.equal(generateTotp(rfcSecret, { nowMs: 59000, digits: 6 }).code, '287082');
  assert.equal(generateTotp(rfcSecret, { nowMs: 59000, digits: 8 }).code, '94287082');

  const parsed = parseOtpAuthUri('otpauth://totp/GitHub:WhoIsMrSentry?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&digits=6&period=30');
  assert.equal(parsed.issuer, 'GitHub');
  assert.equal(parsed.account, 'WhoIsMrSentry');
  assert.equal(parsed.secret, 'JBSWY3DPEHPK3PXP');

  const pw = generateSecurePassword({ length: 24, symbols: true });
  assert.equal(pw.length, 24);
  const phrase = generateSecurePassword({ passphrase: true, words: 4 });
  assert.match(phrase, /^[a-z]+-[a-z]+-[a-z]+-[a-z]+-\d{2}$/);

  const ssh = parseSshConfig('Host prod-box\n  HostName 10.0.0.5\n  User deploy\n\nHost *\n  ServerAliveInterval 60\n');
  assert.equal(ssh.length, 1);
  assert.equal(ssh[0].name, 'prod-box');
  assert.equal(ssh[0].hostName, '10.0.0.5');
});

test('platform polish: PrintScreen exclusion, dark scrollbars, zero emojis, unlocked custom Buddy, menu clarity and empty-state discoverability', () => {
  const psVol = fs.readFileSync(path.join(ROOT, 'src/native/volume-watch.ps1'), 'utf8');
  const mainJs = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  const pagesUi = fs.readFileSync(path.join(ROOT, 'src/ui/pages-ui.js'), 'utf8');
  const mascot = fs.readFileSync(path.join(ROOT, 'mascot.html'), 'utf8');
  const buddy = fs.readFileSync(path.join(ROOT, 'buddy.html'), 'utf8');
  const settingsHtml = fs.readFileSync(path.join(ROOT, 'settings-app.html'), 'utf8');
  const aiUi = fs.readFileSync(path.join(ROOT, 'src/ui/ai-monitor-ui.js'), 'utf8');
  const cmdUi = fs.readFileSync(path.join(ROOT, 'src/ui/command-ui.js'), 'utf8');
  const toolsUi = fs.readFileSync(path.join(ROOT, 'src/ui/tools-ui.js'), 'utf8');
  const extrasUi = fs.readFileSync(path.join(ROOT, 'src/ui/extras-ui.js'), 'utf8');
  const funJs = fs.readFileSync(path.join(ROOT, 'src/ui/lumadock-fun.js'), 'utf8');
  const eyedropper = fs.readFileSync(path.join(ROOT, 'src/ui/eyedropper.html'), 'utf8');
  const enJson = fs.readFileSync(path.join(ROOT, 'src/locales/en.json'), 'utf8');
  const trJson = fs.readFileSync(path.join(ROOT, 'src/locales/tr.json'), 'utf8');

  assert.match(psVol, /ScreenClippingHost/i);
  assert.match(psVol, /SnippingTool/i);
  assert.match(mainJs, /screen-saver/);
  assert.match(mainJs, /lumadockEnsureVisible/);

  assert.match(pagesUi, /::-webkit-scrollbar-button/);
  assert.match(mascot, /color-scheme:\s*dark/);
  assert.match(settingsHtml, /color-scheme:\s*dark/);

  for (const f of fs.readdirSync(path.join(ROOT, 'src/ui')).filter(x => x.endsWith('.js')).map(x => path.join(ROOT, 'src/ui', x)).concat([
    path.join(ROOT, 'mascot.html'), path.join(ROOT, 'buddy.html'), path.join(ROOT, 'settings-app.html')
  ])) {
    const content = fs.readFileSync(f, 'utf8');
    assert.ok(!/scrollbar-width\s*:\s*thin/i.test(content), `${path.basename(f)} must not use scrollbar-width: thin`);
    assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(content), `${path.basename(f)} must not contain emojis`);
  }
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(enJson) && !/[\u{1F300}-\u{1FAFF}]/u.test(trJson), 'Locales must not contain emojis');

  assert.ok(!/'cpuApp'/.test(aiUi), 'ai-monitor-ui must deduplicate cpuApp into netApp');
  assert.ok(/'githubApp'/.test(aiUi) && /'portsApp'/.test(aiUi) && /'translateApp'/.test(aiUi) && /'devtoolsApp'/.test(aiUi) && /'vaultApp'/.test(aiUi));
  assert.ok(/eyedropperStart/.test(aiUi) && /11/.test(eyedropper));
  assert.ok(/1500/.test(cmdUi) && /1500/.test(extrasUi), 'net/stats polling must refresh every 1.5s');
  assert.ok(/hb-fx-amt/.test(cmdUi) && /hb-fx-from/.test(cmdUi) && /hb-fx-to/.test(cmdUi), 'Market converter must be interactive');
  assert.ok(/data-ctab="qr"/.test(toolsUi) && /data-ctab="ocr"/.test(toolsUi), 'QR and OCR tabs must always be visible');
  assert.ok(/ex-empty-add/.test(extrasUi) && /trayPickFiles/.test(extrasUi), 'Tray must expose Add Files picker even when empty');
  assert.ok(/unlocked\s*=\s*\(\)\s*=>\s*true/.test(funJs), 'All Buddy outfits must be unlocked');
  assert.ok(/isHexColor/.test(funJs) && /type="color"/.test(funJs), 'Buddy must support unlimited custom HEX colors');
  assert.ok(/statusSadUntil/.test(funJs) && !/hungry\(\)\s*&&\s*prefs\.faces/.test(funJs), 'Buddy must not stay permanently sad');
});
