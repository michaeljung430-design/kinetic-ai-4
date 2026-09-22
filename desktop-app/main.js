const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const { startLocalServer } = require('./local-server');

let serverInfo;

function createWindow() {
  const window = new BrowserWindow({
    width: 900,
    height: 900,
    minWidth: 420,
    minHeight: 640,
    title: 'Motion Lab',
    backgroundColor: '#07151a',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.setMenuBarVisibility(false);
  // Load via localhost so the page is a secure context (camera/getUserMedia
  // requires that) while still telling the page its LAN address, via the
  // ?lan= param, so it can build a phone-reachable pairing link.
  window.loadURL(`http://localhost:${serverInfo.port}/movement-sensor-diagnostics.html?lan=${serverInfo.lan}`);
}

app.whenReady().then(async () => {
  // The camera station needs getUserMedia access; Electron denies media
  // requests by default unless a handler explicitly grants them.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media');
  });

  // Serves the app AND relays sensor-phone WebSocket traffic, bound to the
  // LAN address so a phone on the same WiFi can load the same page/relay
  // without any external hosting.
  serverInfo = await startLocalServer(path.join(__dirname, 'app'));
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
