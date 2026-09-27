// Lumos Search — main process

const {
  app, BrowserWindow, globalShortcut, ipcMain, shell, clipboard,
  Tray, Menu, nativeImage, screen, dialog, systemPreferences, powerMonitor
} = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { Worker } = require('worker_threads');
const { loadConfig, getConfig, updateConfig } = require('./config');
const { loadFrecency, recordLaunch, resetFrecency, frecencyBoost, flushFrecency } = require('./frecency');
const { startClipboardWatch, applyRetentionChange, clearHistory } = require('./providers/clipboard');
const { getIcon } = require('./icons');
const { createSettingsWindow } = require('./settings-window');
const { captureForeground, restoreAndPaste } = require('./paste');
const { buildSearchIndex } = require('./search-index');
const { parseScope, loadProviders } = require('./scope');
const { loadExtensions, getExtensionProviders, listExtensions, extensionsDir } = require('./extensions');
const { runSystemCommand } = require('./providers/system');
const { focusWindow, snapWindow } = require('./providers/windows');
const { killProcess } = require('./providers/process');
const { chatCompletion } = require('./providers/ai');
const PROVIDERS = require('./providers');

const WINDOW_W = 780;
const WINDOW_H = 560;
const APP_ICON = path.join(__dirname, '..', 'public', 'icon.ico');
const TEXT_PREVIEW_EXTS = new Set(['.txt', '.md', '.json', '.log', '.csv', '.js', '.ts', '.py', '.yml', '.yaml', '.xml', '.ini', '.cfg', '.conf']);

let win = null;
let tray = null;
let indexerWorker = null;
let config = null;
let rebuildPending = false;
let searchIndex = null;
let lastIndexUpdate = Date.now();

const idx = {
  paths: [],
  names: [],
  flags: [],
  bigrams: new Map(),
  count: 0,
  status: 'starting',
};

function addEntryBigrams(map, name, i) {
  if (!name || name.length < 2) return;
  const seen = new Set();
  for (let j = 0; j < name.length - 1; j++) {
    const bg = name.slice(j, j + 2);
    if (!seen.has(bg)) {
      seen.add(bg);
      let list = map.get(bg);
      if (!list) {
        list = [];
        map.set(bg, list);
      }
      list.push(i);
    }
  }
}

