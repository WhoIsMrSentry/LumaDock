'use strict';
// Developer, telemetry, LAN QR Drop, offline OCR, currency/crypto & translate helpers for LumaDock.
const { execFile } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { generateQrDataUrl } = require('../shared/qr.cjs');
const { evaluateMath, evaluateConversion } = require('../shared/command-eval.cjs');

const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const DEV_COMMON_PORTS = new Set([80, 443, 3000, 3001, 3333, 4000, 4200, 4321, 5000, 5001, 5173, 5174, 5432, 5500, 6006, 6379, 8000, 8080, 8081, 8443, 8888, 9000, 27017]);
const LUMADOCK_INTERNAL_PORTS = new Set([Number(process.env.LUMADOCK_HOOK_PORT) || 47823]);

const execFileAsync = (bin, args, opts = {}) => new Promise((resolve, reject) => {
  execFile(bin, args, { windowsHide: true, timeout: 5000, maxBuffer: 4 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
    if (err) {
      err.stdout = stdout;
      err.stderr = stderr;
      reject(err);
    } else {
      resolve(String(stdout || ''));
    }
  });
});

function lanIpv4Address() {
  const ifaces = os.networkInterfaces();
  const candidates = [];
  for (const [name, list] of Object.entries(ifaces)) {
    if (!Array.isArray(list)) continue;
    for (const info of list) {
      if (!info || info.internal || info.family !== 'IPv4') continue;
      const ip = info.address;
      const isPrivate = ip.startsWith('192.168.') || ip.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
      const isVirtual = /vEthernet|WSL|Hyper-V|VMware|VirtualBox|Loopback|ZeroTier|Tailscale/i.test(name);
      candidates.push({ ip, score: (isPrivate ? 10 : 0) + (ip.startsWith('192.168.') ? 5 : 0) - (isVirtual ? 8 : 0) });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.ip || '127.0.0.1';
}

function parseNetstatPorts(netstatOut, tasklistCsv = '', ownPid = process.pid) {
  const procByPid = new Map();
  for (const line of String(tasklistCsv || '').split(/\r?\n/)) {
    const m = /^"([^"]+)","(\d+)"/.exec(line.trim());
    if (m) procByPid.set(Number(m[2]), m[1]);
  }
  const seen = new Map();
  for (const line of String(netstatOut || '').split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5 || parts[0].toUpperCase() !== 'TCP') continue;
    const state = parts[3].toUpperCase();
    if (state !== 'LISTENING') continue;
    const addr = parts[1], pid = Number(parts[4]);
    const portMatch = /:(\d+)$/.exec(addr);
    if (!portMatch || !Number.isInteger(pid) || pid <= 4 || pid === ownPid) continue;
    const port = Number(portMatch[1]);
    if (LUMADOCK_INTERNAL_PORTS.has(port)) continue;
    const hostPart = addr.slice(0, addr.length - portMatch[0].length);
    const localOnly = hostPart === '127.0.0.1' || hostPart === '[::1]';
    const likelyDev = DEV_COMMON_PORTS.has(port) || (port >= 3000 && port <= 9999) || /node|python|uvicorn|ruby|go|vite|next|bun|deno|java|dotnet|php|nginx|caddy|postgres|redis/i.test(procByPid.get(pid) || '');
    if (!likelyDev) continue;
    if (!seen.has(port)) {
      seen.set(port, {
        port,
        pid,
        process: (procByPid.get(pid) || 'PID ' + pid).replace(/\.exe$/i, ''),
        localOnly,
        url: `http://127.0.0.1:${port}`
      });
    }
  }
  return [...seen.values()].sort((a, b) => a.port - b.port).slice(0, 16);
}

