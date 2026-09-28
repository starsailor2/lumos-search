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
const BUILTIN_SKIP_DIRS = [
  // Version control
  '.git', '.svn', '.hg', '.bzr',
  // Windows & OS system trees
  '$recycle.bin', 'system volume information', '$windows.~bt', '$windows.~ws',
  'windows.old', 'winsxs', 'servicing', 'softwaredistribution', 'msocache',
  'recovery', 'perflogs', 'appdata', 'application data', 'onedrivetemp',
  'windows', '$winreagent', 'config.msi', 'temp', 'tmp', 'crashdumps',
  'd3dscache', 'inetcache', 'webcache',
  // Python environments, packages & tooling
  '.venv', 'venv', 'env', '.env', 'virtualenv', '.virtualenvs', '.conda',
  'conda-env', 'site-packages', 'dist-packages', '__pycache__', '.pytest_cache',
  '.mypy_cache', '.ruff_cache', '.tox', '.nox', '.hypothesis', '.eggs',
  'pip-wheel-metadata',
  // JavaScript / Node / Web dependencies & caches
  'node_modules', 'bower_components', '.next', '.nuxt', '.turbo', '.npm',
  '.pnpm', '.pnpm-store', '.yarn', '.yarn-cache', '.parcel-cache',
  '.svelte-kit', '.output', '.docusaurus', '.cache',
  // Rust / Cargo / Go / PHP / Ruby
  'target', '.cargo', '.rustup', 'vendor', '.bundle',
  // JVM / Gradle / Maven / Android
  '.gradle', '.m2', '.ivy2', '.sbt', '.android',
  // .NET / Visual Studio / IDEs / Build artifacts
  'obj', 'bin', '.nuget', '.vs', '.idea', '.vscode', '.settings',
  'cmake-build-debug', 'cmake-build-release', '.cxx', 'ipch',
];

const extraExcluded = (workerData && Array.isArray(workerData.excludedDirs) ? workerData.excludedDirs : [])
  .filter((d) => typeof d === 'string')
  .map((d) => d.toLowerCase());

// Merge logic: SKIP = new Set([...builtins, ...extraExcluded]) unless
// workerData.skipDirs is a non-empty array, in which case SKIP = new Set(workerData.skipDirs.map(lowercase)).
const SKIP_DIRS = (workerData && Array.isArray(workerData.skipDirs) && workerData.skipDirs.length)
  ? new Set(workerData.skipDirs.filter((d) => typeof d === 'string').map((d) => d.toLowerCase()))
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
const MAX_VISITED_REAL_PATHS = 500000;

let batch = [];
let total = 0;

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
  const stack = [root];
  let dirsVisited = 0;
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch { continue; } // access denied, gone, etc.

    for (const ent of entries) {
      const name = ent.name;
      let full;
      try { full = path.join(dir, name); } catch { continue; }

      let isDir = ent.isDirectory();
      if (ent.isSymbolicLink()) {
        if (visitedRealPaths.size >= MAX_VISITED_REAL_PATHS) {
          continue; // cap reached: skip symlinks
        }
        try {
          const real = fs.realpathSync(full);
          if (visitedRealPaths.has(real)) continue;
          const st = fs.statSync(real);
          if (st.isDirectory()) {
            visitedRealPaths.add(real);
            isDir = true;
          }
        } catch {
          continue; // broken link
        }
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
}

// 'full' (default) crawls shortcut dirs + every drive / custom root list.
// 'hot' crawls ONLY workerData.roots — used for the periodic light refresh
// of folders people actively save files into (Desktop, Documents, ...).
const MODE = (workerData && workerData.mode === 'hot') ? 'hot' : 'full';

(async () => {
  try {
    if (MODE === 'hot') {
      // No Start Menu scan in hot mode — those entries barely change. Desktop
      // shortcuts keep their app ranking via lnkAsApps above.
      for (const root of (CUSTOM_ROOTS || [])) await walk(root, { lnkAsApps: true });
      flush();
    } else {
      // 1) Apps first — Start Menu and Desktop shortcuts behave like app launchers
      for (const d of shortcutDirs()) await walk(d, { appsOnly: true });
      flush();

      // 2) Every drive, or the user's custom root list if configured
      const driveList = CUSTOM_ROOTS || PASS_DRIVES || listDrives();
      for (const drive of driveList) await walk(drive);
      flush();
    }

    parentPort.postMessage({ type: 'done', total, mode: MODE });
  } catch (err) {
    flush();
    parentPort.postMessage({ type: 'error', error: String(err && err.stack || err) });
    parentPort.postMessage({ type: 'done', total, mode: MODE });
  }
})();
