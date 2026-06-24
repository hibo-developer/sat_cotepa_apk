const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const isDev = !app.isPackaged;
const logPath = path.join(app.getPath('userData'), 'desktop.log');

function logLinea(...partes) {
  try {
    const texto = partes
      .map((p) => {
        if (p instanceof Error) return p.stack || p.message;
        if (typeof p === 'string') return p;
        return JSON.stringify(p);
      })
      .join(' ');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${texto}\n`);
  } catch {}
}

process.on('uncaughtException', (err) => logLinea('uncaughtException', err));
process.on('unhandledRejection', (err) => logLinea('unhandledRejection', err));

function resolveWindowIconPath() {
  const candidates = [
    path.join(__dirname, 'assets', 'app-icon.ico'),
    path.join(process.resourcesPath, 'app.asar', 'electron', 'assets', 'app-icon.ico'),
    path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'assets', 'app-icon.ico'),
  ];

  return candidates.find((iconPath) => fs.existsSync(iconPath));
}

function createWindow() {
  const iconPath = resolveWindowIconPath();
  logLinea('createWindow', { isDev, resourcesPath: process.resourcesPath, __dirname, iconPath });
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 980,
    minHeight: 680,
    autoHideMenuBar: true,
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.on('did-fail-load', (_ev, code, desc, url) => {
    logLinea('did-fail-load', { code, desc, url });
  });

  win.webContents.on('render-process-gone', (_ev, details) => {
    logLinea('render-process-gone', details);
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
  logLinea('loadFile', { indexPath, exists: fs.existsSync(indexPath) });
  win.loadFile(indexPath);
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.cotepa.sat.desktop');
  logLinea('app-ready', { version: app.getVersion(), electron: process.versions.electron });

  try {
    const { session } = require('electron');

    // Aplicar CSP y cabeceras de seguridad para el build de escritorio
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://*.supabase.co https://api.pwnedpasswords.com; font-src 'self' data:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none';",
          ],
          'X-Content-Type-Options': ['nosniff'],
          'X-Frame-Options': ['DENY'],
          'Referrer-Policy': ['strict-origin-when-cross-origin'],
        },
      });
    });

    session.defaultSession
      .clearStorageData({ storages: ['serviceworkers', 'cachestorage'] })
      .catch((err) => logLinea('clearStorageData-error', err));
  } catch (err) {
    logLinea('clearStorageData-throw', err);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
