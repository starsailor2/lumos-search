const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, cb) {
  const listener = (_event, data) => cb(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('lumos', {
  search: (q) => ipcRenderer.invoke('search', q),
  runAction: (action, result) => ipcRenderer.invoke('run-action', { action, result }),
  hide: () => ipcRenderer.send('hide-window'),
  getIcon: (p, kind) => ipcRenderer.invoke('get-icon', { path: p, kind }),
  previewFile: (p) => ipcRenderer.invoke('preview-file', p),
  getMeta: (p) => ipcRenderer.invoke('get-meta', p),
  openSettings: () => ipcRenderer.send('open-settings'),
  getAppearance: () => ipcRenderer.invoke('get-appearance'),
  getRecentIntents: () => ipcRenderer.invoke('get-recent-intents'),
  resizeLauncher: (height, animate) => ipcRenderer.send('resize-launcher', { height, animate }),
  onStatus: (cb) => subscribe('index-status', cb),
  onShown: (cb) => subscribe('window-shown', cb),
  onAppearance: (cb) => subscribe('appearance-changed', cb),
  onSetQuery: (cb) => subscribe('set-query', cb),
  onAiResponse: (cb) => subscribe('ai-response', cb),
});
