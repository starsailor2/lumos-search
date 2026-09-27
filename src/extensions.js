// Extension plugin loader — scans userData/extensions/ for manifest.json + index.js providers.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { app } = require('electron');

let loadedExtensions = [];

function extensionsDir() {
  return path.join(app.getPath('userData'), 'extensions');
}

function loadExtensions() {
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
      const sandbox = {
        module: { exports: {} },
        exports: {},
        console,
        JSON,
        Math,
        Date,
        String,
        Number,
        Array,
        Object,
        RegExp,
      };
      vm.runInNewContext(code, sandbox, { filename: indexPath, timeout: 1000 });
      const provider = sandbox.module.exports;
      if (provider && typeof provider.search === 'function') {
        loadedExtensions.push({ manifest, provider, path: extPath });
      }
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

module.exports = { loadExtensions, getExtensionProviders, listExtensions, extensionsDir };
