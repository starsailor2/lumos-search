// Lumos Search — preload
// The renderer gets exactly four capabilities: search, open, reveal, hide.
// Nothing else from Node/Electron is exposed — no write access of any kind.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lumos', {
  search: (q) => ipcRenderer.invoke('search', q),
  runAction: (action, result) => ipcRenderer.send('run-action', { action, result }),
  hide: () => ipcRenderer.send('hide-window'),
  getIcon: (p, kind) => ipcRenderer.invoke('get-icon', { path: p, kind }),
  previewFile: (p) => ipcRenderer.invoke('preview-file', p),
  openSettings: () => ipcRenderer.send('open-settings'),
  onStatus: (cb) => ipcRenderer.on('index-status', (_e, s) => cb(s)),
  onShown: (cb) => ipcRenderer.on('window-shown', () => cb()),
});