function parseLsofPorts(lsofOut, ownPid = process.pid) {
  const seen = new Map();
  for (const line of String(lsofOut || '').split(/\r?\n/).slice(1)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 9) continue;
    const cmd = parts[0], pid = Number(parts[1]), endpoint = parts[8] || '';
    const pm = /:(\d+)$/.exec(endpoint);
    if (!pm || !Number.isInteger(pid) || pid <= 1 || pid === ownPid) continue;
    const port = Number(pm[1]);
    if (LUMADOCK_INTERNAL_PORTS.has(port)) continue;
    const likelyDev = DEV_COMMON_PORTS.has(port) || (port >= 3000 && port <= 9999);
    if (!likelyDev || seen.has(port)) continue;
    seen.set(port, { port, pid, process: cmd, localOnly: /^127\.0\.0\.1|^localhost|^\[::1\]/.test(endpoint), url: `http://127.0.0.1:${port}` });
  }
  return [...seen.values()].sort((a, b) => a.port - b.port).slice(0, 16);
}

function parseGitStatus(porcelainOut, repoDir = '') {
  const lines = String(porcelainOut || '').split(/\r?\n/).filter(Boolean);
  if (!lines.length) return null;
  let branch = '', ahead = 0, behind = 0;
  const files = [];
  let staged = 0, modified = 0, untracked = 0;
  for (const line of lines) {
    if (line.startsWith('## ')) {
      const head = line.slice(3);
      const bPart = head.split('...')[0];
      branch = bPart.replace(/^No commits yet on /, '').trim();
      const am = /ahead (\d+)/.exec(head), bm = /behind (\d+)/.exec(head);
      if (am) ahead = Number(am[1]);
      if (bm) behind = Number(bm[1]);
      continue;
    }
    const xy = line.slice(0, 2), file = line.slice(3).trim();
    if (xy === '??') untracked++;
    else {
      if (xy[0] && xy[0] !== ' ') staged++;
      if (xy[1] && xy[1] !== ' ') modified++;
    }
    if (file && files.length < 8) files.push({ status: xy.trim() || 'M', file });
  }
  return {
    available: true,
    repo: repoDir ? path.basename(repoDir) : '',
    cwd: repoDir,
    branch: branch || 'HEAD',
    ahead,
    behind,
    staged,
    modified,
    untracked,
    dirty: staged + modified + untracked,
    files
  };
}

async function runOcrFromFile(filePath, lang = '') {
  if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: 'Image missing.' };
  if (process.platform === 'win32') {
    try {
      const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', path.join(__dirname, '..', 'native', 'ocr-win.ps1'), '-ImagePath', filePath];
      if (lang === 'tr' || lang === 'en') args.push('-Lang', lang === 'tr' ? 'tr' : 'en-US');
      const out = await execFileAsync(POWERSHELL, args, { timeout: 10000 });
      const idx = out.indexOf('{');
      if (idx < 0) return { ok: false, error: 'OCR returned empty output.' };
      const parsed = JSON.parse(out.slice(idx));
      return {
        ok: Boolean(parsed.ok),
        text: String(parsed.text || ''),
        lines: Array.isArray(parsed.lines) ? parsed.lines : [],
        lang: parsed.lang || '',
        error: parsed.error || ''
      };
    } catch (err) {
      return { ok: false, error: err?.message || 'Windows OCR failed.' };
    }
  }
  return { ok: false, error: 'Offline OCR is available on Windows 10/11 or via Robo AI on macOS.' };
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let idx = 0, val = n;
  while (val >= 1024 && idx < units.length - 1) { val /= 1024; idx++; }
  return `${val >= 10 || idx === 0 ? val.toFixed(0) : val.toFixed(1)} ${units[idx]}`;
}

