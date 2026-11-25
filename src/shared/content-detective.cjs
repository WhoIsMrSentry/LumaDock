'use strict';
// Deterministic clipboard/selection content classifier for LumaDock's 8s Action Strip.
// Pure functions only — safe to unit test without Electron runtime.

const PASSWORD_MANAGER_RE = /^(?:keepass|keepassxc|bitwarden|1password|dashlane|lastpass|enpass|proton\s?pass|roboform|nordpass)(?:\.exe)?$/i;
const SENSITIVE_TEXT_RE = /^(?:-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----|(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{24,}|AIza[0-9A-Za-z_-]{30,})$/;

function isSensitiveOwner(procName = '') {
  return PASSWORD_MANAGER_RE.test(String(procName || '').trim());
}

function validateIbanMod97(ibanClean) {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(ibanClean)) return false;
  const rearranged = ibanClean.slice(4) + ibanClean.slice(0, 4);
  let rem = 0;
  for (let i = 0; i < rearranged.length; i++) {
    const ch = rearranged.charCodeAt(i);
    const digits = ch >= 65 && ch <= 90 ? String(ch - 55) : rearranged[i];
    for (let j = 0; j < digits.length; j++) {
      rem = (rem * 10 + Number(digits[j])) % 97;
    }
  }
  return rem === 1;
}

