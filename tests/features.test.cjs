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

test('inline scripts in mascot.html and settings-app.html parse with zero syntax errors', () => {
  const vm = require('node:vm');
  for (const name of ['mascot.html', 'settings-app.html']) {
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
    parseSpotifyPlaylistInput
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

  const html = renderSpotifyCallbackHtml(true);
  assert.match(html, /<meta charset="utf-8">/i);
  assert.match(html, /Spotify bağlandı/);

  const plUrl = parseSpotifyPlaylistInput('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc123');
  assert.deepEqual(plUrl, {
    id: '37i9dQZF1DXcBWIGoYBM5M',
    uri: 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M',
    url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'
  });
  assert.equal(parseSpotifyPlaylistInput('https://example.com/not-spotify'), null);
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
