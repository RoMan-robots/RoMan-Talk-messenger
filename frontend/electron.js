import { app, BrowserWindow } from 'electron';

function createWindow() {
  let mainWindow = new BrowserWindow({
    width: 800,
    height: 600, 
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: true,
      sandbox: false
    }
  });
  mainWindow.loadURL('https://roman-talk.onrender.com');
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