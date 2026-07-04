// Preload for the Settings window ONLY. This is the one place in the app
// with write access to configuration — the main always-on-top search
// window's preload (preload.js) stays read/launch-only, unchanged.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lumosSettings', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  updateConfig: (patch) => ipcRenderer.invoke('update-config', patch),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  resetFrecency: () => ipcRenderer.send('reset-frecency'),
  rebuildIndex: () => ipcRenderer.send('rebuild-index'),
});
