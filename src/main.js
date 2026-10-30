// Lumos Search — main process

const {
  app, BrowserWindow, globalShortcut, ipcMain, shell, clipboard,
  Tray, Menu, nativeImage, screen, dialog, powerMonitor, nativeTheme
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Worker } = require('worker_threads');
const { loadConfig, getConfig, updateConfig } = require('./config');
const { loadFrecency, recordLaunch: storeLaunch, getRankingSnapshot, resetFrecency, frecencyBoost, flushFrecency } = require('./frecency');
const { startClipboardWatch, applyRetentionChange, clearHistory } = require('./providers/clipboard');
const { createSettingsWindow } = require('./settings-window');
const { restoreAndPaste } = require('./paste');
const { parseScope, loadProviders } = require('./scope');
const { loadExtensions, getExtensionProviders, listExtensions, extensionsDir, stopExtensions } = require('./extensions');
const { runSystemCommand } = require('./providers/system');
const { focusWindow, snapWindow } = require('./providers/windows');
const { killProcess } = require('./providers/process');
const { chatCompletion } = require('./providers/ai');
const { launchApp } = require('./providers/apps');
const { loadIntentMemory, recordIntent, getIntent, getRecentIntents, clearIntentMemory, flushIntentMemory } = require('./intent-memory');
const PROVIDERS = require('./providers');

const COMPACT_W = 600;
const COMPACT_H = 60;
let resizeTimer = null;
let resizeTarget = COMPACT_H;
const APP_ICON = path.join(__dirname, '..', 'public', 'icon.ico');
const TEXT_PREVIEW_EXTS = new Set(['.txt', '.md', '.json', '.log', '.csv', '.js', '.ts', '.py', '.yml', '.yaml', '.xml', '.ini', '.cfg', '.conf']);

let win = null;
let tray = null;
let indexerWorker = null;
let config = null;
let rebuildPending = false;
let refreshPending = false;
let lastIndexUpdate = 0;
let scan = { mode: null, startedAt: 0, scanned: 0, unreadable: [], error: '' };
let folderWatch = null;
let fileSearch = null;
let stopping = false;
let lastSearchQuery = '';
let modalOpen = false;

const idx = {
  paths: [],
  names: [],
  flags: [],
  parents: [],
  parentPaths: new Map(),
  filtered: true,
  count: 0,
  status: 'starting',
  byPath: new Map(),
};

const NOISE_PATH_REGEX = /[\\/](\.venv|venv|env|\.env|virtualenv|\.virtualenvs|\.conda|conda-env|site-packages|dist-packages|node_modules|bower_components|__pycache__|\.pytest_cache|\.mypy_cache|\.ruff_cache|\.tox|\.nox|\.eggs|pip-wheel-metadata|\.git|\.next|\.nuxt|\.turbo|\.cargo|\.rustup|\.gradle|\.m2|\.nuget|obj|cmake-build-debug|cmake-build-release|\.vs|\.idea|ipch)[\\/]/i;