function decodeBase64UrlJson(seg) {
  const padded = seg.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((seg.length + 3) % 4);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

function rgbFromHex(hex6) {
  const n = parseInt(hex6.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relLuminance([r, g, b]) {
  const ch = [r, g, b].map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function analyzeClipboardContent(rawText, ownerProcess = '') {
  if (isSensitiveOwner(ownerProcess)) {
    return { skip: true, reason: 'password-manager', kind: 'sensitive' };
  }
  const text = String(rawText || '').trim();
  if (!text || text.length > 16000) return null;
  if (SENSITIVE_TEXT_RE.test(text)) {
    return { skip: true, reason: 'secret-token', kind: 'sensitive' };
  }

  // 1. Listening/bind port error or localhost URL -> offer Inspect / Kill Port + Ask AI
  const portMatch = text.match(/(?:EADDRINUSE[^\d]{0,24}|address already in use[^\d]{0,24}|listen\s+(?:tcp|udp)?\s*[^\d]{0,8}|localhost:|127\.0\.0\.1:|0\.0\.0\.0:)(\d{2,5})\b/i);
  if (portMatch) {
    const port = Number(portMatch[1]);
    if (port >= 1 && port <= 65535) {
      return {
        kind: 'port-error',
        badge: `:${port}`,
        preview: text.split(/\r?\n/)[0].slice(0, 72),
        meta: { port },
        actions: ['kill-port', 'ask-ai']
      };
    }
  }

  // 2. JWT token (header.payload.sig)
  const jwtMatch = text.match(/^([A-Za-z0-9_-]{8,})\.([A-Za-z0-9_-]{12,})\.([A-Za-z0-9_-]*)$/);
  if (jwtMatch && jwtMatch[1].startsWith('eyJ') && jwtMatch[2].startsWith('eyJ')) {
    try {
      const header = decodeBase64UrlJson(jwtMatch[1]);
      const payload = decodeBase64UrlJson(jwtMatch[2]);
      const expSec = typeof payload.exp === 'number' ? payload.exp : null;
      const expired = expSec !== null ? (Date.now() / 1000 > expSec) : null;
      const expIso = expSec !== null ? new Date(expSec * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '';
      const pretty = JSON.stringify({ header, payload }, null, 2);
      return {
        kind: 'jwt',
        badge: header.alg || 'JWT',
        preview: [payload.sub || payload.email || payload.iss || 'JWT', expIso ? (expired ? `EXP ${expIso}` : expIso) : ''].filter(Boolean).join(' · '),
        meta: { header, payload, expired, expIso, pretty },
        actions: ['copy-decoded', 'ask-ai']
      };
    } catch {}
  }

  // 3. Stack trace / runtime error
  if (/\b(?:TypeError|ReferenceError|SyntaxError|RangeError|UnhandledPromiseRejection|Traceback \(most recent call last\)|Exception in thread|ERR_MODULE_NOT_FOUND|ENOENT:)\b/m.test(text)
      || /\n\s+at\s+\S+\s+\([^)]+:\d+:\d+\)/.test(text)) {
    return {
      kind: 'error',
      badge: 'ERR',
      preview: text.split(/\r?\n/).find(l => l.trim())?.slice(0, 78) || 'Error',
      meta: { text: text.slice(0, 4000) },
      actions: ['ask-ai', 'translate']
    };
  }

  // 4. Valid JSON object / array
  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
    try {
      const parsed = JSON.parse(text);
      const pretty = JSON.stringify(parsed, null, 2);
      const compact = JSON.stringify(parsed);
      const count = Array.isArray(parsed) ? parsed.length : Object.keys(parsed || {}).length;
      return {
        kind: 'json',
        badge: 'JSON',
        preview: Array.isArray(parsed) ? `[${count} items]` : `{${count} keys}`,
        meta: { count, pretty, compact },
        actions: ['copy-pretty', 'copy-compact']
      };
    } catch {}
  }

  // 5. Unix Epoch timestamp (10-digit seconds or 13-digit milliseconds)
  if (/^\d{10}$/.test(text) || /^\d{13}$/.test(text)) {
    const ms = text.length === 13 ? Number(text) : Number(text) * 1000;
    if (ms >= 946684800000 && ms <= 4102444800000) {
      const d = new Date(ms);
      const iso = d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
      const local = d.toLocaleString();
      return {
        kind: 'epoch',
        badge: 'TIME',
        preview: iso,
        meta: { ms, iso, local },
        actions: ['copy-date']
      };
    }
  }

  // 6. Hex color (#rgb or #rrggbb)
  const hexM = text.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (hexM) {
    const raw = hexM[1];
    const hex6 = '#' + (raw.length === 3 ? raw.split('').map(c => c + c).join('') : raw).toUpperCase();
    const rgb = rgbFromHex(hex6);
    const lum = relLuminance(rgb);
    const contrastWhite = Number(((1.05) / (lum + 0.05)).toFixed(1));
    const contrastBlack = Number(((lum + 0.05) / 0.05).toFixed(1));
    return {
      kind: 'color',
      badge: hex6,
      preview: `rgb(${rgb.join(', ')}) · W:${contrastWhite}:1 B:${contrastBlack}:1`,
      meta: { hex: hex6, rgb: `rgb(${rgb.join(', ')})`, contrastWhite, contrastBlack },
      actions: ['save-color', 'copy-rgb']
    };
  }

  // 7. Validated IBAN
  const ibanClean = text.replace(/\s+/g, '').toUpperCase();
  if (/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(ibanClean) && validateIbanMod97(ibanClean)) {
    const formatted = ibanClean.replace(/(.{4})/g, '$1 ').trim();
    return {
      kind: 'iban',
      badge: 'IBAN',
      preview: formatted,
      meta: { clean: ibanClean, formatted },
      actions: ['copy-clean']
    };
  }

  // 8. Pure printable UTF-8 Base64 payload
  if (text.length >= 16 && text.length <= 4096 && text.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(text)) {
    try {
      const buf = Buffer.from(text, 'base64');
      const decoded = buf.toString('utf8');
      if (decoded && decoded.length >= 4 && !/[\x00-\x08\x0E-\x1F\uFFFD]/.test(decoded)) {
        return {
          kind: 'base64',
          badge: 'B64',
          preview: decoded.slice(0, 68),
          meta: { decoded },
          actions: ['copy-decoded']
        };
      }
    } catch {}
  }

  // 9. Single URL
  if (/^https?:\/\/[^\s]{4,512}$/i.test(text)) {
    try {
      const u = new URL(text);
      return {
        kind: 'url',
        badge: 'URL',
        preview: u.hostname + (u.pathname !== '/' ? u.pathname.slice(0, 28) : ''),
        meta: { url: text, host: u.hostname },
        actions: ['open-url', 'make-qr']
      };
    } catch {}
  }

  return null;
}

module.exports = {
  analyzeClipboardContent,
  isSensitiveOwner,
  validateIbanMod97
};
