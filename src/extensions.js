// Extension plugin loader — scans userData/extensions/ for manifest.json + index.js providers.

const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const { app } = require('electron');

let loadedExtensions = [];

function extensionsDir() {
  return path.join(app.getPath('userData'), 'extensions');
}

function loadExtensions() {
  stopExtensions();
  loadedExtensions = [];
  const dir = extensionsDir();
  if (!fs.existsSync(dir)) return loadedExtensions;

  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return loadedExtensions; }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const extPath = path.join(dir, entry.name);
    const manifestPath = path.join(extPath, 'manifest.json');
    const indexPath = path.join(extPath, 'index.js');
    if (!fs.existsSync(manifestPath) || !fs.existsSync(indexPath)) continue;
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (!manifest.name || manifest.enabled === false) continue;
      const code = fs.readFileSync(indexPath, 'utf8');
      const worker = new Worker(path.join(__dirname, 'extension-worker.js'), {
        workerData: { code, filename: indexPath }, resourceLimits: { maxOldGenerationSizeMb: 32 },
      });
      let nextId = 0;
      let stopped = false;
      const pending = new Map();
      const fail = (error) => {
        stopped = true;
        for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
        pending.clear();
      };
      worker.on('message', (message) => {
        const request = pending.get(message.id);
        if (!request) return;
        clearTimeout(request.timer); pending.delete(message.id);
        if (message.error) request.reject(new Error(`${manifest.name}: ${message.error}`));
        else request.resolve(message.results);
      });
      worker.on('error', fail);
      worker.on('exit', () => fail(new Error(`${manifest.name}: extension stopped.`)));
      worker.unref();
      const provider = { search(ctx) {
        if (stopped) return Promise.resolve([]);
        // Keep plugin code and its microtasks off the Electron main thread.
        const input = JSON.stringify({ q: ctx.q, qLower: ctx.qLower, scope: ctx.scope, isEmpty: ctx.isEmpty });
        return new Promise((resolve, reject) => {
          const id = ++nextId;
          const timer = setTimeout(() => {
            fail(new Error(`${manifest.name}: extension timed out.`)); worker.terminate();
          }, 2000);
          pending.set(id, { resolve, reject, timer });
          worker.postMessage({ id, input });
        });
      } };
      loadedExtensions.push({ manifest, provider, worker, path: extPath });
    } catch (e) {
      console.error('Extension load failed:', entry.name, e.message);
    }
  }
  return loadedExtensions;
}

function getExtensionProviders() {
  return loadedExtensions.map((e) => e.provider);
}

function listExtensions() {
  return loadedExtensions.map((e) => ({
    name: e.manifest.name,
    version: e.manifest.version || '1.0.0',
    description: e.manifest.description || '',
    path: e.path,
    permissions: e.manifest.permissions || [],
  }));
}

function stopExtensions() { return Promise.all(loadedExtensions.map((e) => e.worker.terminate())); }

module.exports = { loadExtensions, getExtensionProviders, listExtensions, extensionsDir, stopExtensions };
