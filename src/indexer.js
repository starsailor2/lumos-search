// Lumos Search — indexer worker thread
// Crawls every available drive letter plus shortcut locations like the Start Menu
// and Desktop. STRICTLY read-only:
// uses only fs.readdir / fs.existsSync — never writes, renames, or deletes.

const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const os = require('os');

const BATCH_SIZE = 4000;

// User-configured roots to crawl instead of every drive letter (from
// Settings). null/absent means "auto" — the default listDrives() behavior.
const CUSTOM_ROOTS = (workerData && Array.isArray(workerData.roots) && workerData.roots.length)
  ? workerData.roots.filter((r) => typeof r === 'string')
  : null;

// Drives passed from main process (detected via wmic/PowerShell)
const PASS_DRIVES = (workerData && Array.isArray(workerData.drives) && workerData.drives.length)
  ? workerData.drives.filter((d) => typeof d === 'string')
  : null;

// Built-in skip list (all lowercase basenames)
const BUILTIN_SKIP_DIRS = require('./indexer-policy').SKIP_DIRS;

const extraExcluded = (workerData && Array.isArray(workerData.excludedDirs) ? workerData.excludedDirs : [])
  .filter((d) => typeof d === 'string')
  .map((d) => d.toLowerCase());

// Merge logic: SKIP = new Set([...builtins, ...extraExcluded]) unless
// workerData.skipDirs is a non-empty array, in which case SKIP = new Set(workerData.skipDirs.map(lowercase)).
const SKIP_DIRS = (workerData && Array.isArray(workerData.skipDirs) && workerData.skipDirs.length)
  ? new Set([...workerData.skipDirs.filter((d) => typeof d === 'string').map((d) => d.toLowerCase()), ...extraExcluded])
  : new Set([...BUILTIN_SKIP_DIRS, ...extraExcluded]);

// Detection for virtual environments, package directories, and build noise
function isNoiseDir(name, fullPath) {
  const lower = name.toLowerCase();
  if (SKIP_DIRS.has(lower)) return true;

  // Pattern checks for virtual environments (e.g. .venv, venv, my_venv, ocr_env, etc.)
  if (
    lower.startsWith('.venv') || lower.startsWith('venv') ||
    lower.endsWith('_venv') || lower.endsWith('-venv') ||
    lower.endsWith('_env') || lower.endsWith('-env') ||
    lower.endsWith('.egg-info') || lower.endsWith('.dist-info')
  ) {
    return true;
  }

  // Fast check: directory containing pyvenv.cfg is definitively a Python virtual env
  try {
    if (fs.existsSync(path.join(fullPath, 'pyvenv.cfg'))) {
      return true;
    }
  } catch { /* ignore */ }

  return false;
}

// Junction and symlink loop prevention
const visitedRealPaths = new Set();

let batch = [];
let total = 0;
const unreadable = [];

function emit(p, flag) {
  batch.push([p, flag]);
  total++;
  if (batch.length >= BATCH_SIZE) flush();
}

function flush() {
  if (batch.length) {
    parentPort.postMessage({ type: 'batch', items: batch });
    batch = [];
  }
}

function listDrives() {
  if (process.platform !== 'win32') return [os.homedir()]; // dev fallback
  const drives = [];
  for (let c = 65; c <= 90; c++) {
    const root = String.fromCharCode(c) + ':\\';
    try { if (fs.existsSync(root)) drives.push(root); } catch { /* skip */ }
  }
  return drives;
}

