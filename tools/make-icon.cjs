// Draws the LumaDock Cyber-Bot (Grokbot / OLED Visor) app icon and Settings icon.
// Writes PNGs + Windows .ico files + high-DPI tray icons.
// Run: node_modules\electron\dist\electron.exe tools\make-icon.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path');
const OUT = process.env.ICON_OUT || path.join(__dirname, '..', 'assets');
const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256, 512];

function svg(size, withGear = false) {
  const small = size <= 32;
  const strokeW = small ? 1.8 : 1.3;
  const eyeRx = small ? 1.8 : 1.5;
  const gearOverlay = withGear ? `
    <g transform="translate(30, 30)">
      <circle cx="0" cy="0" r="8.5" fill="#09101d" stroke="#00e5ff" stroke-width="1.4"/>
      <g fill="none" stroke="#00e5ff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="0" cy="0" r="2.6"/>
        <path d="M0 -5.4V-4.1 M0 4.1V5.4 M-5.4 0H-4.1 M4.1 0H5.4 M-3.8 -3.8L-2.9 -2.9 M2.9 2.9L3.8 3.8 M3.8 -3.8L2.9 -2.9 M-2.9 2.9L-3.8 3.8"/>
      </g>
    </g>` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 40 40">
    <defs>
      <linearGradient id="shell" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#f0f6ff"/>
        <stop offset="55%" stop-color="#bfd2ea"/>
        <stop offset="100%" stop-color="#7c95b6"/>
      </linearGradient>
      <linearGradient id="visor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#050914"/>
        <stop offset="100%" stop-color="#0d192e"/>
      </linearGradient>
      <linearGradient id="eye" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#72fff6"/>
        <stop offset="50%" stop-color="#00e5ff"/>
        <stop offset="100%" stop-color="#00b8d4"/>
      </linearGradient>
      <filter id="glow" filterUnits="userSpaceOnUse" x="0" y="0" width="40" height="40">
        <feGaussianBlur stdDeviation="${small ? 0.55 : 0.95}" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <!-- Outer dark halo so the icon pops on both light and dark Windows taskbars -->
    <g>
      <!-- Cyber antenna -->
      <path d="M20 9.5V4.8" stroke="#0c1526" stroke-width="${strokeW + 1.8}" stroke-linecap="round"/>
      <path d="M20 9.5V4.8" stroke="#8aa4c4" stroke-width="${strokeW}" stroke-linecap="round"/>
      <circle cx="20" cy="4.2" r="${small ? 2.8 : 2.4}" fill="#00e5ff" stroke="#0c1526" stroke-width="1.1" filter="url(#glow)"/>
      <circle cx="19.3" cy="3.6" r="0.8" fill="#ffffff" opacity="0.9"/>

      <!-- Side cyber ear-pods -->
      <rect x="2.5" y="17.5" width="4" height="10" rx="2" fill="url(#shell)" stroke="#0c1526" stroke-width="${strokeW}"/>
      <rect x="33.5" y="17.5" width="4" height="10" rx="2" fill="url(#shell)" stroke="#0c1526" stroke-width="${strokeW}"/>
      <rect x="3.7" y="19.5" width="1.4" height="6" rx="0.7" fill="#00e5ff"/>
      <rect x="34.9" y="19.5" width="1.4" height="6" rx="0.7" fill="#00e5ff"/>

      <!-- Futuristic Grokbot rounded-squircle head chassis -->
      <rect x="5.2" y="9" width="29.6" height="25.5" rx="11.5" fill="url(#shell)" stroke="#0c1526" stroke-width="${strokeW}"/>
      ${small ? '' : `<path d="M12 11.2H28" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" opacity="0.65"/>`}

      <!-- Deep curved OLED visor screen -->
      <rect x="8.2" y="13.8" width="23.6" height="15.8" rx="7.2" fill="url(#visor)" stroke="#1b3254" stroke-width="1"/>
      ${small ? '' : `<path d="M11.5 15.6H22.5" stroke="#8be9ff" stroke-width="1.1" stroke-linecap="round" opacity="0.25"/>`}

      <!-- Expressive esplink-mcp-robot OLED visor eyes (rounded rectangles with cyber glow) -->
      <g filter="url(#glow)">
        <rect x="11.8" y="17.8" width="${small ? 6.2 : 5.8}" height="${small ? 7.8 : 7.4}" rx="${eyeRx}" fill="url(#eye)"/>
        <rect x="22.0" y="17.8" width="${small ? 6.2 : 5.8}" height="${small ? 7.8 : 7.4}" rx="${eyeRx}" fill="url(#eye)"/>
      </g>
      <!-- Specular cyber eye glint -->
      <rect x="13.0" y="19.0" width="1.8" height="1.8" rx="0.6" fill="#ffffff" opacity="0.92"/>
      <rect x="23.2" y="19.0" width="1.8" height="1.8" rx="0.6" fill="#ffffff" opacity="0.92"/>
    </g>
    ${gearOverlay}
  </svg>`;
}

const render = `(${function render(markup, size) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => { const cv = document.createElement('canvas'); cv.width = cv.height = size; cv.getContext('2d').drawImage(img, 0, 0, size, size); resolve(cv.toDataURL('image/png').split(',')[1]); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
  });
}})`;

function buildIco(pngMap, sizes) {
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(sizes.length, 4);
  let offset = head.length;
  const bodies = [];
  sizes.forEach((s, i) => {
    const b = pngMap[s], e = 6 + i * 16;
    head.writeUInt8(s >= 256 ? 0 : s, e);
    head.writeUInt8(s >= 256 ? 0 : s, e + 1);
    head.writeUInt8(0, e + 2);
    head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(b.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += b.length;
    bodies.push(b);
  });
  return Buffer.concat([head, ...bodies]);
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,<body></body>');
  const pngs = {};
  for (const s of SIZES) {
    pngs[s] = Buffer.from(await win.webContents.executeJavaScript(`${render}(${JSON.stringify(svg(s, false))}, ${s})`), 'base64');
    fs.writeFileSync(path.join(OUT, `icon-${s}.png`), pngs[s]);
  }
  fs.copyFileSync(path.join(OUT, 'icon-512.png'), path.join(OUT, 'icon.png'));
  fs.copyFileSync(path.join(OUT, 'icon-16.png'), path.join(OUT, 'tray.png'));
  fs.copyFileSync(path.join(OUT, 'icon-32.png'), path.join(OUT, 'tray@2x.png'));
  const icoSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
  fs.writeFileSync(path.join(OUT, 'icon.ico'), buildIco(pngs, icoSizes));

  // Settings app icons (with cyber gear badge)
  const settingsPngs = {};
  for (const s of [16, 24, 32, 48, 64, 128, 256]) {
    settingsPngs[s] = Buffer.from(await win.webContents.executeJavaScript(`${render}(${JSON.stringify(svg(s, true))}, ${s})`), 'base64');
  }
  fs.writeFileSync(path.join(OUT, 'settings-icon-64.png'), settingsPngs[64]);
  fs.writeFileSync(path.join(OUT, 'settings-icon.png'), settingsPngs[256]);
  fs.writeFileSync(path.join(OUT, 'settings-icon.ico'), buildIco(settingsPngs, [16, 24, 32, 48, 64, 128, 256]));

  console.log('icons ok', SIZES.join(','));
  app.exit(0);
});
