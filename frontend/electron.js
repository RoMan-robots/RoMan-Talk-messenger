import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow() {
  let mainWindow = new BrowserWindow({
    width: 800,
    height: 600, 
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: true,
      sandbox: false,
      devTools: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'html', 'index.html'));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const fileUrl = `file://${path.join(__dirname, 'html', 'index.html')}`;

    if (url === fileUrl || url === 'file:///' || url === '/') {
      event.preventDefault();
      mainWindow.loadFile(path.join(__dirname, 'html', 'index.html'));
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});