function shortcutDirs() {
  if (process.platform !== 'win32') return [];
  const dirs = [];
  if (process.env.ProgramData) {
    dirs.push(path.join(process.env.ProgramData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'));
  }
  if (process.env.APPDATA) {
    dirs.push(path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs'));
  }
  if (process.env.USERPROFILE) {
    dirs.push(path.join(process.env.USERPROFILE, 'Desktop'));
  }
  if (process.env.PUBLIC) {
    dirs.push(path.join(process.env.PUBLIC, 'Desktop'));
  }
  return dirs.filter((d) => { try { return fs.existsSync(d); } catch { return false; } });
}

async function walk(root, { appsOnly = false, lnkAsApps = false } = {}) {
  try { if (!fs.statSync(root).isDirectory()) return false; } catch { unreadable.push(root); return false; }
  if (workerData.mode === 'hot') {
    const boundaries = new Set([...(Array.isArray(workerData.boundaryRoots) ? workerData.boundaryRoots : CUSTOM_ROOTS || []), ...shortcutDirs()]
      .map((p) => path.resolve(p).toLowerCase()));
    // A changed subfolder must not bypass an excluded or virtual-env ancestor.
    for (let current = root; path.dirname(current) !== current && !boundaries.has(path.resolve(current).toLowerCase()); current = path.dirname(current)) {
      if (isNoiseDir(path.basename(current), current)) return true;
    }
  }
  const stack = [root];
  let dirsVisited = 0;
  let rootRead = false;
  while (stack.length) {
    const dir = stack.pop();
    let real;
    try { real = `${appsOnly}:` + fs.realpathSync(dir).toLowerCase(); } catch { unreadable.push(dir); continue; }
    if (visitedRealPaths.has(real)) continue;
    visitedRealPaths.add(real);
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
      if (dir === root) rootRead = true;
    } catch { unreadable.push(dir); continue; }

    for (const ent of entries) {
      const name = ent.name;
      let full;
      try { full = path.join(dir, name); } catch { continue; }

      const isDir = ent.isDirectory();
      if (ent.isSymbolicLink()) {
        // Junctions can escape selected roots or cycle back into an ancestor.
        continue;
      }

      if (isDir) {
        if (isNoiseDir(name, full)) continue;
        if (!appsOnly) emit(full, 1);
        stack.push(full);
      } else if (ent.isFile()) {
        // Smart file-level noise filter
        const lower = name.toLowerCase();
        if (lower === 'desktop.ini' || lower === 'thumbs.db') continue;
        if (/~\$.*\.tmp$/i.test(name)) continue;
        if (/^\.(tmp|ds_store|localized|_*)$/i.test(name)) continue;
        if (/\.(pyc|pyo|pyd)$/i.test(name)) continue;

        if (appsOnly) {
          if (/\.(lnk|url|appref-ms)$/i.test(name)) emit(full, 2);
        } else if (lnkAsApps && /\.(lnk|url|appref-ms)$/i.test(name)) {
          // Hot refresh of Desktop: keep shortcuts ranked as apps (flag 2),
          // matching what the full crawl's shortcutDirs() pass produces.
          emit(full, 2);
        } else {
          emit(full, 0);
        }
      }
    }

    // Yield periodically so postMessage batches actually flush
    if (++dirsVisited % 200 === 0) {
      flush();
      await new Promise((r) => setImmediate(r));
    }
  }
  return rootRead;
}

// 'full' (default) crawls shortcut dirs + every drive / custom root list.
// 'hot' crawls ONLY workerData.roots — used for the periodic light refresh
// of folders people actively save files into (Desktop, Documents, ...).
const MODE = (workerData && workerData.mode === 'hot') ? 'hot' : 'full';

(async () => {
  try {
    const refreshedRoots = [];
    if (MODE === 'hot') {
      // No Start Menu scan in hot mode — those entries barely change. Desktop
      // shortcuts keep their app ranking via lnkAsApps above.
      for (const root of (CUSTOM_ROOTS || [])) {
        if (await walk(root, { lnkAsApps: true })) refreshedRoots.push(root);
      }
      flush();
    } else {
      // 1) Apps first — Start Menu and Desktop shortcuts behave like app launchers
      for (const d of shortcutDirs()) { if (await walk(d, { appsOnly: true })) refreshedRoots.push(d); }
      flush();

      // 2) Every drive, or the user's custom root list if configured
      const driveList = CUSTOM_ROOTS || PASS_DRIVES || listDrives();
      for (const drive of driveList) { if (await walk(drive)) refreshedRoots.push(drive); }
      flush();
    }

    parentPort.postMessage({ type: 'done', total, mode: MODE, roots: refreshedRoots, unreadable });
  } catch (err) {
    flush();
    parentPort.postMessage({ type: 'error', error: String(err && err.stack || err) });
  }
})();
