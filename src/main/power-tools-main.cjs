'use strict';
// LumaDock Power-User Toolkit Backend:
// Encrypted 2FA (TOTP RFC 6238) & Secrets Vault (DPAPI safeStorage), Hardware Brightness (DDC/CI+WMI),
// File Locksmith, Top CPU/RAM Processes, Docker Control, Site Uptime Watchdog,
// Mini HTTP/API Runner + Local Webhook Catcher, Ping/Speedtest, and App/SSH/Project Launcher.
const { execFile } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { generateQrDataUrl } = require('../shared/qr.cjs');

const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const HW_TOOLS_PS = path.join(__dirname, '..', 'native', 'hardware-tools.ps1');

const execFileAsync = (bin, args, timeout = 5000) => new Promise((resolve, reject) => {
  execFile(bin, args, { windowsHide: true, timeout, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
    if (err) {
      err.stdout = stdout;
      err.stderr = stderr;
      reject(err);
    } else {
      resolve(String(stdout || ''));
    }
  });
});

async function execHwJson(action, target = '', value = '', timeout = 6500) {
  if (process.platform !== 'win32') return { ok: false, unsupported: true };
  const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', HW_TOOLS_PS, '-Action', action];
  if (target) args.push('-Target', String(target));
  if (value !== '') args.push('-Value', String(value));
  const out = await execFileAsync(POWERSHELL, args, timeout);
  const idx = out.indexOf('{');
  if (idx >= 0) return JSON.parse(out.slice(idx));
  return { ok: false };
}