function createLanDropManager(i18n) {
  let server = null, activeShare = null, expireTimer = null;

  async function stop() {
    clearTimeout(expireTimer);
    expireTimer = null;
    activeShare = null;
    if (server) {
      const srv = server;
      server = null;
      await new Promise(resolve => { try { srv.close(() => resolve()); } catch { resolve(); } });
    }
    return { active: false };
  }

  function status() {
    if (!activeShare || Date.now() > activeShare.expiresAt) {
      return { active: false };
    }
    return {
      active: true,
      url: activeShare.url,
      qrDataUrl: activeShare.qrDataUrl,
      expiresAt: activeShare.expiresAt,
      files: activeShare.files.map(f => ({ name: f.name, size: f.size, path: f.path })),
      downloads: activeShare.downloads
    };
  }

  async function start(filePaths) {
    await stop();
    const list = (Array.isArray(filePaths) ? filePaths : [filePaths])
      .filter(p => typeof p === 'string' && path.isAbsolute(p) && fs.existsSync(p))
      .filter(p => { try { return fs.statSync(p).isFile(); } catch { return false; } })
      .slice(0, 12);
    if (!list.length) throw new Error(i18n ? i18n.t('trayApp.notInTray') : 'No valid files to share.');

    const files = list.map(p => ({ path: p, name: path.basename(p), size: fs.statSync(p).size }));
    const token = crypto.randomBytes(5).toString('hex');
    const tokenBuf = Buffer.from(token);

    const checkToken = candidate => {
      const c = Buffer.from(String(candidate || ''));
      return c.length === tokenBuf.length && crypto.timingSafeEqual(c, tokenBuf);
    };

    server = http.createServer((req, res) => {
      try {
        const u = new URL(req.url || '/', 'http://127.0.0.1');
        const parts = u.pathname.split('/').filter(Boolean);
        if (parts[0] !== 'q' || !checkToken(parts[1]) || !activeShare || Date.now() > activeShare.expiresAt) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end('LumaDock LAN Drop: link expired or invalid.');
        }
        if (parts[2] === 'f' && /^\d+$/.test(parts[3] || '')) {
          const idx = Number(parts[3]);
          const item = activeShare.files[idx];
          if (!item || !fs.existsSync(item.path)) {
            res.writeHead(404);
            return res.end('File missing');
          }
          activeShare.downloads++;
          const stat = fs.statSync(item.path);
          res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(stat.size),
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(item.name)}`
          });
          fs.createReadStream(item.path).pipe(res);
          return;
        }
        const rows = activeShare.files.map((f, idx) =>
          `<a class="card" href="/q/${token}/f/${idx}"><div><b>${escapeHtml(f.name)}</b><small>${escapeHtml(formatBytes(f.size))}</small></div><span>⬇</span></a>`
        ).join('');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LumaDock Drop</title>
<style>body{margin:0;background:#0c0f0c;color:#f2f5ef;font:16px/1.4 -apple-system,Segoe UI,sans-serif;padding:28px 18px}
.wrap{max-width:440px;margin:0 auto}h1{font-size:21px;margin:0 0 6px}p{color:#9aa596;margin:0 0 20px;font-size:14px}
.card{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px;border-radius:16px;background:#161b16;border:1px solid rgba(255,255,255,.1);color:#fff;text-decoration:none;margin-bottom:10px}
.card b{display:block;font-size:15px;word-break:break-word}.card small{color:#9aa596;font-size:13px}.card span{width:40px;height:40px;border-radius:12px;background:#c6e994;color:#10180c;display:grid;place-items:center;font-weight:700;flex:none}</style></head>
<body><div class="wrap"><h1>LumaDock LAN Drop</h1><p>${activeShare.files.length === 1 ? 'Tap to download to this device' : `${activeShare.files.length} files shared on local Wi-Fi`}</p>${rows}</div></body></html>`);
      } catch {
        res.writeHead(500);
        res.end('Error');
      }
    });

    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '0.0.0.0', () => resolve());
    });
    const addr = server.address();
    const ip = lanIpv4Address();
    const url = `http://${ip}:${addr.port}/q/${token}`;
    const qrDataUrl = generateQrDataUrl(url, { dark: '#0b0e0a', light: '#f4f7f2', margin: 2 });
    const expiresAt = Date.now() + 20 * 60000;
    activeShare = { files, token, url, qrDataUrl, expiresAt, downloads: 0 };
    expireTimer = setTimeout(() => { stop().catch(() => {}); }, 20 * 60000);
    expireTimer.unref?.();
    return status();
  }

  return { start, stop, status };
}

