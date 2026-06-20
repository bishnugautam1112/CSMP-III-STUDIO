const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.setMenuBarVisibility(false);

  // Setup IPC handlers for file operations
  ipcMain.handle('dialog:showOpenDialog', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'CSMP Files', extensions: ['csmp', 'txt'] }]
    });
    if (!canceled && filePaths.length > 0) {
      const content = fs.readFileSync(filePaths[0], 'utf-8');
      return { path: filePaths[0], content, name: path.basename(filePaths[0]) };
    }
    return null;
  });

  ipcMain.handle('dialog:showSaveDialog', async (event, currentPath, defaultName) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: currentPath || defaultName || 'untitled.csmp',
      filters: [{ name: 'CSMP Files', extensions: ['csmp', 'txt'] }]
    });
    return canceled ? null : filePath;
  });

  ipcMain.handle('fs:writeFile', async (event, filePath, content) => {
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
