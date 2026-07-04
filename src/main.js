// Lumos Search — main process
// Read-only by design on user files: the only actions ever performed on
// files/folders are shell.openPath (open with default app) and
// shell.showItemInFolder (navigate). No fs.write/rename/delete APIs touch
// user files anywhere. The app *does* now persist its own local app-data
// (config, usage stats, optional clipboard history, icon cache) in userData
// — never in user files, always local, and clipboard capture can be fully
// disabled from Settings or the tray menu.

const {
  app, BrowserWindow, globalShortcut, ipcMain, shell, clipboard,
  Tray, Menu, nativeImage, screen, dialog
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Worker } = require('worker_threads');
const { loadConfig, getConfig, updateConfig } = require('./config');
const { loadFrecency, recordLaunch, resetFrecency, frecencyBoost, flushFrecency } = require('./frecency');
const { startClipboardWatch, applyRetentionChange } = require('./providers/clipboard');
const { getIcon } = require('./icons');
const { createSettingsWindow } = require('./settings-window');
const PROVIDERS = require('./providers');

const WINDOW_W = 720;
const WINDOW_H = 500;
const APP_ICON = path.join(__dirname, '..', 'public', 'icon.ico');
const TEXT_PREVIEW_EXTS = new Set(['.txt', '.md', '.json', '.log', '.csv', '.js', '.ts', '.py', '.yml', '.yaml', '.xml', '.ini', '.cfg', '.conf']);

let win = null;
let tray = null;
let indexerWorker = null;
let config = null;
// double-space detection removed to avoid capturing normal spacebar events

// ---------------------------------------------------------------------------
// In-memory index (parallel arrays keep memory low for millions of entries)
// flags: 1 = directory, 2 = application shortcut (Start Menu or Desktop), 0 = file
// ---------------------------------------------------------------------------
const idx = {
  paths: [],       // full path
  names: [],       // lowercase basename (precomputed for fast search)
  flags: [],
  count: 0,
  status: 'starting', // starting | indexing | ready
};

function addEntries(items) {
  for (let i = 0; i < items.length; i++) {
    const [p, f] = items[i];
    idx.paths.push(p);
    const base = p.slice(Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/')) + 1);
    idx.names.push((f === 2 ? base.replace(/\.(lnk|url|appref-ms)$/i, '') : base).toLowerCase());
    idx.flags.push(f);
  }
  idx.count = idx.paths.length;
}

function resetIndex() {
  idx.paths = []; idx.names = []; idx.flags = []; idx.count = 0;
}

// ---------------------------------------------------------------------------
// Search orchestrator — runs each provider (see src/providers/), merges,
// sorts by score, dedupes by id, and caps at config.maxResults.
// ---------------------------------------------------------------------------
function search(query) {
  const q = String(query || '').trim();
  if (q.length < 1) return { results: [], status: idx.status, indexed: idx.count };
  const ctx = { q, qLower: q.toLowerCase(), idx, config, frecencyBoost };

  let all = [];
  for (const provider of PROVIDERS) {
    try { all = all.concat(provider.search(ctx) || []); } catch (e) { console.error('provider error:', e); }
  }
  all.sort((a, b) => b.score - a.score);

  const results = [];
  const seen = new Set();
  const max = config.maxResults;
  for (let k = 0; k < all.length && results.length < max; k++) {
    const r = all[k];
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    results.push(r);
  }
  return { results, status: idx.status, indexed: idx.count, matches: all.length };
}

// ---------------------------------------------------------------------------
// Index cache (fast startup) — stored in app's own userData, never in user files
// ---------------------------------------------------------------------------
const cacheFile = () => path.join(app.getPath('userData'), 'index-cache.txt');

function loadCache() {
  try {
    const raw = fs.readFileSync(cacheFile(), 'utf8');
    const lines = raw.split('\n');
    const items = [];
    for (const line of lines) {
      if (line.length < 3) continue;
      items.push([line.slice(2), Number(line[0]) || 0]);
    }
    if (items.length) {
      addEntries(items);
      idx.status = 'ready';
      pushStatus();
    }
  } catch { /* no cache yet */ }
}

function saveCache() {
  try {
    const chunks = [];
    for (let i = 0; i < idx.count; i++) chunks.push(idx.flags[i] + '\t' + idx.paths[i]);
    fs.writeFileSync(cacheFile(), chunks.join('\n'), 'utf8');
  } catch { /* non-fatal */ }
}

// ---------------------------------------------------------------------------
// Indexer worker
// ---------------------------------------------------------------------------
function startIndexing() {
  if (indexerWorker) return;
  idx.status = idx.count ? 'ready' : 'indexing';
  indexerWorker = new Worker(path.join(__dirname, 'indexer.js'), {
    workerData: { roots: config.indexedRoots, excludedDirs: config.excludedDirs },
  });
  let freshItems = [];

  indexerWorker.on('message', (msg) => {
    if (msg.type === 'batch') {
      freshItems.push(...msg.items);
      if (idx.count === 0) { // first ever run: stream results in live
        addEntries(msg.items);
        idx.status = 'indexing';
      }
      pushStatus(freshItems.length);
    } else if (msg.type === 'done') {
      // Atomically swap in the fresh index
      resetIndex();
      addEntries(freshItems);
      freshItems = [];
      idx.status = 'ready';
      pushStatus();
      saveCache();
      indexerWorker = null;
    } else if (msg.type === 'error') {
      console.error('indexer:', msg.error);
    }
  });
  indexerWorker.on('error', (e) => { console.error(e); indexerWorker = null; idx.status = 'ready'; });
}

function pushStatus(scanned) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('index-status', {
      status: idx.status,
      indexed: idx.count,
      scanned: scanned || idx.count,
    });
  }
}

