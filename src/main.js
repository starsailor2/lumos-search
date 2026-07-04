// Lumos Search — main process
// Read-only by design: the ONLY actions ever performed on user data are
// shell.openPath (open with default app) and shell.showItemInFolder (navigate).
// No fs.write / rename / delete APIs are used on user files anywhere.

const {
  app, BrowserWindow, globalShortcut, ipcMain, shell,
  Tray, Menu, nativeImage, screen
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Worker } = require('worker_threads');

const WINDOW_W = 720;
const WINDOW_H = 500;
const HOTKEY = 'Alt+Space';
const MAX_RESULTS = 40;

let win = null;
let tray = null;
let indexerWorker = null;

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
// Search with relevance scoring
// ---------------------------------------------------------------------------
function isSubsequence(q, s) {
  let qi = 0;
  for (let si = 0; si < s.length && qi < q.length; si++) {
    if (s.charCodeAt(si) === q.charCodeAt(qi)) qi++;
  }
  return qi === q.length;
}

function scoreEntry(i, q, pathMode) {
  const name = idx.names[i];
  let s = -1;
  if (name === q) s = 1000;
  else if (name.startsWith(q)) s = 880 - Math.min(name.length - q.length, 80);
  else {
    const at = name.indexOf(q);
    if (at > 0) {
      const prev = name[at - 1];
      const boundary = prev === ' ' || prev === '-' || prev === '_' || prev === '.' || prev === '(';
      s = (boundary ? 720 : 520) - Math.min(at, 100);
    } else if (q.length >= 3 && q.length <= 20 && name.length < 80 && isSubsequence(q, name)) {
      s = 220 - Math.min(name.length - q.length, 60);
    } else if (pathMode && idx.paths[i].toLowerCase().includes(q)) {
      s = 300;
    }
  }
  if (s < 0) return -1;
  const f = idx.flags[i];
  if (f === 2) s += 320;               // apps first, Spotlight-style
  else if (f === 1) s += 40;           // folders slightly above files
  // shallower paths are usually more relevant
  const depth = (idx.paths[i].match(/[\\/]/g) || []).length;
  s -= Math.min(depth * 4, 60);
  return s;
}

function search(query) {
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 1) return { results: [], status: idx.status, indexed: idx.count };
  const pathMode = q.includes('\\') || q.includes('/');
  const hits = [];
  const n = idx.count;
  for (let i = 0; i < n; i++) {
    const s = scoreEntry(i, q, pathMode);
    if (s > 0) hits.push([s, i]);
  }
  hits.sort((a, b) => b[0] - a[0]);
  const results = [];
  const seen = new Set();
  for (let k = 0; k < hits.length && results.length < MAX_RESULTS; k++) {
    const i = hits[k][1];
    const p = idx.paths[i];
    if (seen.has(p)) continue;
    seen.add(p);
    results.push({
      name: idx.names[i],
      path: p,
      kind: idx.flags[i] === 2 ? 'app' : idx.flags[i] === 1 ? 'folder' : 'file',
    });
  }
  return { results, status: idx.status, indexed: idx.count, matches: hits.length };
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
  const fresh = { paths: [], names: [], flags: [] };
  indexerWorker = new Worker(path.join(__dirname, 'indexer.js'));
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
  // Simple 16x16 blue dot, generated in memory (no asset files needed)
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  const cx = 7.5, cy = 7.5, r = 6.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const o = (y * size + x) * 4;
      if (d <= r) {
        buf[o] = 235; buf[o + 1] = 165; buf[o + 2] = 50; // BGR: blue-ish
        buf[o + 3] = d > r - 1 ? Math.round(255 * (r - d)) : 255;
      }
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

function createTray() {
  tray = new Tray(makeTrayIcon());
  tray.setToolTip('Lumos Search — ' + HOTKEY);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show search (' + HOTKEY + ')', click: showWindow },
    { label: 'Rebuild index', click: () => { if (!indexerWorker) startIndexing(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
  tray.on('click', toggleWindow);
}

// ---------------------------------------------------------------------------
// IPC — the complete surface the renderer can reach (read + navigate only)
// ---------------------------------------------------------------------------
ipcMain.handle('search', (_e, q) => search(q));
ipcMain.on('open-item', (_e, p) => {
  if (typeof p === 'string' && p.length) shell.openPath(p);
  hideWindow();
});
ipcMain.on('reveal-item', (_e, p) => {
  if (typeof p === 'string' && p.length) shell.showItemInFolder(p);
  hideWindow();
});
ipcMain.on('hide-window', () => hideWindow());

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());

  app.whenReady().then(() => {
    createWindow();
    createTray();
    loadCache();          // instant results from last run
    startIndexing();      // fresh crawl in the background

    // When installed (packaged), start automatically at Windows login
    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: true });
    }

    if (!globalShortcut.register(HOTKEY, toggleWindow)) {
      // Fallback if Alt+Space is taken
      globalShortcut.register('CommandOrControl+Space', toggleWindow);
    }
  });

  app.on('window-all-closed', (e) => { /* keep running in tray */ });
  app.on('will-quit', () => globalShortcut.unregisterAll());
}
