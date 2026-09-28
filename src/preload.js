const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lumos', {
  search: (q) => ipcRenderer.invoke('search', q),
  runAction: (action, result) => ipcRenderer.send('run-action', { action, result }),
  hide: () => ipcRenderer.send('hide-window'),
  getIcon: (p, kind) => ipcRenderer.invoke('get-icon', { path: p, kind }),
  previewFile: (p) => ipcRenderer.invoke('preview-file', p),
  getMeta: (p) => ipcRenderer.invoke('get-meta', p),
  openSettings: () => ipcRenderer.send('open-settings'),
  getAppearance: () => ipcRenderer.invoke('get-appearance'),
  getRecentIntents: () => ipcRenderer.invoke('get-recent-intents'),
  setExpanded: (exp) => ipcRenderer.send('set-expanded', exp),
  onStatus: (cb) => ipcRenderer.on('index-status', (_e, s) => cb(s)),
  onShown: (cb) => ipcRenderer.on('window-shown', (_e, d) => cb(d)),
  onSetQuery: (cb) => ipcRenderer.on('set-query', (_e, q) => cb(q)),
  onAiResponse: (cb) => ipcRenderer.on('ai-response', (_e, d) => cb(d)),
});
