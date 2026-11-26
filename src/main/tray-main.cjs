delete process.env.ELECTRON_RUN_AS_NODE;
// LumaDock in the Windows tray (next to the clock): Robo's face, with a menu to open the island,
// start with Windows, restart and quit. The island itself has no taskbar button, so this is the
// place where you can always find and close LumaDock. Also: only one LumaDock runs at a time.
const { app, Tray, Menu, nativeImage, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const i18n = require('../shared/i18n.cjs');

let tray = null;

function island() {
  return BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && /mascot\.html/.test(w.webContents.getURL()));
}

function openIsland() {
  const win = island(); if (!win) return;
  if (app.lumadockEnsureVisible) app.lumadockEnsureVisible('tray');
  else {
    if (win.isMinimized()) win.restore();
    win.showInactive();
    win.setAlwaysOnTop(true, 'screen-saver');
    win.moveTop();
  }
  win.webContents.send('extras:shortcut', 'home');
}

// Start with Windows/macOS. During development LumaDock runs as "electron.exe <folder>", so pass those along.
function loginOptions() {
  if (app.isPackaged || process.platform === 'darwin') return {};
  return { path: process.execPath, args: [path.resolve(app.getAppPath())] };
}
function startsWithWindows() {
  try {
    const s = app.getLoginItemSettings(loginOptions());
    return Boolean(s.openAtLogin && s.executableWillLaunchAtLogin !== false);
  } catch { return false; }
}
function broadcastLogin() {
  const on = startsWithWindows();
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && /mascot\.html/.test(win.webContents.getURL())) {
      try { win.webContents.send('app:login-changed', on); } catch {}
    }
  }
}
function setStartsWithWindows(on) {
  try {
    app.setLoginItemSettings({ ...loginOptions(), openAtLogin: !!on });
  } catch {}
  buildMenu();
  broadcastLogin();
}

function quit() { app.quit(); } // main.js shows the goodbye first
function restart() { app.relaunch(); app.quit(); }

function buildMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: i18n.t('common.appName'), enabled: false },
    { type: 'separator' },
    { label: i18n.t('tray.openIsland'), accelerator: 'CommandOrControl+Alt+1', registerAccelerator: false, click: openIsland },
    { label: i18n.t('tray.bringToFront'), click: () => app.lumadockEnsureVisible?.('tray-front') },
    { label: i18n.t('tray.settings'), click: () => app.emit('lumadock-open-settings') },
    { label: i18n.t('tray.startWithWindows'), type: 'checkbox', checked: startsWithWindows(), click: item => setStartsWithWindows(item.checked) },
    { type: 'separator' },
    { label: i18n.t('tray.restart'), click: restart },
    { label: i18n.t('tray.quit'), click: quit }
  ]));
}

