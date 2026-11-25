'use strict';
// Pure-Node ZIP archive builder (zlib deflateRaw + CRC32) & Electron nativeImage media converter / EXIF stripper.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear()) - 1980;
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f);
  const day = ((year & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f);
  return { time, day };
}

/**
 * Creates a standard PKZIP buffer from [{ name, data: Buffer, mtime?: Date }] entries.
 */
function createZipBuffer(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const item of entries) {
    const safeName = String(item.name || 'file').replace(/^[\\/]+/, '').replace(/\\/g, '/');
    const nameBuf = Buffer.from(safeName, 'utf8');
    const raw = Buffer.isBuffer(item.data) ? item.data : Buffer.from(item.data || '');
    const deflated = zlib.deflateRawSync(raw, { level: 6 });
    const useDeflate = deflated.length < raw.length;
    const payload = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(raw);
    const { time, day } = dosDateTime(item.mtime instanceof Date ? item.mtime : new Date());

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    lfh.writeUInt16LE(method, 8);
    lfh.writeUInt16LE(time, 10);
    lfh.writeUInt16LE(day, 12);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(payload.length, 18);
    lfh.writeUInt32LE(raw.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);

    localParts.push(lfh, nameBuf, payload);

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4);
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(0x0800, 8);
    cdh.writeUInt16LE(method, 10);
    cdh.writeUInt16LE(time, 12);
    cdh.writeUInt16LE(day, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(payload.length, 20);
    cdh.writeUInt32LE(raw.length, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30);
    cdh.writeUInt16LE(0, 32);
    cdh.writeUInt16LE(0, 34);
    cdh.writeUInt16LE(0, 36);
    cdh.writeUInt32LE(0, 38);
    cdh.writeUInt32LE(offset, 42);
    centralParts.push(cdh, nameBuf);

    offset += lfh.length + nameBuf.length + payload.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuf, eocd]);
}

function collectFilesForZip(inputPaths, maxTotalBytes = 120 * 1024 * 1024) {
  const entries = [];
  let totalBytes = 0;

  function walk(fullPath, relName, depth) {
    if (depth > 8 || entries.length >= 600) return;
    let st;
    try { st = fs.lstatSync(fullPath); } catch { return; }
    if (st.isSymbolicLink()) return;
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(fullPath)) {
        if (name === '.git' || name === 'node_modules') continue;
        walk(path.join(fullPath, name), `${relName}/${name}`, depth + 1);
      }
      return;
    }
    if (!st.isFile() || st.size > maxTotalBytes || totalBytes + st.size > maxTotalBytes) return;
    totalBytes += st.size;
    entries.push({ name: relName, data: fs.readFileSync(fullPath), mtime: st.mtime });
  }

  const usedRoots = new Set();
  for (const p of inputPaths || []) {
    if (!p || !fs.existsSync(p)) continue;
    let base = path.basename(p);
    while (usedRoots.has(base)) base = '_' + base;
    usedRoots.add(base);
    walk(p, base, 0);
  }
  return entries;
}

function uniqueOutputPath(dir, stem, ext) {
  let candidate = path.join(dir, `${stem}.${ext}`);
  let n = 1;
  while (fs.existsSync(candidate) && n < 500) {
    candidate = path.join(dir, `${stem}-${n}.${ext}`);
    n++;
  }
  return candidate;
}

async function createZipFromPaths(inputPaths, targetDir) {
  const valid = (inputPaths || []).filter(p => p && fs.existsSync(p));
  if (!valid.length) throw new Error('No readable files to archive.');
  const entries = collectFilesForZip(valid);
  if (!entries.length) throw new Error('Files exceed safety limits or archive is empty.');
  const buf = createZipBuffer(entries);
  const firstStem = path.parse(valid[0]).name || 'lumadock-bundle';
  const outDir = targetDir || path.dirname(valid[0]);
  const outPath = uniqueOutputPath(outDir, valid.length > 1 ? `${firstStem}-bundle` : firstStem, 'zip');
  fs.writeFileSync(outPath, buf);
  return { outPath, count: entries.length, bytes: buf.length };
}

/**
 * Converts, compresses, or EXIF-strips an image using Electron nativeImage (and optional renderer WebP encoder).
 */
async function convertImageFile(nativeImage, filePath, mode = 'compress', opts = {}) {
  if (!filePath || !fs.existsSync(filePath)) throw new Error('Image file not found.');
  const origBytes = fs.statSync(filePath).size;
  let img = nativeImage.createFromPath(filePath);
  if (img.isEmpty()) throw new Error('Unsupported or empty image.');
  let size = img.getSize();
  const maxW = Number(opts.maxWidth) || (mode === 'compress' ? 1920 : 4096);
  if (size.width > maxW) {
    img = img.resize({ width: maxW, quality: 'best' });
    size = img.getSize();
  }
  // Rebuilding from raw bitmap discards EXIF/GPS/camera metadata cleanly
  const cleanBmp = img.toBitmap();
  const cleanImg = nativeImage.createFromBitmap(cleanBmp, size);

  const parsed = path.parse(filePath);
  let outBuf, ext, suffix;
  if (mode === 'webp' && typeof opts.encodeWebp === 'function') {
    const dataUrl = await opts.encodeWebp(cleanImg.toDataURL(), Number(opts.quality) || 0.84);
    const b64 = String(dataUrl || '').replace(/^data:image\/webp;base64,/, '');
    if (!b64) throw new Error('WebP encoding failed.');
    outBuf = Buffer.from(b64, 'base64');
    ext = 'webp';
    suffix = '-lumadock';
  } else if (mode === 'png') {
    outBuf = cleanImg.toPNG();
    ext = 'png';
    suffix = '-clean';
  } else if (mode === 'strip') {
    const origExt = parsed.ext.toLowerCase().replace('.', '');
    if (origExt === 'jpg' || origExt === 'jpeg') {
      outBuf = cleanImg.toJPEG(Number(opts.quality) || 90);
      ext = 'jpg';
    } else {
      outBuf = cleanImg.toPNG();
      ext = 'png';
    }
    suffix = '-noexif';
  } else {
    // 'jpg' or 'compress'
    outBuf = cleanImg.toJPEG(Number(opts.quality) || 82);
    ext = 'jpg';
    suffix = mode === 'compress' ? '-min' : '-lumadock';
  }

  const outPath = uniqueOutputPath(parsed.dir, `${parsed.name}${suffix}`, ext);
  fs.writeFileSync(outPath, outBuf);
  const savedPct = origBytes > 0 ? Math.round((1 - outBuf.length / origBytes) * 100) : 0;
  return { outPath, origBytes, outBytes: outBuf.length, savedPct, width: size.width, height: size.height, format: ext };
}

module.exports = {
  crc32,
  createZipBuffer,
  collectFilesForZip,
  createZipFromPaths,
  convertImageFile
};
