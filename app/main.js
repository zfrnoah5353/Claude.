// Fenêtre PC de ReviseIA (Electron) : lance le serveur local et l'affiche.
const { app, BrowserWindow, shell, dialog, Menu } = require('electron');
const path = require('path');
const { startServer } = require('./server');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let win;
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    let port = 4777;
    try {
      await startServer({ dataDir: path.join(app.getPath('userData'), 'donnees'), port });
    } catch (err) {
      dialog.showErrorBox('ReviseIA', "Impossible de démarrer le serveur local (port 4777 déjà utilisé ?).\n\n" + err.message);
      app.quit();
      return;
    }
    win = new BrowserWindow({
      width: 1200, height: 820, minWidth: 380,
      title: 'ReviseIA',
      backgroundColor: '#0f1222',
      autoHideMenuBar: true,
      webPreferences: { contextIsolation: true, sandbox: true },
    });
    // Liens externes (console.anthropic.com...) dans le navigateur
    win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
    // Autorise le micro pour la dictée si dispo
    win.webContents.session.setPermissionRequestHandler((_wc, perm, cb) => cb(['media', 'microphone', 'clipboard-read'].includes(perm)));
    win.loadURL(`http://localhost:${port}/?app=pc`);
  });

  app.on('window-all-closed', () => app.quit());
}