function addEntries(items) {
  const start = idx.paths.length;
  for (let i = 0; i < items.length; i++) {
    const [p, f] = items[i];
    idx.paths.push(p);
    const base = p.slice(Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/')) + 1);
    const n = (f === 2 ? base.replace(/\.(lnk|url|appref-ms)$/i, '') : base).toLowerCase();
    idx.names.push(n);
    idx.flags.push(f);
    addEntryBigrams(idx.bigrams, n, start + i);
  }
  idx.count = idx.paths.length;
}

function rebuildBigrams() {
  const map = new Map();
  for (let i = 0; i < idx.count; i++) {
    addEntryBigrams(map, idx.names[i], i);
  }
  idx.bigrams = map;
}

function resetIndex() {
  idx.paths = [];
  idx.names = [];
  idx.flags = [];
  idx.bigrams = new Map();
  idx.count = 0;
}

function rebuildSearchIndex() {
  try {
    searchIndex = buildSearchIndex(idx);
  } catch (e) {
    console.error('search index build failed:', e);
    searchIndex = null;
  }
}

function search(query) {
  const raw = String(query || '').trim();
  const scoped = parseScope(raw);
  const q = scoped.q;
  const isEmpty = q.length < 1 && !scoped.scope;

  if (!isEmpty && q.length < 1 && scoped.scope) {
    // Scoped browse mode (@clip, @emoji, etc.)
  } else if (!isEmpty && q.length < 1) {
    return { results: [], status: idx.status, indexed: idx.count };
  }

  const ctx = {
    q,
    qLower: q.toLowerCase(),
    idx,
    config,
    frecencyBoost,
    searchIndex,
    scope: scoped.scope,
    isEmpty: isEmpty || (scoped.scope && !q),
  };

  let providers = scoped.providers ? loadProviders(scoped.providers) : PROVIDERS;
  const extProviders = getExtensionProviders();
  providers = providers.concat(extProviders);

  let all = [];
  for (const provider of providers) {
    try { all = all.concat(provider.search(ctx) || []); } catch (e) { console.error('provider error:', e); }
  }
  all.sort((a, b) => b.score - a.score);

  const results = [];
  const seen = new Set();
  const seenAppTitles = new Set();
  const max = config.maxResults;
  for (let k = 0; k < all.length && results.length < max; k++) {
    const r = all[k];
    if (seen.has(r.id)) continue;
    if (r.type === 'app') {
      const normTitle = (r.title || '').toLowerCase().trim();
      if (seenAppTitles.has(normTitle)) continue;
      seenAppTitles.add(normTitle);
    }
    seen.add(r.id);
    results.push(r);
  }
  return { results, status: idx.status, indexed: idx.count, matches: all.length, lastIndexUpdate };
}

const cacheFile = () => path.join(app.getPath('userData'), 'index-cache.txt');

function loadCache() {
  try {
    const raw = fs.readFileSync(cacheFile(), 'utf8');
    const lines = raw.split('\n');
    const items = [];
    for (const line of lines) {
      if (line.length < 3) continue;
      const tabIdx = line.indexOf('\t');
      if (tabIdx < 0) continue;
      const flagStr = line.slice(0, tabIdx);
      const filePath = line.slice(tabIdx + 1);
      items.push([filePath, Number(flagStr) || 0]);
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
// Drive detection: wmic / PowerShell with fallback to A-Z existsSync scan.
// Runs only once per full crawl start.
// ---------------------------------------------------------------------------
function detectDrives() {
  if (process.platform !== 'win32') return null;
  try {
    const stdout = execSync('powershell -NoProfile -Command "(Get-CimInstance Win32_LogicalDisk).DeviceID"', {
      encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore']
    });
    const matches = stdout.match(/[A-Z]:/gi);
    if (matches && matches.length) {
      return [...new Set(matches.map((d) => d.toUpperCase() + '\\'))];
    }
  } catch { /* try wmic fallback */ }

  try {
    const stdout = execSync('wmic logicaldisk get name', {
      encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore']
    });
    const matches = stdout.match(/[A-Z]:/gi);
    if (matches && matches.length) {
      return [...new Set(matches.map((d) => d.toUpperCase() + '\\'))];
    }
  } catch { /* fallback to indexer's default A-Z scan */ }

  return null;
}

// ---------------------------------------------------------------------------
// Indexer worker. mode 'full' rebuilds everything; mode 'hot' re-crawls only
// the given roots and merges the result into the live index.
// ---------------------------------------------------------------------------
let lastFullCrawl = 0;
let lastHotCrawl = 0;

function startIndexing() { spawnIndexer({ mode: 'full' }); }

function spawnIndexer(opts) {
  if (indexerWorker) return; // one crawl at a time; the scheduler retries later
  const mode = opts.mode === 'hot' ? 'hot' : 'full';
  if (mode === 'full') {
    lastFullCrawl = Date.now();
    lastHotCrawl = Date.now(); // a full crawl covers the hot roots too
    idx.status = idx.count ? 'ready' : 'indexing';
  }
  const drives = mode === 'full' ? detectDrives() : null;
  indexerWorker = new Worker(path.join(__dirname, 'indexer.js'), {
    workerData: {
      roots: mode === 'hot' ? opts.roots : config.indexedRoots,
      excludedDirs: config.excludedDirs,
      skipDirs: config.skipDirs,
      drives,
      mode,
    },
  });
  let freshItems = [];

  indexerWorker.on('message', (msg) => {
    if (msg.type === 'batch') {
      freshItems.push(...msg.items);
      if (mode === 'full' && idx.count === 0) { // first ever run: stream results live
        addEntries(msg.items);
        idx.status = 'indexing';
      }
      if (mode === 'full') pushStatus(freshItems.length);
    } else if (msg.type === 'done') {
      lastIndexUpdate = Date.now();
      if (mode === 'full') {
        resetIndex();
        addEntries(freshItems);
        idx.status = 'ready';
        pushStatus();
      } else {
        // Hot refresh: swap out only the entries under the refreshed roots
        removeIndexedRoots(opts.roots);
        addEntries(freshItems);
      }
      freshItems = [];
      saveCache();
      indexerWorker = null;
      if (rebuildPending) {
        rebuildPending = false;
        startIndexing();
      }
    } else if (msg.type === 'error') {
      console.error('indexer:', msg.error);
    }
  });
  indexerWorker.on('error', (e) => {
    console.error(e);
    indexerWorker = null;
    idx.status = 'ready';
    if (rebuildPending) {
      rebuildPending = false;
      startIndexing();
    }
  });
}

// ---------------------------------------------------------------------------
// Keeping the index fresh without a full re-crawl every time:
//   - hot refresh: re-scan Desktop/Documents/Downloads/… every few minutes so
//     newly saved files show up quickly without a manual rebuild
//   - full refresh: once an hour, but only when the PC has been idle 5+ min
// ---------------------------------------------------------------------------
const HOT_FOLDERS = ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Videos', 'Music'];

function hotRoots() {
  if (Array.isArray(config.indexedRoots) && config.indexedRoots.length) {
    return config.indexedRoots.slice(0, 12);
  }
  const home = os.homedir();
  const roots = [];
  for (const f of HOT_FOLDERS) {
    const p = path.join(home, f);
    try { if (fs.statSync(p).isDirectory()) roots.push(p); } catch { /* not present */ }
  }
  return roots;
}

// Drop every indexed entry whose path lies under one of `roots`.
function removeIndexedRoots(roots) {
  if (!roots || !roots.length) return;
  const norm = roots.map((r) => r.toLowerCase().replace(/[\\/]+$/, ''));
  const paths = [], names = [], flags = [];
  for (let i = 0; i < idx.count; i++) {
    const p = idx.paths[i];
    const lower = p.toLowerCase();
    let under = false;
    for (let r = 0; r < norm.length; r++) {
      if (lower === norm[r] || lower.startsWith(norm[r] + '\\') || lower.startsWith(norm[r] + '/')) {
        under = true;
        break;
      }
    }
    if (under) continue;
    paths.push(p);
    names.push(idx.names[i]);
    flags.push(idx.flags[i]);
  }
  idx.paths = paths;
  idx.names = names;
  idx.flags = flags;
  idx.count = paths.length;
  rebuildBigrams();
}

function startRefreshSchedule() {
  setInterval(() => {
    if (indexerWorker) return;
    const now = Date.now();
    const hotMinutes = (config && config.refresh && config.refresh.hotMinutes) || 5;
    const fullHours = (config && config.refresh && config.refresh.fullHours) || 1;
    const hotIntervalMs = hotMinutes * 60 * 1000;
    const fullIntervalMs = fullHours * 60 * 60 * 1000;

    if (now - lastFullCrawl >= fullIntervalMs) {
      let idle = 0;
      try { idle = powerMonitor.getSystemIdleTime(); } catch { /* best effort */ }
      if (idle >= 300) { // 5 minutes idle
        startIndexing();
        return;
      }
    }
    if (now - lastHotCrawl >= hotIntervalMs) {
      const roots = hotRoots();
      if (roots.length) {
        lastHotCrawl = now;
        spawnIndexer({ mode: 'hot', roots });
      }
    }
  }, 60 * 1000); // tick every minute
}

function bootstrapExtensions() {
  const dest = extensionsDir();
  const sample = path.join(__dirname, '..', 'extensions', 'sample-lorem');
  const target = path.join(dest, 'sample-lorem');
  try {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    if (fs.existsSync(sample) && !fs.existsSync(target)) {
      fs.cpSync(sample, target, { recursive: true });
      loadExtensions();
    }
  } catch { /* non-fatal */ }
}

function pushStatus(scanned) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('index-status', {
      status: idx.status,
      indexed: idx.count,
      scanned: scanned || idx.count,
      lastIndexUpdate,
    });
  }
}

function createWindow() {
  const winOpts = {
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
  };
  if (process.platform === 'win32') {
    winOpts.backgroundMaterial = 'acrylic';
    winOpts.roundedCorners = true;
  }
  win = new BrowserWindow(winOpts);

  const isDev = process.env.ELECTRON_RENDERER_URL;
  if (isDev) {
    win.loadURL(isDev);
  } else {
    const builtPath = path.join(__dirname, '..', 'dist', 'renderer', 'launcher', 'index.html');
    if (fs.existsSync(builtPath)) {
      win.loadFile(builtPath);
    } else {
      win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    }
  }
  win.on('blur', () => hideWindow());
  win.setAlwaysOnTop(true, 'screen-saver');
}

function positionWindow() {
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const x = Math.round(workArea.x + (workArea.width - WINDOW_W) / 2);
  const y = Math.round(workArea.y + workArea.height * 0.16);
  win.setPosition(x, y);
}

function showWindow() {
  captureForeground();
  positionWindow();
  win.show();
  win.focus();
  win.webContents.send('window-shown', { appearance: config.appearance });
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
  tray.on('click', showWindow);
  tray.on('double-click', showWindow);
}

function refreshTray(registeredHotkeys) {
  const active = registeredHotkeys || config.hotkeys.filter(Boolean);
  const hotkeyLabel = active.length ? active.join(' / ') : '(click tray icon to open)';
  tray.setToolTip('Lumos Search v' + require('../package.json').version + ' — ' + hotkeyLabel);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show search (' + hotkeyLabel + ')', click: showWindow },
    { label: 'Settings…', click: () => createSettingsWindow() },
    {
      label: 'Clipboard history enabled',
      type: 'checkbox',
      checked: config.clipboard.enabled,
      click: (item) => { config = updateConfig({ clipboard: { enabled: item.checked } }); refreshTray(); },
    },
    { label: 'Rebuild index', click: () => startIndexing() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

function registerHotkeys() {
  globalShortcut.unregisterAll();
  const hotkeys = config.hotkeys;
  const fallbacks = config.hotkeyFallbacks;
  const registered = [];
  for (let i = 0; i < hotkeys.length; i++) {
    try {
      if (globalShortcut.register(hotkeys[i], toggleWindow)) {
        registered.push(hotkeys[i]);
      } else if (fallbacks[i] && globalShortcut.register(fallbacks[i], toggleWindow)) {
        registered.push(fallbacks[i]);
      }
    } catch (e) {
      try { if (fallbacks[i] && globalShortcut.register(fallbacks[i], toggleWindow)) registered.push(fallbacks[i]); } catch (e2) { /* ignore */ }
    }
  }
  // Guaranteed extra fallbacks so the launcher is never inaccessible
  const extraFallbacks = ['CommandOrControl+Space', 'F14'];
  for (const key of extraFallbacks) {
    if (!registered.length) {
      try { if (globalShortcut.register(key, toggleWindow)) registered.push(key); } catch { /* ignore */ }
    }
  }
  console.log('[lumos] registered hotkeys:', registered.join(', ') || 'NONE — use tray click to open');
  if (tray) refreshTray(registered);
}

const KNOWN_ACTIONS = new Set([
  'open', 'reveal', 'copy', 'paste', 'open-external',
  'open-settings', 'rebuild-index', 'scope-clip', 'system-run',
  'window-focus', 'window-snap', 'kill-process', 'ai-ask', 'ai-chat',
  'run-workflow', 'pin-favourite',
]);

ipcMain.handle('search', (_e, q) => {
  const query = String(q || '').slice(0, 500);
  if (query.trim()) recordSearch(query.trim());
  return search(query);
});

ipcMain.on('run-action', async (_e, payload) => {
  if (!payload || typeof payload !== 'object') return;
  const { action, result } = payload;
  if (!KNOWN_ACTIONS.has(action) || !result || typeof result !== 'object') return;
  const data = result.data || {};

  if (action === 'open' && typeof data.path === 'string') {
    shell.openPath(data.path);
    recordLaunch(data.path);
    recordOpen(data.path);
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
  } else if (action === 'copy' && typeof data.image === 'string') {
    try {
      const { nativeImage } = require('electron');
      clipboard.writeImage(nativeImage.createFromDataURL(data.image));
    } catch { clipboard.writeText(data.image); }
    hideWindow();
  } else if (action === 'paste' && typeof data.text === 'string') {
    hideWindow();
    restoreAndPaste(data.text, clipboard);
  } else if (action === 'open-settings') {
    completeOnboarding();
    createSettingsWindow();
    hideWindow();
  } else if (action === 'rebuild-index') {
    startIndexing();
    hideWindow();
  } else if (action === 'scope-clip') {
    if (win && !win.isDestroyed()) {
      win.webContents.send('set-query', '@clip ');
    }
  } else if (action === 'system-run' && data.commandId) {
    runSystemCommand(data.commandId);
    hideWindow();
  } else if (action === 'window-focus' && data.pid) {
    hideWindow();
    setTimeout(() => focusWindow(data.pid), 80);
  } else if (action === 'window-snap' && data.snapId) {
    hideWindow();
    setTimeout(() => {
      const map = { 'snap-left': 'left', 'snap-right': 'right', maximize: 'maximize', minimize: 'minimize' };
      snapWindow(map[data.snapId] || data.snapId);
    }, 80);
  } else if (action === 'kill-process' && data.pid) {
    killProcess(data.pid);
    hideWindow();
  } else if (action === 'ai-ask' && data.prompt) {
    try {
      const answer = await chatCompletion(config, [{ role: 'user', content: data.prompt }]);
      clipboard.writeText(answer);
      if (win && !win.isDestroyed()) {
        win.webContents.send('ai-response', { prompt: data.prompt, answer });
      }
    } catch (e) {
      if (win && !win.isDestroyed()) {
        win.webContents.send('ai-response', { error: e.message });
      }
    }
    hideWindow();
  } else if (action === 'ai-chat') {
    if (win && !win.isDestroyed()) {
      win.webContents.send('set-query', '@ai ');
    }
  } else if (action === 'pin-favourite' && data.path) {
    const favs = config.favourites || [];
    if (!favs.some((f) => f.path === data.path)) {
      config = updateConfig({
        favourites: favs.concat([{ path: data.path, kind: data.kind || 'file' }]),
      });
    }
    hideWindow();
  } else if (action === 'run-workflow' && data.steps) {
    for (const step of data.steps) {
      if (step.action === 'open' && step.path) shell.openPath(step.path);
      else if (step.action === 'copy' && step.text) clipboard.writeText(step.text);
    }
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
    if (stat.size > 2_000_000) return null;
    const text = await fs.promises.readFile(p, 'utf8');
    return text.slice(0, 2000);
  } catch {
    return null;
  }
});

ipcMain.handle('get-meta', async (_e, p) => {
  if (typeof p !== 'string' || !p) return null;
  try {
    const st = await fs.promises.stat(p);
    return { mtime: st.mtimeMs, size: st.size };
  } catch {
    return null;
  }
});

ipcMain.handle('get-appearance', () => {
  let accent = config.appearance.accentColor;
  try {
    if (config.appearance.theme === 'system' && systemPreferences.getAccentColor) {
      accent = '#' + systemPreferences.getAccentColor();
    }
  } catch { /* ignore */ }
  return { ...config.appearance, accentColor: accent };
});

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
    startIndexing();
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
ipcMain.on('rebuild-index', () => startIndexing());
ipcMain.on('clear-clipboard', () => clearHistory(getConfig));

const { completeOnboarding } = require('./providers/onboarding');
const { loadAnalytics, recordSearch, recordOpen } = require('./analytics');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());

  app.whenReady().then(() => {
    config = loadConfig();
    loadFrecency();
    loadAnalytics();
    loadExtensions();
    bootstrapExtensions();
    createWindow();
    createTray();
    loadCache();
    startIndexing();
    startRefreshSchedule(); // hot refresh every 5 min + idle full-crawl every hour
    startClipboardWatch(getConfig);

    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: true });
    }

    registerHotkeys();

    if (app.isPackaged) {
      try {
        const { autoUpdater } = require('electron-updater');
        autoUpdater.autoDownload = true;
        autoUpdater.checkForUpdatesAndNotify();
      } catch { /* auto-update optional */ }
    }
  });

  app.on('window-all-closed', () => { /* keep running in tray */ });
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    flushFrecency();
  });
}

module.exports = {
  idx,
  removeIndexedRoots,
  detectDrives,
  addEntries,
  resetIndex,
  rebuildBigrams,
  search,
};
