'use strict';
// Lightweight ISO/IEC 18004 QR Code Byte-mode Generator (Versions 1..6, Error Correction M).
// Zero external dependencies so LumaDock can render LAN Drop QR codes locally without external APIs.

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]]);

function rsGenerator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    const root = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  return poly;
}

function rsRemainder(data, ecLen) {
  const gen = rsGenerator(ecLen);
  const res = new Uint8Array(ecLen);
  for (const byte of data) {
    const factor = byte ^ res[0];
    res.copyWithin(0, 1);
    res[ecLen - 1] = 0;
    if (factor) {
      for (let j = 0; j < ecLen; j++) res[j] ^= gfMul(gen[j + 1], factor);
    }
  }
  return res;
}

// Version specs at EC Level M (00): [version, size, totalDataBytes, blocks, ecPerBlock, alignCoords]
const SPECS_M = [
  { v: 1, n: 21, cap: 14, data: 16, blocks: 1, ec: 10, align: [] },
  { v: 2, n: 25, cap: 26, data: 28, blocks: 1, ec: 16, align: [6, 18] },
  { v: 3, n: 29, cap: 42, data: 44, blocks: 1, ec: 26, align: [6, 22] },
  { v: 4, n: 33, cap: 62, data: 64, blocks: 2, ec: 18, align: [6, 26] },
  { v: 5, n: 37, cap: 84, data: 86, blocks: 2, ec: 24, align: [6, 30] },
  { v: 6, n: 41, cap: 106, data: 108, blocks: 4, ec: 16, align: [6, 34] }
];

function encodeCodewords(bytes) {
  const spec = SPECS_M.find(s => bytes.length <= s.cap);
  if (!spec) throw new Error('Text exceeds QR capacity (max 106 bytes).');

  const bits = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  push(0b0100, 4); // Byte mode
  push(bytes.length, 8); // Char count for v1..v9
  for (const b of bytes) push(b, 8);
  const maxBits = spec.data * 8;
  push(0, Math.min(4, maxBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  const padBytes = [0xec, 0x11];
  for (let i = 0; bits.length < maxBits; i++) push(padBytes[i & 1], 8);

  const raw = new Uint8Array(spec.data);
  for (let i = 0; i < spec.data; i++) {
    let v = 0;
    for (let b = 0; b < 8; b++) v = (v << 1) | bits[i * 8 + b];
    raw[i] = v;
  }

  const blockSize = spec.data / spec.blocks;
  const dataBlocks = [];
  const ecBlocks = [];
  for (let b = 0; b < spec.blocks; b++) {
    const slice = raw.subarray(b * blockSize, (b + 1) * blockSize);
    dataBlocks.push(slice);
    ecBlocks.push(rsRemainder(slice, spec.ec));
  }

  const out = [];
  for (let i = 0; i < blockSize; i++) for (const blk of dataBlocks) out.push(blk[i]);
  for (let i = 0; i < spec.ec; i++) for (const blk of ecBlocks) out.push(blk[i]);
  return { spec, codewords: out };
}

function buildMatrixSkeleton(n, align) {
  const mat = Array.from({ length: n }, () => new Int8Array(n)); // 0 empty, 1 light, 2 dark (stored as bit: -1 reserved empty, or use separate func mask)
  const isFunc = Array.from({ length: n }, () => new Uint8Array(n));
  const setFunc = (r, c, dark) => {
    if (r >= 0 && r < n && c >= 0 && c < n) {
      mat[r][c] = dark ? 1 : 0;
      isFunc[r][c] = 1;
    }
  };

  const drawFinder = (r0, c0) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = r0 + dr, c = c0 + dc;
        if (r < 0 || r >= n || c < 0 || c >= n) continue;
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const border = inOuter && (dr === 0 || dr === 6 || dc === 0 || dc === 6);
        const center = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setFunc(r, c, border || center);
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, n - 7);
  drawFinder(n - 7, 0);

  for (const r0 of align) {
    for (const c0 of align) {
      if ((r0 <= 8 && c0 <= 8) || (r0 <= 8 && c0 >= n - 9) || (r0 >= n - 9 && c0 <= 8)) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dist = Math.max(Math.abs(dr), Math.abs(dc));
          setFunc(r0 + dr, c0 + dc, dist === 0 || dist === 2);
        }
      }
    }
  }

  for (let i = 8; i < n - 8; i++) {
    setFunc(6, i, i % 2 === 0);
    setFunc(i, 6, i % 2 === 0);
  }
  setFunc(n - 8, 8, true); // dark module

  // Reserve format info cells
  for (let i = 0; i <= 8; i++) {
    if (!isFunc[8][i]) isFunc[8][i] = 1;
    if (!isFunc[i][8]) isFunc[i][8] = 1;
  }
  for (let i = n - 8; i < n; i++) isFunc[8][i] = 1;
  for (let i = n - 7; i < n; i++) isFunc[i][8] = 1;

  return { mat, isFunc };
}

