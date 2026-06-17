const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      nodeIntegration: true
    }
  });

  // Load the index.html of the app
  mainWindow.loadFile('index.html');

  // Remove the menu bar for a cleaner look
  mainWindow.setMenuBarVisibility(false);
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
