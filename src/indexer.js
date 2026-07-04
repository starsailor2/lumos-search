// Lumos Search — indexer worker thread
// Crawls every available drive letter plus shortcut locations like the Start Menu
// and Desktop. STRICTLY read-only:
// uses only fs.readdir / fs.existsSync — never writes, renames, or deletes.

const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const os = require('os');

const BATCH_SIZE = 4000;

// User-configured extra folders to skip (from Settings), on top of the
// built-in list below. Passed in via workerData, always an array of strings.
const EXTRA_SKIP_DIRS = new Set(
  (workerData && Array.isArray(workerData.excludedDirs) ? workerData.excludedDirs : [])
    .filter((d) => typeof d === 'string')
    .map((d) => d.toLowerCase())
);

// User-configured roots to crawl instead of every drive letter (from
// Settings). null/absent means "auto" — the default listDrives() behavior.
const CUSTOM_ROOTS = (workerData && Array.isArray(workerData.roots) && workerData.roots.length)
  ? workerData.roots.filter((r) => typeof r === 'string')
  : null;

// Junk/system dirs skipped by basename (huge, noisy, or protected).
// Edit this list to taste.
const SKIP_DIRS = new Set([
  '$recycle.bin',
  'system volume information',
  '$windows.~bt',
  '$windows.~ws',
  'windows.old',
  'winsxs',
  'servicing',
  'softwaredistribution',
  'node_modules',
  '.git',
  '__pycache__',
  '.cache',
  'msocache',
  'recovery',
  'perflogs',
]);

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

async function walk(root, { appsOnly = false } = {}) {
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

      if (ent.isSymbolicLink()) continue; // avoid loops
      if (ent.isDirectory()) {
        const lower = name.toLowerCase();
        if (SKIP_DIRS.has(lower) || EXTRA_SKIP_DIRS.has(lower)) continue;
        if (!appsOnly) emit(full, 1);
        stack.push(full);
      } else if (ent.isFile()) {
        if (appsOnly) {
          if (/\.(lnk|url|appref-ms)$/i.test(name)) emit(full, 2);
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

(async () => {
  try {
    // 1) Apps first — Start Menu and Desktop shortcuts behave like app launchers
    for (const d of shortcutDirs()) await walk(d, { appsOnly: true });
    flush();

    // 2) Every drive, or the user's custom root list if configured
    for (const drive of (CUSTOM_ROOTS || listDrives())) await walk(drive);
    flush();

    parentPort.postMessage({ type: 'done', total });
  } catch (err) {
    flush();
    parentPort.postMessage({ type: 'error', error: String(err && err.stack || err) });
    parentPort.postMessage({ type: 'done', total });
  }
})();
