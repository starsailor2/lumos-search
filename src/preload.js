// Lumos Search — preload
// The renderer gets exactly four capabilities: search, open, reveal, hide.
// Nothing else from Node/Electron is exposed — no write access of any kind.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lumos', {
  search: (q) => ipcRenderer.invoke('search', q),
  open: (p) => ipcRenderer.send('open-item', p),
  reveal: (p) => ipcRenderer.send('reveal-item', p),
  hide: () => ipcRenderer.send('hide-window'),
  onStatus: (cb) => ipcRenderer.on('index-status', (_e, s) => cb(s)),
  onShown: (cb) => ipcRenderer.on('window-shown', () => cb()),
});