function addEntries(items, target = idx, staging = false) {
  const idx = target;
  const accepted = [];
  for (let i = 0; i < items.length; i++) {
    const [p, f] = items[i];
    const key = path.normalize(p).toLowerCase();
    if (idx.byPath.has(key)) {
      const existing = idx.byPath.get(key);
      if (f === 2) {
        idx.flags[existing] = 2;
        idx.names[existing] = path.basename(p).replace(/\.(lnk|url|appref-ms)$/i, '').toLowerCase();
        accepted.push([p, f]);
      }
      continue;
    }
    if (!config?.skipDirs?.length && f !== 2 && NOISE_PATH_REGEX.test(p)) continue;
    idx.byPath.set(key, idx.paths.length);
    idx.paths.push(p);
    const parent = path.dirname(p).toLowerCase();
    if (!idx.parentPaths.has(parent)) idx.parentPaths.set(parent, parent);
    idx.parents.push(idx.parentPaths.get(parent));
    const base = p.slice(Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/')) + 1);
    const n = (f === 2 ? base.replace(/\.(lnk|url|appref-ms)$/i, '') : base).toLowerCase();
    idx.names.push(n);
    idx.flags.push(f);
    accepted.push([p, f]);
  }
  idx.count = idx.paths.length;
  fileSearch?.add(accepted, staging);
}

function recordLaunch(p) { storeLaunch(p); fileSearch?.setUsage(getRankingSnapshot()); }

function resetIndex() {
  idx.paths = [];
  idx.names = [];
  idx.flags = [];
  idx.parents = [];
  idx.parentPaths.clear();
  idx.count = 0;
  idx.byPath.clear();
}

async function search(query, onProgress) {
  const raw = String(query || '').trim();
  lastSearchQuery = raw;
  const scoped = parseScope(raw);
  const q = scoped.q;
  const isEmpty = q.length < 1 && !scoped.scope;

  if (!isEmpty && q.length < 1 && scoped.scope) {
    // Scoped browse mode (@clip, @emoji, etc.)
  } else if (!isEmpty && q.length < 1) {
    return {
      results: [],
      status: idx.status,
      indexed: idx.count,
      recentIntents: getRecentIntents(6),
    };
  }

  const learnedIntent = getIntent(raw);

  const ctx = {
    q,
    qLower: q.toLowerCase(),
    idx,
    config,
    frecencyBoost,
    scope: scoped.scope,
    isEmpty: isEmpty || (scoped.scope && !q),
    learnedIntent,
  };

  let providers = scoped.providers ? loadProviders(scoped.providers) : PROVIDERS;
  const extProviders = scoped.scope ? [] : getExtensionProviders();
  providers = providers.concat(extProviders);

  const responses = providers.map(() => []);
  let remaining = providers.length;
  let failedSources = 0;
  let progressTimer = null;
  const response = () => ({ ...rankResults(responses.flat(), ctx), pending: remaining > 0, failedSources });
  try {
    await Promise.all(providers.map(async (provider, i) => {
      try { responses[i] = fileSearch && provider === require('./providers/files') ?
        await fileSearch.search(ctx).catch(() => provider.search(ctx)) : await provider.search(ctx) || []; }
      catch (e) { failedSources++; console.error('provider error:', e); }
      remaining--;
      if (onProgress && !progressTimer && remaining) progressTimer = setTimeout(() => {
        progressTimer = null;
        if (remaining) onProgress(response());
      }, 0);
    }));
    return response();
  } finally { clearTimeout(progressTimer); }
}

function rankResults(rawResults, ctx) {
  const { learnedIntent } = ctx;
  let all = rawResults.filter((r) => r && typeof r.id === 'string' && typeof r.title === 'string' &&
    typeof r.type === 'string' && Number.isFinite(r.score) && Array.isArray(r.actions) &&
    r.actions.some((action) => KNOWN_ACTIONS.has(action))).map((r) => {
      let end = 0;
      return {
        ...r, subtitle: typeof r.subtitle === 'string' ? r.subtitle : '',
        data: r.data && typeof r.data === 'object' ? r.data : {},
        actions: r.actions.filter((action) => KNOWN_ACTIONS.has(action)),
        matchRanges: Array.isArray(r.matchRanges) ? r.matchRanges.filter((range) => {
          if (!Array.isArray(range) || !Number.isInteger(range[0]) || !Number.isInteger(range[1]) ||
            range[0] < end || range[1] <= range[0] || range[1] > r.title.length) return false;
          end = range[1]; return true;
        }) : [],
      };
    });

  // Learned intent reorders results within their priority group.
  if (learnedIntent) {
    for (let j = 0; j < all.length; j++) {
      const r = all[j];
      const matchId = (r.id === learnedIntent.id);
      const matchPath = (r.data && r.data.path && r.data.path === learnedIntent.path) || (r.subtitle === learnedIntent.path);
      if (matchId || matchPath) {
        r.score += 450;
        r.isIntent = true;
      }
    }
  }

  const appsFirst = Boolean(ctx.q) && !ctx.scope && !/[\\/]/.test(ctx.q);
  all.sort((a, b) => (appsFirst ? Number(b.type === 'app') - Number(a.type === 'app') : 0) || b.score - a.score);

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
  return {
    results,
    ...getIndexStatus(),
    matches: all.length,
    lastIndexUpdate,
    recentIntents: getRecentIntents(6),
  };
}

const cacheFile = () => path.join(app.getPath('userData'), 'index-cache.txt');

async function loadCache() {
  try {
    const readline = require('readline');
    const stream = fs.createReadStream(cacheFile(), { encoding: 'utf8' });
    const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let items = [];
    let hadNoise = false;
    for await (const line of lines) {
      if (line.length < 3) continue;
      const tabIdx = line.indexOf('\t');
      if (tabIdx < 0) continue;
      const flagStr = line.slice(0, tabIdx);
      const filePath = line.slice(tabIdx + 1);
      const flag = Number(flagStr) || 0;
      if (!config?.skipDirs?.length && flag !== 2 && NOISE_PATH_REGEX.test(filePath)) {
        hadNoise = true;
        continue;
      }
      items.push([filePath, flag]);
      if (items.length >= 4000) {
        addEntries(items); items = [];
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
    addEntries(items);
    if (idx.count) {
      idx.status = 'ready';
      pushStatus();
      if (hadNoise) saveCache(); // Rewrite cleaned cache without noise
    }
  } catch { /* no cache yet */ }
}

let cacheSave = Promise.resolve();
function saveCache() {
  const snapshot = { paths: idx.paths, flags: idx.flags, count: idx.count };
  cacheSave = cacheSave.catch(() => {}).then(async () => {
    const temporary = cacheFile() + '.tmp';
    const file = await fs.promises.open(temporary, 'w');
    try {
      for (let start = 0; start < snapshot.count; start += 4000) {
        const lines = [];
        for (let i = start; i < Math.min(start + 4000, snapshot.count); i++) lines.push(snapshot.flags[i] + '\t' + snapshot.paths[i]);
        await file.writeFile(lines.join('\n') + '\n');
      }
    } finally { await file.close(); }
    await fs.promises.rename(temporary, cacheFile());
  }).catch((error) => console.error('Index cache save failed:', error.message));
  return cacheSave;
}

// ---------------------------------------------------------------------------
// Indexer worker. mode 'full' rebuilds everything; mode 'hot' re-crawls only
// the given roots and merges the result into the live index.
// ---------------------------------------------------------------------------
let lastFullCrawl = 0;
let lastHotCrawl = 0;

function startIndexing() {
  if (stopping) return;
  void require('./providers/apps').listStartApps?.refresh?.();
  if (indexerWorker) { rebuildPending = true; pushStatus(); return; }
  spawnIndexer({ mode: 'full' });
}

function refreshIndex() {
  if (stopping) return;
  void require('./providers/apps').listStartApps?.refresh?.();
  if (indexerWorker) { refreshPending = true; pushStatus(); return; }
  const roots = hotRoots();
  if (roots.length) spawnIndexer({ mode: 'hot', roots });
}

function spawnIndexer(opts) {
  if (indexerWorker) return; // one crawl at a time; the scheduler retries later
  const mode = opts.mode === 'hot' ? 'hot' : 'full';
  idx.status = 'indexing';
  scan = { mode, startedAt: Date.now(), scanned: 0, unreadable: [], error: '' };
  if (mode === 'full') {
    lastFullCrawl = Date.now();
    lastHotCrawl = Date.now(); // a full crawl covers the hot roots too
  }
  // Drive probing belongs in the worker; launching PowerShell here freezes the UI.
  const drives = null;
  indexerWorker = new Worker(path.join(__dirname, 'indexer.js'), {
    workerData: {
      roots: mode === 'hot' ? opts.roots : config.indexedRoots,
      boundaryRoots: config.indexedRoots || [],
      excludedDirs: config.excludedDirs,
      skipDirs: config.skipDirs,
      drives,
      mode,
    },
  });
  const worker = indexerWorker;
  const streaming = mode === 'full' && idx.count === 0;
  if (mode === 'full' && !streaming) fileSearch?.begin();
  const nextIndex = streaming ? idx : { paths: [], names: [], flags: [], parents: [], parentPaths: new Map(), count: 0, byPath: new Map(), filtered: true };
  let freshItems = [];
  let scanned = 0;
  let failed = false;
  let completed = false;
  const finish = () => {
    if (indexerWorker !== worker) return;
    indexerWorker = null;
    if (stopping) return;
    if (!completed) { idx.status = 'error'; scan.error ||= 'The scan stopped unexpectedly. Existing results are still available.'; pushStatus(); }
    if (rebuildPending) { rebuildPending = false; refreshPending = false; startIndexing(); }
    else if (refreshPending) { refreshPending = false; refreshIndex(); }
  };
  pushStatus();

  indexerWorker.on('message', (msg) => {
    if (msg.type === 'batch') {
      scanned += msg.items.length;
      scan.scanned = scanned;
      if (mode === 'full') addEntries(msg.items, nextIndex, !streaming);
      else for (const item of msg.items) freshItems.push(item);
      pushStatus();
    } else if (msg.type === 'done') {
      if (failed) return;
      completed = true;
      scan.unreadable = Array.isArray(msg.unreadable) ? [...new Set(msg.unreadable)] : [];
      lastIndexUpdate = Date.now();
      if (mode === 'full') {
        if (!streaming) {
          if (scan.unreadable.length) {
            const unavailable = scan.unreadable.map((p) => path.normalize(p).toLowerCase().replace(/[\\/]+$/, ''));
            const retained = [];
            for (let i = 0; i < idx.count; i++) {
              const p = idx.paths[i].toLowerCase();
              if (unavailable.some((root) => p === root || p.startsWith(root + path.sep))) retained.push([idx.paths[i], idx.flags[i]]);
            }
            addEntries(retained, nextIndex, true);
          }
          Object.assign(idx, nextIndex);
          fileSearch?.commit();
        }
        folderWatch?.setRoots([...(msg.roots || []), ...(config.indexedRoots || []), ...scan.unreadable.filter((p) => /^[a-z]:[\\/]?$/i.test(p))]);
        idx.status = 'ready';
        pushStatus();
      } else {
        // Hot refresh: swap out only the entries under the refreshed roots
        removeIndexedRoots(msg.roots || opts.roots, msg.unreadable);
        addEntries(freshItems);
        idx.status = 'ready';
        pushStatus();
      }
      freshItems = [];
      saveCache();
    } else if (msg.type === 'error') {
      failed = true;
      scan.error = String(msg.error || 'The scan failed.');
      console.error('indexer:', msg.error);
    }
  });
  indexerWorker.on('error', (e) => {
    console.error(e);
    failed = true;
    scan.error = e.message;
  });
  worker.once('exit', finish);
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
    return config.indexedRoots.slice();
  }
  const home = os.homedir();
  const roots = [];
  for (const f of HOT_FOLDERS) {
    let p = path.join(home, f);
    try { p = app.getPath(f.toLowerCase()); } catch { /* fallback for older profiles */ }
    try { if (fs.statSync(p).isDirectory()) roots.push(p); } catch { /* not present */ }
  }
  return roots;
}

// Drop every indexed entry whose path lies under one of `roots`.
function removeIndexedRoots(roots, unreadable = []) {
  if (!roots || !roots.length) return;
  fileSearch?.removeRoots(roots, unreadable);
  const norm = roots.map((r) => r.toLowerCase().replace(/[\\/]+$/, ''));
  const paths = [], names = [], flags = [], parents = [];
  for (let i = 0; i < idx.count; i++) {
    const p = idx.paths[i];
    const lower = p.toLowerCase();
    if (unreadable.some((r) => lower === r.toLowerCase() || lower.startsWith(r.toLowerCase().replace(/[\\/]+$/, '') + path.sep))) {
      paths.push(p); names.push(idx.names[i]); flags.push(idx.flags[i]); parents.push(idx.parents[i]); continue;
    }
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
    parents.push(idx.parents[i]);
  }
  idx.paths = paths;
  idx.names = names;
  idx.flags = flags;
  idx.parents = parents;
  idx.parentPaths = new Map(parents.map((p) => [p, p]));
  idx.count = paths.length;
  idx.byPath = new Map(paths.map((p, i) => [path.normalize(p).toLowerCase(), i]));
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

function getIndexStatus() {
  return { status: idx.status, indexed: idx.count, ...scan, lastIndexUpdate,
    unreadable: scan.unreadable.slice(0, 20), unreadableCount: scan.unreadable.length,
    queued: rebuildPending ? 'full' : refreshPending ? 'hot' : null };
}

function pushStatus() {
  const windows = BrowserWindow?.getAllWindows?.() || (win ? [win] : []);
  for (const target of windows) if (!target.isDestroyed()) target.webContents.send('index-status', getIndexStatus());
}

function createWindow() {
  const winOpts = {
    width: COMPACT_W,
    height: COMPACT_H,
    icon: APP_ICON,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
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
    // The CSS pill owns its shape; native acrylic paints a rectangular backdrop.
    winOpts.roundedCorners = false;
  }
  win = new BrowserWindow(winOpts);
  let rendererRestarts = 0;
  win.webContents.on('render-process-gone', (_event, details) => {
    if (['crashed', 'oom', 'abnormal-exit'].includes(details.reason) && rendererRestarts++ < 2) win.webContents.reload();
  });
  win.webContents.on('did-fail-load', (_event, code, description) => {
    if (code !== -3) console.error('Launcher failed to load:', description);
  });

  const isDev = process.env.ELECTRON_RENDERER_URL;
  if (isDev) {
    win.loadURL(isDev);
  } else {
    const builtPath = path.join(__dirname, '..', 'dist', 'renderer', 'launcher', 'index.html');
    win.loadFile(builtPath);
  }
  win.on('blur', () => { if (!modalOpen) hideWindow(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.on('closed', () => { win = null; });
  win.setAlwaysOnTop(true, 'floating');
}

function positionWindow(width = COMPACT_W, height = COMPACT_H) {
  if (!win || win.isDestroyed()) return;
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  width = Math.min(width, workArea.width);
  height = Math.min(height, workArea.height);
  const x = Math.round(workArea.x + (workArea.width - width) / 2);
  const y = Math.min(workArea.y + workArea.height - height, Math.round(workArea.y + workArea.height * 0.18));
  win.setBounds({ x, y, width, height });
}

function resizeLauncher(requestedHeight, animate = true) {
  if (!win || win.isDestroyed() || !Number.isFinite(requestedHeight)) return;
  const bounds = win.getBounds();
  const { workArea } = screen.getDisplayMatching(bounds);
  const available = Math.max(COMPACT_H, workArea.y + workArea.height - bounds.y);
  const height = Math.round(Math.min(Math.max(COMPACT_H, requestedHeight), 600, available));
  if (height === resizeTarget && resizeTimer) return;
  clearTimeout(resizeTimer);
  resizeTimer = null;
  resizeTarget = height;
  if (height === bounds.height) return;
  if (!animate || config.appearance.animations === false || !win.isVisible()) {
    win.setBounds({ height });
    return;
  }
  const started = Date.now();
  const step = () => {
    if (!win || win.isDestroyed()) { resizeTimer = null; return; }
    const progress = Math.min(1, (Date.now() - started) / 220);
    const eased = 1 - Math.pow(1 - progress, 3);
    // Only the bottom edge moves; the input keeps its width, position and focus.
    win.setBounds({ height: Math.round(bounds.height + (height - bounds.height) * eased) });
    resizeTimer = progress < 1 ? setTimeout(step, 16) : null;
  };
  step();
}

function showWindow() {
  if (!win || win.isDestroyed()) return;
  if (win.isVisible()) { win.focus(); return; }
  clearTimeout(resizeTimer); resizeTimer = null; resizeTarget = COMPACT_H;
  positionWindow(COMPACT_W, COMPACT_H);
  win.show();
  win.focus();
  const notify = () => win && !win.isDestroyed() && win.webContents.send('window-shown', { appearance: getAppearance() });
  if (win.webContents.isLoadingMainFrame()) win.webContents.once('did-finish-load', notify);
  else notify();
  pushStatus();
}

function hideWindow() {
  clearTimeout(resizeTimer); resizeTimer = null;
  if (win && win.isVisible()) win.hide();
}

function toggleWindow() {
  if (!win || win.isDestroyed()) return;
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
    { label: 'Refresh recent folders', click: refreshIndex },
    { label: 'Index settings…', click: () => createSettingsWindow('indexing') },
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
  'open-settings', 'rebuild-index', 'refresh-index', 'scope-clip', 'set-scope', 'open-data-folder', 'system-run',
  'window-focus', 'window-snap', 'kill-process', 'ai-ask', 'ai-chat',
  'run-workflow', 'pin-favourite', 'launch-app',
]);

async function confirmAction(message, label) {
  modalOpen = true;
  try {
    const result = await dialog.showMessageBox(win, {
      type: 'warning', message, buttons: ['Cancel', label], defaultId: 0, cancelId: 0, noLink: true,
    });
    return result.response === 1;
  } finally { modalOpen = false; }
}

ipcMain.handle('search', (event, q, requestId) => {
  const query = String(q || '').slice(0, 500);
  if (query.trim()) recordSearch(query.trim());
  const progress = Number.isSafeInteger(requestId) && requestId >= 0 ? (response) => {
    if (!event.sender.isDestroyed()) event.sender.send('search-results', { requestId, response });
  } : null;
  return search(query, progress);
});

ipcMain.handle('run-action', async (_e, payload) => {
  try {
  if (!payload || typeof payload !== 'object') return;
  const { action, result } = payload;
  if (!KNOWN_ACTIONS.has(action) || !result || typeof result !== 'object') return;
  const data = result.data || {};

  const remember = () => {
    if (lastSearchQuery && ['file', 'folder', 'app', 'game', 'quicklink'].includes(result.type)) recordIntent(lastSearchQuery, result);
  };

  if (action === 'launch-app' && typeof data.appId === 'string') {
    await launchApp(data.appId);
    remember();
    recordLaunch('startapp:' + data.appId);
    recordOpen('startapp:' + data.appId);
    hideWindow();
  } else if (action === 'open' && typeof data.path === 'string') {
    const error = await shell.openPath(data.path);
    if (error) return { error };
    remember();
    recordLaunch(data.path);
    recordOpen(data.path);
    hideWindow();
  } else if (action === 'reveal' && typeof data.path === 'string') {
    shell.showItemInFolder(data.path);
    remember();
    hideWindow();
  } else if (action === 'open-external' && typeof data.url === 'string' &&
    (/^https?:\/\//i.test(data.url) || (result.type === 'game' &&
      (/^steam:\/\/rungameid\/\d+$/.test(data.url) || /^com\.epicgames\.launcher:\/\/apps\/[\w%.-]+\?action=launch&silent=true$/.test(data.url))))) {
    await shell.openExternal(data.url);
    remember();
    hideWindow();
  } else if (action === 'copy' && typeof data.text === 'string' && !data.image) {
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
    createSettingsWindow(data.section);
    hideWindow();
  } else if (action === 'rebuild-index') {
    startIndexing();
  } else if (action === 'refresh-index') {
    refreshIndex();
  } else if (action === 'open-data-folder') {
    const error = await shell.openPath(app.getPath('userData'));
    if (error) return { error };
  } else if (action === 'set-scope') {
    if (typeof data.scope !== 'string' || !Object.hasOwn(require('./scope').SCOPES, data.scope)) return { error: 'Unknown search mode.' };
    win.webContents.send('set-query', '@' + data.scope + ' ');
  } else if (action === 'scope-clip') {
    if (win && !win.isDestroyed()) {
      win.webContents.send('set-query', '@clip ');
    }
  } else if (action === 'system-run' && data.commandId) {
    if (['shutdown', 'restart', 'empty-trash'].includes(data.commandId) &&
      !await confirmAction(`Run “${result.title}”? Unsaved work or deleted files may be lost.`, 'Run')) return;
    await runSystemCommand(data.commandId);
    hideWindow();
  } else if (action === 'window-focus' && data.pid) {
    hideWindow();
    await new Promise((resolve) => setTimeout(resolve, 80));
    await focusWindow(data.pid);
  } else if (action === 'window-snap' && data.snapId) {
    hideWindow();
    await new Promise((resolve) => setTimeout(resolve, 80));
    const map = { 'snap-left': 'left', 'snap-right': 'right', maximize: 'maximize', minimize: 'minimize' };
    await snapWindow(map[data.snapId] || data.snapId);
  } else if (action === 'kill-process' && data.pid) {
    if (!await confirmAction(`Stop “${data.name || result.title}”? Unsaved work may be lost.`, 'Stop process')) return;
    if (!await killProcess(data.pid)) return { error: 'Unable to stop this process.' };
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
  } else if (action === 'run-workflow' && Array.isArray(data.steps)) {
    for (const step of data.steps) {
      const value = step.data || step;
      if (step.action === 'open' && typeof value.path === 'string') {
        const error = await shell.openPath(value.path);
        if (error) return { error };
      } else if (step.action === 'copy' && typeof value.text === 'string') clipboard.writeText(value.text);
    }
    hideWindow();
  } else return { error: 'This action has invalid or unsupported data. Check its settings.' };
  } catch (error) {
    if (win && !win.isDestroyed() && !win.isVisible()) { win.show(); win.focus(); }
    return { error: error.message || String(error) };
  }
});

ipcMain.on('hide-window', () => hideWindow());
ipcMain.on('open-settings', (_e, section) => createSettingsWindow(section));
ipcMain.on('resize-launcher', (_e, payload) => {
  if (payload && typeof payload === 'object') resizeLauncher(payload.height, payload.animate === true);
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

function getAppearance() {
  return { ...config.appearance };
}
ipcMain.handle('get-appearance', getAppearance);

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
      JSON.stringify(prev.excludedDirs) !== JSON.stringify(config.excludedDirs) ||
      JSON.stringify(prev.skipDirs) !== JSON.stringify(config.skipDirs)) {
    startIndexing();
  }
  if (JSON.stringify(prev.clipboard) !== JSON.stringify(config.clipboard)) {
    applyRetentionChange(config);
  }
  refreshTray();
  if (win && !win.isDestroyed()) win.webContents.send('appearance-changed', getAppearance());
  return config;
});
ipcMain.handle('pick-folder', async () => {
  const res = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
});
ipcMain.on('reset-frecency', () => { resetFrecency(); fileSearch?.setUsage(getRankingSnapshot()); clearIntentMemory(); clearAnalytics(); });
ipcMain.on('rebuild-index', () => startIndexing());
ipcMain.on('refresh-index', refreshIndex);
ipcMain.on('open-icon-credits', () => shell.openExternal('https://www.flaticon.com/uicons'));
ipcMain.handle('open-data-folder', () => shell.openPath(app.getPath('userData')));
ipcMain.handle('get-index-status', getIndexStatus);
ipcMain.on('clear-clipboard', () => clearHistory(getConfig));
ipcMain.handle('get-recent-intents', () => getRecentIntents(8));

const { completeOnboarding } = require('./providers/onboarding');
const { loadAnalytics, recordSearch, recordOpen, clearAnalytics, flushAnalytics } = require('./analytics');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());

  app.whenReady().then(async () => {
    config = loadConfig();
    void require('./providers/apps').listStartApps();
    loadFrecency();
    fileSearch = new (require('./file-search').FileSearch)();
    fileSearch.setUsage(getRankingSnapshot());
    loadIntentMemory();
    loadAnalytics();
    loadExtensions();
    bootstrapExtensions();
    createWindow();
    createTray();
    await loadCache();
    startIndexing();
    startRefreshSchedule(); // hot refresh every 5 min + idle full-crawl every hour
    folderWatch = require('./folder-watch').watchFolders((roots) => {
      if (indexerWorker) return false;
      spawnIndexer({ mode: 'hot', roots });
      return true;
    }, () => config.skipDirs.length ? [...config.skipDirs, ...config.excludedDirs].map((s) => s.toLowerCase()) :
      [...require('./indexer-policy').SKIP_DIRS, ...config.excludedDirs].map((s) => s.toLowerCase()));
    powerMonitor.on('resume', () => folderWatch.reconcile());
    startClipboardWatch(getConfig);

    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: true });
    }

    registerHotkeys();
    nativeTheme.on('updated', () => {
      if (win && !win.isDestroyed()) win.webContents.send('appearance-changed', getAppearance());
    });

    if (app.isPackaged) {
      try {
        const { autoUpdater } = require('electron-updater');
        autoUpdater.autoDownload = true;
        autoUpdater.on('error', (error) => console.error('Update check failed:', error.message));
        autoUpdater.checkForUpdatesAndNotify().catch((error) => console.error('Update check failed:', error.message));
      } catch { /* auto-update optional */ }
    }
  });

  app.on('window-all-closed', () => { /* keep running in tray */ });
  app.on('will-quit', () => {
    clearTimeout(resizeTimer);
    globalShortcut.unregisterAll();
    flushFrecency();
    flushIntentMemory();
    flushAnalytics();
    void stopServices();
  });
}

async function stopServices() {
  stopping = true; rebuildPending = false; refreshPending = false;
  folderWatch?.close();
  await Promise.allSettled([fileSearch?.close(), indexerWorker?.terminate(), stopExtensions()]);
}

module.exports = {
  idx,
  removeIndexedRoots,
  addEntries,
  resetIndex,
  search,
  resizeLauncher,
  stopServices,
};
