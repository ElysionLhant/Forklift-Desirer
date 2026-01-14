import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // For simple usage. Ideally true with preload.
      webSecurity: false // Often helpful for local file loading issues in simple apps
    },
    autoHideMenuBar: true,
    // icon: path.join(__dirname, '../public/forklift_icon.png')
  });

  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '../dist/index.html')}`;

  if (process.env.ELECTRON_START_URL) {
      mainWindow.loadURL(startUrl);
      // Open the DevTools.
      mainWindow.webContents.openDevTools();
  } else {
      mainWindow.loadURL(startUrl);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