function setupDevTools(electron, deps) {
  const { app, clipboard } = electron;
  const { handle, send, readJson, writeJson, getTray, onAppQuit } = deps;
  const i18n = require('../shared/i18n.cjs');
  const lanDrop = createLanDropManager(i18n);

  // ---------- 1. Picked Colors History ----------
  let colors = readJson('colors.json', []);
  if (!Array.isArray(colors)) colors = [];
  const colorsView = () => ({ colors: colors.slice(0, 12) });
  function recordColor(hex, rgb) {
    const clean = String(hex || '').trim().toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(clean)) return colorsView();
    const entry = { hex: clean, rgb: rgb || '', at: Date.now() };
    colors = [entry, ...colors.filter(c => c.hex !== clean)].slice(0, 12);
    writeJson('colors.json', colors);
    return colorsView();
  }
  handle('extras:colors-get', async () => colorsView());
  handle('extras:colors-add', async payload => recordColor(payload?.hex, payload?.rgb));
  handle('extras:colors-clear', async () => { colors = []; writeJson('colors.json', colors); return colorsView(); });

  // ---------- 2. Extended System Telemetry (Net RX/TX, Disk) — non-blocking, zero PDH spawns ----------
  let lastNetSample = null, latestWatcherNet = null, latestRxBps = 0, latestTxBps = 0;
  let cachedTelemetry = null, telemetryAt = 0, telemetryPending = null;
  app.on('lumadock-net-bytes', sample => {
    if (!sample || typeof sample.rx !== 'number' || typeof sample.tx !== 'number') return;
    if (latestWatcherNet && sample.rx >= latestWatcherNet.rx && sample.tx >= latestWatcherNet.tx) {
      const dt = Math.max(0.5, (sample.at - latestWatcherNet.at) / 1000);
      latestRxBps = Math.round((sample.rx - latestWatcherNet.rx) / dt);
      latestTxBps = Math.round((sample.tx - latestWatcherNet.tx) / dt);
    }
    latestWatcherNet = sample;
  });

  async function readTelemetry() {
    if (Date.now() - telemetryAt < 1000 && cachedTelemetry) return cachedTelemetry;
    if (telemetryPending) return telemetryPending;
    telemetryPending = (async () => {
      try {
        let diskPct = 0, diskUsedGb = 0, diskTotalGb = 0, diskFreeGb = 0;
        try {
          const targetDrive = process.platform === 'win32' ? (path.parse(os.homedir()).root || 'C:\\') : '/';
          const st = fs.statfsSync(targetDrive);
          const total = st.blocks * st.bsize;
          const free = st.bavail * st.bsize;
          const used = Math.max(0, total - free);
          diskTotalGb = Number((total / 1073741824).toFixed(0));
          diskFreeGb = Number((free / 1073741824).toFixed(0));
          diskUsedGb = Number((used / 1073741824).toFixed(0));
          diskPct = total > 0 ? Math.round((used / total) * 100) : 0;
        } catch {}

        let rxBps = 0, txBps = 0, gpuPct = null, gpuName = '';
        if (process.platform === 'win32') {
          if (latestWatcherNet && Date.now() - latestWatcherNet.at < 10000) {
            rxBps = latestRxBps;
            txBps = latestTxBps;
          } else {
            // Ultra-fast native netstat -e (<15ms, no PowerShell or PDH query stall)
            try {
              const out = await execFileAsync('netstat.exe', ['-e'], { timeout: 1500 });
              const m = out.match(/Bytes\s+(\d+)\s+(\d+)/i) || out.match(/Bayt\s+(\d+)\s+(\d+)/i) || out.match(/\r?\n\D*(\d{4,})\s+(\d{4,})/);
              if (m) {
                const rx = Number(m[1]) || 0, tx = Number(m[2]) || 0, now = Date.now();
                if (lastNetSample && rx >= lastNetSample.rx && tx >= lastNetSample.tx) {
                  const dt = Math.max(0.5, (now - lastNetSample.at) / 1000);
                  rxBps = Math.round((rx - lastNetSample.rx) / dt);
                  txBps = Math.round((tx - lastNetSample.tx) / dt);
                }
                lastNetSample = { rx, tx, at: now };
              }
            } catch {}
          }
        } else if (process.platform === 'darwin') {
          try {
            const out = await execFileAsync('/usr/sbin/netstat', ['-ibn'], { timeout: 2500 });
            let rx = 0, tx = 0;
            for (const line of out.split('\n').slice(1)) {
              const p = line.trim().split(/\s+/);
              if (p.length >= 10 && /^(en\d+)/.test(p[0]) && /^\d+$/.test(p[6]) && /^\d+$/.test(p[9])) {
                rx += Number(p[6]); tx += Number(p[9]);
              }
            }
            const now = Date.now();
            if (lastNetSample && rx >= lastNetSample.rx && tx >= lastNetSample.tx) {
              const dt = Math.max(0.5, (now - lastNetSample.at) / 1000);
              rxBps = Math.round((rx - lastNetSample.rx) / dt);
              txBps = Math.round((tx - lastNetSample.tx) / dt);
            }
            lastNetSample = { rx, tx, at: now };
          } catch {}
        }

        const prevRxHist = cachedTelemetry?.rxHistory || [];
        const prevTxHist = cachedTelemetry?.txHistory || [];
        cachedTelemetry = {
          rxBps,
          txBps,
          diskPct,
          diskUsedGb,
          diskFreeGb,
          diskTotalGb,
          gpuPct,
          gpuName,
          rxHistory: [...prevRxHist, rxBps].slice(-16),
          txHistory: [...prevTxHist, txBps].slice(-16)
        };
        telemetryAt = Date.now();
        return cachedTelemetry;
      } finally {
        telemetryPending = null;
      }
    })();
    return telemetryPending;
  }
  handle('extras:telemetry', readTelemetry);

  // ---------- 3. Dev Ports & Kill ----------
  let lastScannedPorts = [];
  async function scanPorts() {
    if (process.platform === 'win32') {
      const [ns, tl] = await Promise.all([
        execFileAsync('netstat.exe', ['-ano', '-p', 'TCP'], { timeout: 3500 }).catch(() => ''),
        execFileAsync('tasklist.exe', ['/FO', 'CSV', '/NH'], { timeout: 3500 }).catch(() => '')
      ]);
      lastScannedPorts = parseNetstatPorts(ns, tl, process.pid);
    } else {
      const out = await execFileAsync('lsof', ['-iTCP', '-sTCP:LISTEN', '-P', '-n'], { timeout: 3500 }).catch(() => '');
      lastScannedPorts = parseLsofPorts(out, process.pid);
    }
    return { ports: lastScannedPorts };
  }
  handle('extras:ports', scanPorts);
  handle('extras:port-kill', async payload => {
    const pid = Number(payload?.pid);
    const known = lastScannedPorts.find(p => p.pid === pid);
    if (!known || pid === process.pid || pid <= 4) throw new Error(i18n.t('common.notFound'));
    if (process.platform === 'win32') {
      await execFileAsync('taskkill.exe', ['/PID', String(pid), '/F'], { timeout: 4000 });
    } else {
      process.kill(pid, 'SIGTERM');
    }
    return scanPorts();
  });

  // ---------- 4. Git Repo Status ----------
  function resolveActiveRepoDir() {
    try {
      const pm = readJson('lumadock-project.json', null);
      if (pm?.path && fs.existsSync(pm.path)) return pm.path;
    } catch {}
    try {
      const list = app.lumadockMonitor?.projects?.() || [];
      for (const p of list) if (p?.cwd && fs.existsSync(p.cwd)) return p.cwd;
    } catch {}
    return '';
  }
  handle('extras:git-status', async () => {
    const dir = resolveActiveRepoDir();
    if (!dir) return { git: null };
    try {
      const out = await execFileAsync('git', ['-C', dir, '--no-optional-locks', 'status', '--porcelain=v1', '-b'], { timeout: 2500 });
      return { git: parseGitStatus(out, dir) };
    } catch {
      return { git: null };
    }
  });

  // ---------- 5. LAN AirDrop QR Drop ----------
  handle('extras:lan-share-start', async payload => {
    const tray = getTray ? getTray() : [];
    const reqPaths = Array.isArray(payload?.paths) && payload.paths.length ? payload.paths : (payload?.path ? [payload.path] : tray);
    const valid = reqPaths.filter(p => tray.includes(p));
    return { share: await lanDrop.start(valid.length ? valid : reqPaths) };
  });
  handle('extras:lan-share-stop', async () => ({ share: await lanDrop.stop() }));
  handle('extras:lan-share-status', async () => ({ share: lanDrop.status() }));

  // ---------- 6. Market Ticker & FX Rates (0ms stale-while-revalidate + deduplication) ----------
  const savedMarket = readJson('market-cache.json', null);
  let marketCache = savedMarket?.items?.length ? savedMarket : { at: 0, rates: { USD: 1 }, items: [] };
  let marketPending = null;
  async function fetchMarketNow() {
    if (marketPending) return marketPending;
    marketPending = (async () => {
      try {
        const [fxRes, cryptoRes] = await Promise.all([
          fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(3200) }).then(r => r.json()).catch(() => null),
          fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,pax-gold&vs_currencies=usd,try&include_24hr_change=true', { signal: AbortSignal.timeout(3200) })
            .then(r => (r.ok ? r.json() : null)).catch(() => null)
        ]);
        let btcUsd = cryptoRes?.bitcoin?.usd || 0, btcChg = cryptoRes?.bitcoin?.usd_24h_change ?? null;
        let ethUsd = cryptoRes?.ethereum?.usd || 0, ethChg = cryptoRes?.ethereum?.usd_24h_change ?? null;
        const solUsd = cryptoRes?.solana?.usd || 0;
        const paxgUsd = cryptoRes?.['pax-gold']?.usd || 0;
        if (!btcUsd || !ethUsd) {
          const [cbBtc, cbEth] = await Promise.all([
            !btcUsd ? fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot', { signal: AbortSignal.timeout(2500) }).then(r => r.json()).catch(() => null) : null,
            !ethUsd ? fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot', { signal: AbortSignal.timeout(2500) }).then(r => r.json()).catch(() => null) : null
          ]);
          if (cbBtc?.data?.amount) btcUsd = Number(cbBtc.data.amount) || btcUsd;
          if (cbEth?.data?.amount) ethUsd = Number(cbEth.data.amount) || ethUsd;
        }
        const r = fxRes?.rates || {};
        const prevRates = marketCache.rates || {};
        const rates = { USD: 1 };
        for (const cur of ['TRY', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'SAR', 'AED', 'RUB', 'CNY']) {
          rates[cur] = Number(r[cur]) || prevRates[cur] || 0;
        }
        const items = [];
        if (rates.TRY) items.push({ pair: 'USD/TRY', price: rates.TRY.toFixed(2), symbol: '₺', change: null });
        if (rates.TRY && rates.EUR) items.push({ pair: 'EUR/TRY', price: (rates.TRY / rates.EUR).toFixed(2), symbol: '₺', change: null });
        if (rates.TRY && rates.GBP) items.push({ pair: 'GBP/TRY', price: (rates.TRY / rates.GBP).toFixed(2), symbol: '₺', change: null });
        if (paxgUsd) {
          rates.XAU = 1 / paxgUsd;
          rates.GAU = 31.1034768 / paxgUsd;
          if (rates.TRY) items.push({ pair: 'GAU/TRY', price: Math.round(rates.TRY / rates.GAU).toLocaleString('en-US'), symbol: '₺', change: cryptoRes?.['pax-gold']?.usd_24h_change != null ? Number(cryptoRes['pax-gold'].usd_24h_change.toFixed(1)) : null });
        }
        if (btcUsd) {
          rates.BTC = 1 / btcUsd;
          items.push({ pair: 'BTC/USD', price: Math.round(btcUsd).toLocaleString('en-US'), symbol: '$', change: btcChg != null ? Number(btcChg.toFixed(1)) : null });
        }
        if (ethUsd) {
          rates.ETH = 1 / ethUsd;
          items.push({ pair: 'ETH/USD', price: Math.round(ethUsd).toLocaleString('en-US'), symbol: '$', change: ethChg != null ? Number(ethChg.toFixed(1)) : null });
        }
        if (solUsd) rates.SOL = 1 / solUsd;
        if (items.length) {
          marketCache = { at: Date.now(), rates, items };
          writeJson('market-cache.json', marketCache);
          send?.('extras:market', marketCache);
        }
        return marketCache;
      } finally {
        marketPending = null;
      }
    })();
    return marketPending;
  }
  async function readMarket(force = false) {
    if (force) return fetchMarketNow();
    if (marketCache.items.length) {
      if (Date.now() - marketCache.at > 90000) fetchMarketNow().catch(() => {});
      return marketCache;
    }
    return fetchMarketNow();
  }
  handle('extras:market', async payload => readMarket(Boolean(payload?.force)));

  handle('extras:eval', async payload => {
    const q = String(payload?.query || '').trim();
    if (!q) return { result: null };
    const math = evaluateMath(q);
    if (math) return { result: { kind: 'math', value: math.formatted, label: `${q} = ${math.formatted}` } };
    const mkt = await readMarket(false).catch(() => marketCache);
    const conv = evaluateConversion(q, mkt.rates);
    if (conv) return { result: { kind: conv.kind, value: conv.formatted, label: conv.formatted } };
    return { result: null };
  });

  // ---------- 7. Quick Translate (EN <-> TR / Auto) ----------
  handle('extras:translate', async payload => {
    const text = String(payload?.text || '').trim().slice(0, 1000);
    if (!text) return { translated: '', from: '', to: '' };
    const hasTrChars = /[ğüşöçıİĞÜŞÖÇ]/.test(text);
    const from = payload?.from || (hasTrChars ? 'tr' : 'auto');
    const to = payload?.to || (hasTrChars ? 'en' : 'tr');
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(from)}&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const json = await res.json();
        const translated = Array.isArray(json?.[0]) ? json[0].map(s => s?.[0] || '').join('') : '';
        if (translated) return { translated, from: json?.[2] || from, to };
      }
    } catch {}
    const pairFrom = from === 'auto' ? 'en' : from;
    const mmRes = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${pairFrom}|${to}`, { signal: AbortSignal.timeout(7000) }).then(r => r.json());
    const translated = String(mmRes?.responseData?.translatedText || '').trim();
    if (!translated) throw new Error(i18n.t('common.error'));
    return { translated, from: pairFrom, to };
  });

  // ---------- 8. OCR on arbitrary image dataURL ----------
  handle('extras:ocr-image', async payload => {
    const dataUrl = String(payload?.dataUrl || '');
    const m = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!m || m[1].length > 10 * 1024 * 1024) throw new Error('Invalid image payload.');
    const tmp = path.join(os.tmpdir(), `lumadock-ocr-${crypto.randomBytes(4).toString('hex')}.png`);
    fs.writeFileSync(tmp, Buffer.from(m[1], 'base64'));
    try {
      const r = await runOcrFromFile(tmp, i18n.getLanguage());
      if (payload?.copy && r.ok && r.text) clipboard.writeText(r.text);
      return r;
    } finally {
      try { fs.rmSync(tmp, { force: true }); } catch {}
    }
  });

  // ---------- 9. Build / Script Watchdog ----------
  const { spawn } = require('node:child_process');
  let savedJobs = readJson('dev-commands.json', [
    { id: 'job-test', name: 'Tests (npm test)', cmd: 'npm test' },
    { id: 'job-build', name: 'Build (npm run build)', cmd: 'npm run build' }
  ]);
  if (!Array.isArray(savedJobs)) savedJobs = [];
  let activeJob = null;
  let watchdogState = { running: false, id: '', name: '', cmd: '', code: null, durationMs: 0, ok: null, lastLine: '', errorTail: '' };

  function detectPkgScripts() {
    const dir = resolveActiveRepoDir();
    if (!dir) return [];
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      return Object.keys(pkg.scripts || {}).slice(0, 8).map(k => ({ id: 'pkg-' + k, name: `npm run ${k}`, cmd: `npm run ${k}`, auto: true }));
    } catch { return []; }
  }

  handle('extras:watchdog-list', async () => ({ jobs: savedJobs, pkgScripts: detectPkgScripts(), state: watchdogState, repoDir: resolveActiveRepoDir() }));
  handle('extras:watchdog-save', async payload => {
    const name = String(payload?.name || '').trim().slice(0, 40);
    const cmd = String(payload?.cmd || '').trim().slice(0, 240);
    if (!name || !cmd || /[\r\n\0]/.test(cmd)) throw new Error(i18n.t('common.notFound'));
    const entry = { id: payload?.id || 'job-' + Date.now().toString(36), name, cmd };
    savedJobs = [entry, ...savedJobs.filter(j => j.id !== entry.id)].slice(0, 10);
    writeJson('dev-commands.json', savedJobs);
    return { jobs: savedJobs };
  });
  handle('extras:watchdog-delete', async payload => {
    savedJobs = savedJobs.filter(j => j.id !== payload?.id);
    writeJson('dev-commands.json', savedJobs);
    return { jobs: savedJobs };
  });
  handle('extras:watchdog-stop', async () => {
    if (activeJob) { try { activeJob.kill(); } catch {} activeJob = null; }
    watchdogState = { ...watchdogState, running: false, ok: false, lastLine: i18n.t('status.stopped') };
    send?.('extras:watchdog', watchdogState);
    return { state: watchdogState };
  });
  handle('extras:watchdog-run', async payload => {
    const dir = resolveActiveRepoDir() || os.homedir();
    const cmdText = String(payload?.cmd || '').trim().slice(0, 240);
    const name = String(payload?.name || cmdText).slice(0, 40);
    if (!cmdText || /[\r\n\0]/.test(cmdText)) throw new Error(i18n.t('common.notFound'));
    if (activeJob) { try { activeJob.kill(); } catch {} activeJob = null; }

    const startedAt = Date.now();
    watchdogState = { running: true, id: payload?.id || 'custom', name, cmd: cmdText, code: null, durationMs: 0, ok: null, lastLine: '…', errorTail: '' };
    send?.('extras:watchdog', watchdogState);

    const shellBin = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
    const shellArgs = process.platform === 'win32' ? ['/d', '/s', '/c', cmdText] : ['-c', cmdText];
    const child = spawn(shellBin, shellArgs, { cwd: dir, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    activeJob = child;
    let tail = '';
    const onData = chunk => {
      const s = chunk.toString();
      tail = (tail + s).slice(-3500);
      const lines = s.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length) {
        watchdogState = { ...watchdogState, lastLine: lines[lines.length - 1].slice(0, 90), durationMs: Date.now() - startedAt };
        send?.('extras:watchdog', watchdogState);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', code => {
      if (activeJob === child) activeJob = null;
      const ok = code === 0;
      const errLines = tail.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      watchdogState = {
        ...watchdogState,
        running: false,
        code,
        durationMs: Date.now() - startedAt,
        ok,
        lastLine: errLines[errLines.length - 1]?.slice(0, 90) || (ok ? 'OK' : `Exit ${code}`),
        errorTail: ok ? '' : errLines.slice(-18).join('\n')
      };
      send?.('extras:watchdog', watchdogState);
      app.lumadockContext?.recordAiActivity({ ok });
    });
    return { state: watchdogState };
  });

  onAppQuit(() => {
    lanDrop.stop().catch(() => {});
    if (activeJob) try { activeJob.kill(); } catch {}
  });

  return { runOcrFromFile, recordColor, lanDrop, lanIpv4Address, resolveActiveRepoDir };
}

module.exports = {
  setupDevTools,
  parseNetstatPorts,
  parseLsofPorts,
  parseGitStatus,
  lanIpv4Address,
  runOcrFromFile,
  createLanDropManager
};