function formatBits(mask) {
  // EC Level M = 00
  const data = mask & 7;
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) {
    if (rem & (1 << i)) rem ^= 0x537 << (i - 10);
  }
  return ((data << 10) | rem) ^ 0x5412;
}

function applyFormat(mat, n, mask) {
  const fmt = formatBits(mask);
  for (let i = 0; i <= 5; i++) mat[8][i] = (fmt >>> (14 - i)) & 1;
  mat[8][7] = (fmt >>> 8) & 1;
  mat[8][8] = (fmt >>> 7) & 1;
  mat[7][8] = (fmt >>> 6) & 1;
  for (let i = 9; i <= 14; i++) mat[14 - i][8] = (fmt >>> (14 - i)) & 1;

  for (let i = 0; i <= 7; i++) mat[8][n - 1 - i] = (fmt >>> i) & 1;
  for (let i = 0; i <= 6; i++) mat[n - 7 + i][8] = (fmt >>> (14 - i)) & 1;
}

const MASK_FNS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
];

function penalty(mat, n) {
  let score = 0;
  for (let r = 0; r < n; r++) {
    let runC = 1, last = mat[r][0];
    for (let c = 1; c < n; c++) {
      if (mat[r][c] === last) { runC++; if (runC === 5) score += 3; else if (runC > 5) score += 1; }
      else { last = mat[r][c]; runC = 1; }
    }
  }
  for (let c = 0; c < n; c++) {
    let runR = 1, last = mat[0][c];
    for (let r = 1; r < n; r++) {
      if (mat[r][c] === last) { runR++; if (runR === 5) score += 3; else if (runR > 5) score += 1; }
      else { last = mat[r][c]; runR = 1; }
    }
  }
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const v = mat[r][c];
      if (v === mat[r + 1][c] && v === mat[r][c + 1] && v === mat[r + 1][c + 1]) score += 3;
    }
  }
  return score;
}

function generateQrMatrix(text) {
  const bytes = Buffer.from(String(text || ''), 'utf8');
  const { spec, codewords } = encodeCodewords(bytes);
  const { n, align } = spec;
  const { mat: baseMat, isFunc } = buildMatrixSkeleton(n, align);

  // Place data bits in upward/downward zigzag
  let bitIdx = 0;
  const totalBits = codewords.length * 8;
  let up = true;
  for (let col = n - 1; col >= 1; col -= 2) {
    if (col === 6) col--;
    for (let i = 0; i < n; i++) {
      const r = up ? n - 1 - i : i;
      for (const c of [col, col - 1]) {
        if (isFunc[r][c]) continue;
        let bit = 0;
        if (bitIdx < totalBits) {
          bit = (codewords[bitIdx >> 3] >>> (7 - (bitIdx & 7))) & 1;
          bitIdx++;
        }
        baseMat[r][c] = bit;
      }
    }
    up = !up;
  }

  let bestMat = null, bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const fn = MASK_FNS[mask];
    const m = baseMat.map((row, r) => row.map((v, c) => (isFunc[r][c] ? v : v ^ (fn(r, c) ? 1 : 0))));
    applyFormat(m, n, mask);
    const s = penalty(m, n);
    if (s < bestScore) { bestScore = s; bestMat = m; }
  }

  return { version: spec.v, size: n, modules: bestMat };
}

function generateQrSvg(text, { dark = '#0b0e0a', light = '#ffffff', margin = 2 } = {}) {
  const { size, modules } = generateQrMatrix(text);
  const full = size + margin * 2;
  let paths = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) paths += `M${c + margin},${r + margin}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full} ${full}" shape-rendering="crispEdges"><rect width="${full}" height="${full}" fill="${light}"/><path d="${paths}" fill="${dark}"/></svg>`;
}

function generateQrDataUrl(text, opts) {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(generateQrSvg(text, opts));
}

module.exports = { generateQrMatrix, generateQrSvg, generateQrDataUrl };