// ---------------------------------------------------------------------------
// Window / tray
// ---------------------------------------------------------------------------
function createWindow() {
  win = new BrowserWindow({
    width: WINDOW_W,
    height: WINDOW_H,
    icon: APP_ICON,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('blur', () => hideWindow());
  win.setAlwaysOnTop(true, 'screen-saver');
}

function positionWindow() {
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const x = Math.round(workArea.x + (workArea.width - WINDOW_W) / 2);
  const y = Math.round(workArea.y + workArea.height * 0.18);
  win.setPosition(x, y);
}

function showWindow() {
  positionWindow();
  win.show();
  win.focus();
  win.webContents.send('window-shown');
  pushStatus();
}

function hideWindow() {
  if (win && win.isVisible()) win.hide();
}

function toggleWindow() {
  if (win.isVisible()) hideWindow();
  else showWindow();
}

function makeTrayIcon() {
  return nativeImage.createFromPath(APP_ICON);
}

function createTray() {
  tray = new Tray(makeTrayIcon());
  refreshTray();
  tray.on('click', toggleWindow);
}

function refreshTray() {
  const hotkeyLabel = config.hotkeys.filter(Boolean).join(' / ') || '(unset)';
  tray.setToolTip('Lumos Search — ' + hotkeyLabel);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show search (' + hotkeyLabel + ')', click: showWindow },
    { label: 'Settings…', click: () => createSettingsWindow() },
    {
      label: 'Clipboard history enabled',
      type: 'checkbox',
      checked: config.clipboard.enabled,
      click: (item) => { config = updateConfig({ clipboard: { enabled: item.checked } }); refreshTray(); },
    },
    { label: 'Rebuild index', click: () => { if (!indexerWorker) startIndexing(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

// ---------------------------------------------------------------------------
// Hotkey (re-)registration — extracted so Settings can change it live
// ---------------------------------------------------------------------------
function registerHotkeys() {
  globalShortcut.unregisterAll();
  const hotkeys = config.hotkeys;
  const fallbacks = config.hotkeyFallbacks;
  for (let i = 0; i < hotkeys.length; i++) {
    try {
      if (!globalShortcut.register(hotkeys[i], toggleWindow)) {
        if (fallbacks[i]) globalShortcut.register(fallbacks[i], toggleWindow);
      }
    } catch (e) {
      try { if (fallbacks[i]) globalShortcut.register(fallbacks[i], toggleWindow); } catch (e2) { /* ignore */ }
    }
  }
}

// ---------------------------------------------------------------------------
// IPC — the renderer surface. The main search window's preload exposes only
// read/launch/navigate capabilities; config *writes* are reachable solely
// through the Settings window's separate preload (preload-settings.js).
// ---------------------------------------------------------------------------
const KNOWN_ACTIONS = new Set(['open', 'reveal', 'copy', 'paste', 'open-external']);

ipcMain.handle('search', (_e, q) => search(String(q || '').slice(0, 500)));

ipcMain.on('run-action', (_e, payload) => {
  if (!payload || typeof payload !== 'object') return;
  const { action, result } = payload;
  if (!KNOWN_ACTIONS.has(action) || !result || typeof result !== 'object') return;
  const data = result.data || {};

  if (action === 'open' && typeof data.path === 'string') {
    shell.openPath(data.path);
    recordLaunch(data.path);
    hideWindow();
  } else if (action === 'reveal' && typeof data.path === 'string') {
    shell.showItemInFolder(data.path);
    hideWindow();
  } else if (action === 'open-external' && typeof data.url === 'string' && /^https?:\/\//i.test(data.url)) {
    shell.openExternal(data.url);
    hideWindow();
  } else if (action === 'copy' && typeof data.text === 'string') {
    clipboard.writeText(data.text);
    hideWindow();
  } else if (action === 'paste' && typeof data.text === 'string') {
    clipboard.writeText(data.text);
    hideWindow();
  }
});

ipcMain.on('hide-window', () => hideWindow());
ipcMain.on('open-settings', () => createSettingsWindow());

ipcMain.handle('get-icon', (_e, payload) => {
  if (!payload || typeof payload.path !== 'string') return null;
  return getIcon(payload.path, payload.kind);
});

ipcMain.handle('preview-file', async (_e, p) => {
  if (typeof p !== 'string' || !p) return null;
  const ext = path.extname(p).toLowerCase();
  if (!TEXT_PREVIEW_EXTS.has(ext)) return null;
  try {
    const stat = await fs.promises.stat(p);
    if (stat.size > 2_000_000) return null; // skip huge files
    const text = await fs.promises.readFile(p, 'utf8');
    return text.slice(0, 2000);
  } catch {
    return null;
  }
});

// --- Settings-window-only IPC (write access to config lives only here) ----
ipcMain.handle('get-config', () => getConfig());
ipcMain.handle('update-config', (_e, patch) => {
  if (!patch || typeof patch !== 'object') return getConfig();
  const prev = config;
  config = updateConfig(patch);
  if (JSON.stringify(prev.hotkeys) !== JSON.stringify(config.hotkeys) ||
      JSON.stringify(prev.hotkeyFallbacks) !== JSON.stringify(config.hotkeyFallbacks)) {
    registerHotkeys();
  }
  if (JSON.stringify(prev.indexedRoots) !== JSON.stringify(config.indexedRoots) ||
      JSON.stringify(prev.excludedDirs) !== JSON.stringify(config.excludedDirs)) {
    if (!indexerWorker) startIndexing();
  }
  if (prev.clipboard.retainAcrossRestarts !== config.clipboard.retainAcrossRestarts) {
    applyRetentionChange(config);
  }
  refreshTray();
  return config;
});
ipcMain.handle('pick-folder', async () => {
  const res = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
});
ipcMain.on('reset-frecency', () => resetFrecency());
ipcMain.on('rebuild-index', () => { if (!indexerWorker) startIndexing(); });

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());

  app.whenReady().then(() => {
    config = loadConfig();
    loadFrecency();
    createWindow();
    createTray();
    loadCache();          // instant results from last run
    startIndexing();      // fresh crawl in the background
    startClipboardWatch(getConfig);

    // When installed (packaged), start automatically at Windows login
    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: true });
    }

    registerHotkeys();
  });

  app.on('window-all-closed', (e) => { /* keep running in tray */ });
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    flushFrecency();
  });
}