if (!app.requestSingleInstanceLock()) {
  app.exit(0);
} else {
  // Legacy Start menu settings entry starts LumaDock with --settings so only the settings window opens.
  app.on('second-instance', (event, argv) => { if ((argv || []).includes('--settings')) app.emit('lumadock-open-settings'); else openIsland(); });
  app.setName('LumaDock');
  if (process.platform === 'darwin' && app.dock) { try { app.dock.hide(); } catch {} }
  i18n.onLanguageChange(() => buildMenu());
  app.whenReady().then(() => {
    // Windows shows the name and icon of a notification from a Start menu shortcut with the same app id.
    // Without it, notifications said "Electron". Made (or fixed) on every start, it costs nothing.
    if (process.platform === 'win32') {
      try {
        const { shell } = require('electron');
        const programs = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
        const link = path.join(programs, 'LumaDock.lnk');
        // An old "Electron" shortcut with LumaDock's app id made every notification say "Electron". Only that one goes.
        const old = path.join(programs, 'Electron.lnk');
        try {
          const info = require('node:fs').existsSync(old) && shell.readShortcutLink(old);
          if (info && info.appUserModelId === 'com.lumadock.assistant' && path.resolve(info.target) === path.resolve(process.execPath)) require('node:fs').unlinkSync(old);
        } catch { }
        // Clean legacy shortcuts and registry keys
        try {
          ['LumaDock.lnk', 'LumaDock Instellingen.lnk'].forEach(f => {
            const legacy = path.join(programs, f);
            if (require('node:fs').existsSync(legacy)) require('node:fs').unlinkSync(legacy);
          });
        } catch { }
        shell.writeShortcutLink(link, require('node:fs').existsSync(link) ? 'replace' : 'create', {
          target: process.execPath,
          args: app.isPackaged ? '' : `"${app.getAppPath()}"`,
          cwd: app.isPackaged ? path.dirname(process.execPath) : app.getAppPath(),
          icon: path.join(path.resolve(__dirname, '..', '..'), 'assets', 'icon.ico'), iconIndex: 0,
          appUserModelId: 'com.lumadock.assistant',
          description: i18n.t('tray.appDescription')
        });
        // The second app: LumaDock Settings, with its own icon and app id (its own button on the taskbar).
        const settingsLink = path.join(programs, 'LumaDock Settings.lnk');
        shell.writeShortcutLink(settingsLink, require('node:fs').existsSync(settingsLink) ? 'replace' : 'create', {
          target: process.execPath,
          args: (app.isPackaged ? '' : `"${app.getAppPath()}" `) + '--settings',
          cwd: app.isPackaged ? path.dirname(process.execPath) : app.getAppPath(),
          icon: path.join(path.resolve(__dirname, '..', '..'), 'assets', 'settings-icon.ico'), iconIndex: 0,
          appUserModelId: 'com.lumadock.settings',
          description: i18n.t('tray.settingsDescription')
        });
      } catch { }
      // The shortcut alone was not enough: Windows also reads the name and icon of notifications from
      // HKCU\Software\Classes\AppUserModelId\<app id>. Only LumaDock's own key, in the user's own registry part.
      try {
        const ROOT = path.resolve(__dirname, '..', '..');
        const { execFile } = require('node:child_process');
        const key = 'HKCU\\Software\\Classes\\AppUserModelId\\com.lumadock.assistant';
        const set = (name, value) => execFile('reg.exe', ['add', key, '/v', name, '/t', 'REG_SZ', '/d', value, '/f'], { windowsHide: true }, () => { });
        set('DisplayName', 'LumaDock');
        set('IconUri', path.join(ROOT, 'assets', 'icon-256.png'));
        const key2 = 'HKCU\\Software\\Classes\\AppUserModelId\\com.lumadock.settings';
        execFile('reg.exe', ['add', key2, '/v', 'DisplayName', '/t', 'REG_SZ', '/d', 'LumaDock Settings', '/f'], { windowsHide: true }, () => { });
        execFile('reg.exe', ['add', key2, '/v', 'IconUri', '/t', 'REG_SZ', '/d', path.join(ROOT, 'assets', 'settings-icon.png'), '/f'], { windowsHide: true }, () => { });
      } catch { }
    }
    const rawImg = nativeImage.createFromPath(path.join(path.resolve(__dirname, '..', '..'), 'assets', process.platform === 'darwin' ? 'tray@2x.png' : 'tray.png'));
    const image = process.platform === 'darwin' ? rawImg.resize({ width: 18, height: 18 }) : rawImg;
    tray = new Tray(image);
    tray.setToolTip('LumaDock');
    tray.on('click', openIsland);
    buildMenu();
  });
  // the icon stays during the goodbye and goes when the app really stops
  app.on('will-quit', () => { try { tray?.destroy(); } catch { } tray = null; });

  // only the island itself may change these
  const fromIsland = e => /mascot\.html/.test(e.senderFrame?.url || '');
  ipcMain.handle('app:login-get', e => fromIsland(e) ? { ok: true, on: startsWithWindows() } : { ok: false });
  ipcMain.handle('app:login-set', (e, on) => { if (!fromIsland(e)) return { ok: false }; setStartsWithWindows(on); return { ok: true, on: startsWithWindows() }; });
  ipcMain.on('app:restart', e => { if (fromIsland(e)) restart(); });
}

module.exports = { openIsland };
