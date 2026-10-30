// Preload for the Settings window ONLY. This is the one place in the app
// with write access to configuration — the main always-on-top search
// window's preload (preload.js) stays read/launch-only, unchanged.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lumosSettings', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  openIconCredits: () => ipcRenderer.send('open-icon-credits'),
  openDataFolder: () => ipcRenderer.invoke('open-data-folder'),
  updateConfig: (patch) => ipcRenderer.invoke('update-config', patch),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  resetFrecency: () => ipcRenderer.send('reset-frecency'),
  rebuildIndex: () => ipcRenderer.send('rebuild-index'),
  refreshIndex: () => ipcRenderer.send('refresh-index'),
  getIndexStatus: () => ipcRenderer.invoke('get-index-status'),
  onStatus: (cb) => {
    const listener = (_event, status) => cb(status);
    ipcRenderer.on('index-status', listener);
    return () => ipcRenderer.removeListener('index-status', listener);
  },
  onSection: (cb) => {
    const listener = (_event, section) => cb(section);
    ipcRenderer.on('settings-section', listener);
    return () => ipcRenderer.removeListener('settings-section', listener);
  },
  clearClipboard: () => ipcRenderer.send('clear-clipboard'),
});