// ---------- RFC 6238 Base32 + TOTP ----------
const B32_ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32ToBuffer(input) {
  const clean = String(input || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const bytes = [];
  for (const ch of clean) {
    const idx = B32_ALPHA.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function generateTotp(secretBase32, opts = {}) {
  const key = base32ToBuffer(secretBase32);
  if (!key.length) return { code: '000000', remaining: 30, period: 30 };
  const period = Math.max(10, Math.min(120, Number(opts.period) || 30));
  const digits = Math.max(6, Math.min(8, Number(opts.digits) || 6));
  const algo = ['sha1', 'sha256', 'sha512'].includes(String(opts.algorithm || 'sha1').toLowerCase())
    ? String(opts.algorithm || 'sha1').toLowerCase()
    : 'sha1';
  const nowSec = Math.floor((Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now()) / 1000);
  const counter = Math.floor(nowSec / period);
  const remaining = period - (nowSec % period);

  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac(algo, key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  const code = String(bin % (10 ** digits)).padStart(digits, '0');
  return { code, remaining, period };
}

function parseOtpAuthUri(uri) {
  const s = String(uri || '').trim();
  if (!/^otpauth:\/\/totp\//i.test(s)) return null;
  try {
    const u = new URL(s);
    const labelRaw = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
    const colon = labelRaw.indexOf(':');
    const labelIssuer = colon >= 0 ? labelRaw.slice(0, colon).trim() : '';
    const account = colon >= 0 ? labelRaw.slice(colon + 1).trim() : labelRaw.trim();
    const secret = String(u.searchParams.get('secret') || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
    if (!secret) return null;
    return {
      issuer: String(u.searchParams.get('issuer') || labelIssuer || 'Account').trim().slice(0, 40),
      account: account.slice(0, 60),
      secret,
      digits: Number(u.searchParams.get('digits') || 6),
      period: Number(u.searchParams.get('period') || 30),
      algorithm: String(u.searchParams.get('algorithm') || 'SHA1').toLowerCase()
    };
  } catch {
    return null;
  }
}

function generateSecurePassword(opts = {}) {
  if (opts.passphrase) {
    const words = ['amber', 'atlas', 'beacon', 'cedar', 'cobalt', 'comet', 'coral', 'delta', 'drift', 'ember', 'falcon', 'fjord', 'frost', 'grove', 'harbor', 'horizon', 'ivory', 'jade', 'kelp', 'kestrel', 'lumen', 'maple', 'mesa', 'nebula', 'north', 'onyx', 'orbit', 'pixel', 'prism', 'pulse', 'quartz', 'ridge', 'river', 'sable', 'slate', 'solar', 'spark', 'spire', 'stone', 'storm', 'summit', 'terra', 'timber', 'vapor', 'vertex', 'violet', 'wave', 'zephyr'];
    const count = Math.max(3, Math.min(7, Number(opts.words) || 4));
    const chosen = [];
    for (let i = 0; i < count; i++) chosen.push(words[crypto.randomInt(words.length)]);
    return chosen.join('-') + '-' + crypto.randomInt(10, 99);
  }
  const len = Math.max(8, Math.min(64, Number(opts.length) || 20));
  let pool = '';
  if (opts.lower !== false) pool += 'abcdefghijkmnopqrstuvwxyz';
  if (opts.upper !== false) pool += 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  if (opts.digits !== false) pool += '23456789';
  if (opts.symbols !== false) pool += '!@#$%^&*()-_=+[]{}';
  if (!pool) pool = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += pool[crypto.randomInt(pool.length)];
  return out;
}

function parseSshConfig(text) {
  const hosts = [];
  let cur = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const m = /^(\S+)\s+(.+)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'host') {
      for (const alias of val.split(/\s+/)) {
        if (!alias || alias.includes('*') || alias.includes('?')) { cur = null; continue; }
        cur = { name: alias, hostName: '', user: '' };
        hosts.push(cur);
      }
    } else if (cur) {
      if (key === 'hostname') cur.hostName = val;
      else if (key === 'user') cur.user = val;
    }
  }
  return hosts.slice(0, 30);
}

function setupPowerTools(electron, deps) {
  const { app, clipboard, dialog, safeStorage, shell } = electron;
  const { handle, send, readJson, writeJson, devTools, suppressClipHistory, onAppQuit } = deps;

  const encrypt = val => {
    try {
      if (safeStorage?.isEncryptionAvailable?.()) {
        return 'dpapi:' + safeStorage.encryptString(String(val)).toString('base64');
      }
    } catch {}
    return 'b64:' + Buffer.from(String(val), 'utf8').toString('base64');
  };
  const decrypt = raw => {
    const s = String(raw || '');
    try {
      if (s.startsWith('dpapi:') && safeStorage?.isEncryptionAvailable?.()) {
        return safeStorage.decryptString(Buffer.from(s.slice(6), 'base64'));
      }
      if (s.startsWith('b64:')) return Buffer.from(s.slice(4), 'base64').toString('utf8');
    } catch {}
    return '';
  };

  let clearTimer = null;
  function copySensitive(text, autoClearSec = 30) {
    suppressClipHistory?.(2500);
    clipboard.writeText(text);
    clearTimeout(clearTimer);
    if (autoClearSec > 0) {
      clearTimer = setTimeout(() => {
        try { if (clipboard.readText() === text) clipboard.clear(); } catch {}
      }, autoClearSec * 1000);
      clearTimer.unref?.();
    }
  }

  // ---------- 1. Encrypted 2FA TOTP + Secrets Vault ----------
  const rawSecVault = readJson('secure-vault.json', { totp: [], secrets: [] }) || { totp: [], secrets: [] };
  let totpList = Array.isArray(rawSecVault.totp) ? rawSecVault.totp : [];
  let secretsList = Array.isArray(rawSecVault.secrets) ? rawSecVault.secrets : [];
  const saveSecVault = () => writeJson('secure-vault.json', { totp: totpList, secrets: secretsList });

  const renderTotpView = () => totpList.map(item => {
    const secret = decrypt(item.secretEnc);
    const { code, remaining, period } = generateTotp(secret, item);
    return { id: item.id, issuer: item.issuer, account: item.account, code, remaining, period };
  });

  handle('power:totp-list', async () => ({ items: renderTotpView(), encrypted: Boolean(safeStorage?.isEncryptionAvailable?.()) }));
  handle('power:totp-add', async payload => {
    let parsed = payload?.uri ? parseOtpAuthUri(payload.uri) : null;
    if (!parsed) {
      const secret = String(payload?.secret || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
      if (!secret || secret.length < 8) throw new Error('Invalid Base32 TOTP secret.');
      parsed = {
        issuer: String(payload?.issuer || 'Account').trim().slice(0, 40),
        account: String(payload?.account || '').trim().slice(0, 60),
        secret,
        digits: 6,
        period: 30,
        algorithm: 'sha1'
      };
    }
    const entry = {
      id: 'otp-' + crypto.randomBytes(4).toString('hex'),
      issuer: parsed.issuer,
      account: parsed.account,
      digits: parsed.digits || 6,
      period: parsed.period || 30,
      algorithm: parsed.algorithm || 'sha1',
      secretEnc: encrypt(parsed.secret)
    };
    totpList = [entry, ...totpList].slice(0, 40);
    saveSecVault();
    return { items: renderTotpView() };
  });
  handle('power:totp-del', async payload => {
    totpList = totpList.filter(x => x.id !== payload?.id);
    saveSecVault();
    return { items: renderTotpView() };
  });
  handle('power:totp-copy', async payload => {
    const item = totpList.find(x => x.id === payload?.id);
    if (!item) throw new Error('Not found.');
    const { code } = generateTotp(decrypt(item.secretEnc), item);
    copySensitive(code, 30);
    return { copied: true };
  });

  const renderSecretsView = () => secretsList.map(s => ({ id: s.id, name: s.name, category: s.category || 'api', createdAt: s.createdAt }));
  handle('power:secret-list', async () => ({ items: renderSecretsView() }));
  handle('power:secret-add', async payload => {
    const name = String(payload?.name || '').trim().slice(0, 48);
    const value = String(payload?.value || '').slice(0, 12000);
    const category = ['api', 'env', 'ssh', 'note'].includes(payload?.category) ? payload.category : 'api';
    if (!name || !value.trim()) throw new Error('Name & secret required.');
    const entry = { id: 'sec-' + crypto.randomBytes(4).toString('hex'), name, category, valueEnc: encrypt(value), createdAt: Date.now() };
    secretsList = [entry, ...secretsList].slice(0, 60);
    saveSecVault();
    return { items: renderSecretsView() };
  });
  handle('power:secret-del', async payload => {
    secretsList = secretsList.filter(x => x.id !== payload?.id);
    saveSecVault();
    return { items: renderSecretsView() };
  });
  handle('power:secret-copy', async payload => {
    const item = secretsList.find(x => x.id === payload?.id);
    if (!item) throw new Error('Not found.');
    copySensitive(decrypt(item.valueEnc), 30);
    return { copied: true };
  });
  handle('power:password-gen', async payload => {
    const pw = generateSecurePassword(payload || {});
    if (payload?.copy) copySensitive(pw, 30);
    return { password: pw };
  });
  handle('power:qr-generate', async payload => {
    const txt = String(payload?.text || '').slice(0, 1200);
    if (!txt.trim()) return { dataUrl: '' };
    return { dataUrl: generateQrDataUrl(txt, { dark: '#0b0e0a', light: '#f4f7f2', margin: 2 }) };
  });

  // ---------- 2. Hardware Brightness, Top Processes & File Locksmith ----------
  const PROTECTED_PROCS = new Set(['system', 'idle', 'smss', 'csrss', 'wininit', 'services', 'lsass', 'winlogon', 'dwm', 'svchost', 'explorer']);
  handle('power:brightness-list', async () => execHwJson('brightness-list'));
  handle('power:brightness-set', async payload => execHwJson('brightness-set', String(payload?.id || 'all').slice(0, 32), Number(payload?.value ?? 70)));
  handle('power:top-procs', async () => execHwJson('top-procs'));
  handle('power:proc-kill', async payload => {
    const pid = Number(payload?.pid);
    if (!Number.isSafeInteger(pid) || pid <= 4 || pid === process.pid) throw new Error('Protected PID.');
    const snap = await execHwJson('top-procs');
    const hit = (snap.processes || []).find(p => Number(p.pid) === pid);
    if (hit && PROTECTED_PROCS.has(String(hit.name || '').toLowerCase())) throw new Error('Protected system process.');
    if (process.platform === 'win32') await execFileAsync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], 4500);
    else process.kill(pid, 'SIGKILL');
    return execHwJson('top-procs');
  });
  handle('power:file-locks', async payload => execHwJson('file-locks', String(payload?.path || '').slice(0, 500)));
  handle('power:file-locks-pick', async () => {
    const pick = await dialog.showOpenDialog({ properties: ['openFile'] });
    if (pick.canceled || !pick.filePaths?.[0]) return { cancelled: true, locks: [] };
    const r = await execHwJson('file-locks', pick.filePaths[0]);
    return { ...r, path: pick.filePaths[0] };
  });

  // ---------- 3. Docker Container Quick Manager ----------
  handle('power:docker-list', async () => {
    try {
      const out = await execFileAsync('docker', ['ps', '-a', '--format', '{{json .}}'], 3000);
      const containers = out.split(/\r?\n/).filter(Boolean).map(line => {
        try {
          const j = JSON.parse(line);
          return { id: String(j.ID || ''), name: String(j.Names || ''), image: String(j.Image || ''), state: String(j.State || ''), status: String(j.Status || ''), ports: String(j.Ports || '') };
        } catch { return null; }
      }).filter(Boolean).slice(0, 20);
      return { available: true, containers };
    } catch {
      return { available: false, containers: [] };
    }
  });
  handle('power:docker-action', async payload => {
    const id = String(payload?.id || '').trim();
    const action = String(payload?.action || '').trim();
    if (!/^[a-z0-9_.-]{2,64}$/i.test(id) || !['start', 'stop', 'restart'].includes(action)) throw new Error('Invalid docker request.');
    await execFileAsync('docker', [action, id], 12000);
    return { done: true };
  });
  handle('power:docker-logs', async payload => {
    const id = String(payload?.id || '').trim();
    if (!/^[a-z0-9_.-]{2,64}$/i.test(id)) throw new Error('Invalid container.');
    const out = await execFileAsync('docker', ['logs', '--tail', '35', id], 4000).catch(e => String(e?.stderr || e?.stdout || e?.message || ''));
    return { logs: out.slice(-4000) };
  });

  // ---------- 4. Site / API Uptime Monitor ----------
  let monitors = readJson('uptime-monitors.json', []);
  if (!Array.isArray(monitors)) monitors = [];
  const saveMonitors = () => writeJson('uptime-monitors.json', monitors.map(({ id, name, url }) => ({ id, name, url })));
  const uptimeResults = new Map();

  async function checkOneMonitor(m) {
    const t0 = Date.now();
    let ok = false, statusCode = 0;
    try {
      const res = await fetch(m.url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(5000) });
      statusCode = res.status;
      ok = res.status >= 200 && res.status < 400;
    } catch { ok = false; }
    const ms = Date.now() - t0;
    const prev = uptimeResults.get(m.id);
    const hist = [...(prev?.history || []), ok ? 1 : 0].slice(-12);
    const next = { id: m.id, name: m.name, url: m.url, ok, statusCode, ms, checkedAt: Date.now(), history: hist };
    if (prev && prev.ok !== ok) {
      send?.('power:uptime-alert', next);
    }
    uptimeResults.set(m.id, next);
    return next;
  }

  async function checkAllMonitors() {
    const results = await Promise.all(monitors.slice(0, 10).map(checkOneMonitor));
    return results;
  }
  const uptimeTimer = setInterval(() => { if (monitors.length) checkAllMonitors().catch(() => {}); }, 60000);
  uptimeTimer.unref?.();

  handle('power:uptime-list', async () => ({
    items: monitors.map(m => uptimeResults.get(m.id) || { ...m, ok: null, statusCode: 0, ms: 0, history: [] })
  }));
  handle('power:uptime-check', async () => ({ items: await checkAllMonitors() }));
  handle('power:uptime-add', async payload => {
    const url = String(payload?.url || '').trim();
    if (!/^https?:\/\/\S+/i.test(url)) throw new Error('Use http:// or https:// URL.');
    let name = String(payload?.name || '').trim().slice(0, 36);
    if (!name) try { name = new URL(url).hostname; } catch { name = url.slice(0, 28); }
    const entry = { id: 'up-' + crypto.randomBytes(3).toString('hex'), name, url };
    monitors = [entry, ...monitors.filter(x => x.url !== url)].slice(0, 10);
    saveMonitors();
    await checkOneMonitor(entry);
    return { items: monitors.map(m => uptimeResults.get(m.id) || m) };
  });
  handle('power:uptime-del', async payload => {
    monitors = monitors.filter(x => x.id !== payload?.id);
    uptimeResults.delete(payload?.id);
    saveMonitors();
    return { items: monitors.map(m => uptimeResults.get(m.id) || m) };
  });

  // ---------- 5. Mini API Request Runner & Local Webhook Catcher ----------
  handle('power:http-send', async payload => {
    const url = String(payload?.url || '').trim();
    const method = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].includes(String(payload?.method || 'GET').toUpperCase())
      ? String(payload.method).toUpperCase()
      : 'GET';
    if (!/^https?:\/\/\S+/i.test(url)) throw new Error('URL must start with http:// or https://');
    let headers = {};
    if (payload?.headers && typeof payload.headers === 'object') headers = payload.headers;
    const t0 = Date.now();
    const init = { method, headers: { ...headers }, signal: AbortSignal.timeout(10000) };
    if (!['GET', 'HEAD'].includes(method) && payload?.body) {
      init.body = String(payload.body);
      if (!Object.keys(init.headers).some(k => k.toLowerCase() === 'content-type')) {
        init.headers['Content-Type'] = 'application/json';
      }
    }
    const res = await fetch(url, init);
    const ms = Date.now() - t0;
    const raw = (await res.text()).slice(0, 65000);
    let formatted = raw, isJson = false;
    try { formatted = JSON.stringify(JSON.parse(raw), null, 2); isJson = true; } catch {}
    return { status: res.status, statusText: res.statusText, okHttp: res.ok, ms, body: formatted, isJson };
  });

  let hookServer = null, hookPort = 0, hookLogs = [];
  const hookStatus = () => ({ active: Boolean(hookServer), url: hookServer ? `http://127.0.0.1:${hookPort}/hook` : '', logs: hookLogs });
  handle('power:webhook-status', async () => hookStatus());
  handle('power:webhook-start', async () => {
    if (hookServer) return hookStatus();
    hookLogs = [];
    hookServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', ch => { if (body.length < 32000) body += ch.toString(); });
      req.on('end', () => {
        hookLogs = [{
          id: crypto.randomBytes(3).toString('hex'),
          method: req.method || 'GET',
          url: req.url || '/',
          headers: Object.entries(req.headers || {}).slice(0, 8).map(([k, v]) => `${k}: ${v}`).join('\n'),
          body: body.slice(0, 4000),
          at: Date.now()
        }, ...hookLogs].slice(0, 20);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true,"capturedBy":"LumaDock"}');
        send?.('power:webhook-event', hookStatus());
      });
    });
    await new Promise((resolve, reject) => {
      hookServer.once('error', reject);
      hookServer.listen(0, '127.0.0.1', () => { hookPort = hookServer.address().port; resolve(); });
    });
    return hookStatus();
  });
  handle('power:webhook-stop', async () => {
    if (hookServer) { try { hookServer.close(); } catch {} hookServer = null; hookPort = 0; }
    return hookStatus();
  });

  // ---------- 6. Live TCP Ping, Public IP & Speed Test ----------
  function tcpPing(host, port = 443, timeout = 2000) {
    return new Promise(resolve => {
      const t0 = Date.now();
      const sock = net.createConnection({ host, port });
      let done = false;
      const finish = ms => { if (!done) { done = true; try { sock.destroy(); } catch {} resolve(ms); } };
      sock.setTimeout(timeout);
      sock.once('connect', () => finish(Date.now() - t0));
      sock.once('timeout', () => finish(null));
      sock.once('error', () => finish(null));
    });
  }
  let cachedPubIp = '', pubIpAt = 0;
  handle('power:net-ping', async () => {
    const [cfMs, ggMs] = await Promise.all([tcpPing('1.1.1.1', 443), tcpPing('8.8.8.8', 443)]);
    if (!cachedPubIp || Date.now() - pubIpAt > 5 * 60000) {
      try {
        const r = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(2500) }).then(x => x.json());
        if (r?.ip) { cachedPubIp = String(r.ip); pubIpAt = Date.now(); }
      } catch {}
    }
    return { cloudflareMs: cfMs, googleMs: ggMs, localIp: devTools?.lanIpv4Address?.() || '', publicIp: cachedPubIp };
  });
  handle('power:speedtest', async () => {
    const t0 = Date.now();
    const res = await fetch('https://speed.cloudflare.com/__down?bytes=5000000', { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const sec = Math.max(0.05, (Date.now() - t0) / 1000);
    const mbps = Number((((buf.byteLength * 8) / 1e6) / sec).toFixed(1));
    return { mbps, bytes: buf.byteLength, ms: Date.now() - t0 };
  });

  // ---------- 7. Universal App / SSH / Project Launcher ----------
  let launcherCache = null, launcherAt = 0;
  function scanStartMenuApps() {
    if (process.platform !== 'win32') return [];
    const dirs = [
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      path.join(process.env.AppData || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs')
    ];
    const items = [];
    const seen = new Set();
    const walk = (dir, depth) => {
      if (depth > 2 || !dir || !fs.existsSync(dir)) return;
      try {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) walk(full, depth + 1);
          else if (/\.lnk$/i.test(e.name)) {
            const name = e.name.replace(/\.lnk$/i, '');
            if (!/uninstall|kaldır|readme|help/i.test(name) && !seen.has(name.toLowerCase())) {
              seen.add(name.toLowerCase());
              items.push({ id: 'app-' + items.length, kind: 'app', name, target: full, sub: 'App' });
            }
          }
        }
      } catch {}
    };
    for (const d of dirs) walk(d, 0);
    return items.slice(0, 80);
  }
  function loadLauncherItems() {
    if (launcherCache && Date.now() - launcherAt < 60000) return launcherCache;
    const apps = scanStartMenuApps();
    let ssh = [];
    try {
      const cfgPath = path.join(os.homedir(), '.ssh', 'config');
      if (fs.existsSync(cfgPath)) {
        ssh = parseSshConfig(fs.readFileSync(cfgPath, 'utf8')).map((h, i) => ({
          id: 'ssh-' + i,
          kind: 'ssh',
          name: `ssh ${h.name}`,
          target: h.name,
          sub: h.hostName ? `${h.user ? h.user + '@' : ''}${h.hostName}` : 'SSH Host'
        }));
      }
    } catch {}
    const projects = [];
    try {
      for (const p of (app.lumadockMonitor?.projects?.() || [])) {
        if (p?.cwd && fs.existsSync(p.cwd)) {
          projects.push({ id: 'proj-' + projects.length, kind: 'project', name: p.name || path.basename(p.cwd), target: p.cwd, sub: 'Project' });
        }
      }
      const claudeCfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude.json'), 'utf8'));
      for (const dir of Object.keys(claudeCfg?.projects || {}).slice(0, 15)) {
        if (fs.existsSync(dir) && !projects.some(x => x.target.toLowerCase() === dir.toLowerCase())) {
          projects.push({ id: 'proj-' + projects.length, kind: 'project', name: path.basename(dir), target: dir, sub: 'Project' });
        }
      }
    } catch {}
    launcherCache = [...ssh, ...projects.slice(0, 16), ...apps];
    launcherAt = Date.now();
    return launcherCache;
  }
  handle('power:launcher-index', async () => ({ items: loadLauncherItems() }));
  handle('power:launcher-run', async payload => {
    const kind = String(payload?.kind || '');
    const target = String(payload?.target || '').trim();
    if (!target) throw new Error('Empty target.');
    if (kind === 'app') {
      await shell.openPath(target);
      return { ok: true };
    }
    if (kind === 'project') {
      execFile('code', [target], { windowsHide: true }, err => { if (err) shell.openPath(target).catch(() => {}); });
      return { ok: true };
    }
    if (kind === 'ssh' && /^[a-zA-Z0-9._@-]+$/.test(target)) {
      execFile('wt.exe', ['new-tab', 'ssh', target], { windowsHide: false }, err => {
        if (err && process.platform === 'win32') {
          require('node:child_process').spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/k', 'ssh', target], { detached: true, windowsHide: false, stdio: 'ignore' }).unref();
        }
      });
      return { ok: true };
    }
    throw new Error('Invalid launcher target.');
  });

  onAppQuit?.(() => {
    clearTimeout(clearTimer);
    if (hookServer) { try { hookServer.close(); } catch {} hookServer = null; }
  });
}

module.exports = {
  setupPowerTools,
  generateTotp,
  parseOtpAuthUri,
  generateSecurePassword,
  parseSshConfig
};
