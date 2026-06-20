const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  showOpenDialog: () => ipcRenderer.invoke('dialog:showOpenDialog'),
  showSaveDialog: (currentPath, defaultName) => ipcRenderer.invoke('dialog:showSaveDialog', currentPath, defaultName),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content)
});
