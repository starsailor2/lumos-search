// Lumos Search — persisted user configuration
// Stored as JSON in the app's own userData folder (never in user files).
// Written atomically (temp file + rename) so a crash mid-write can't corrupt it.

const fs = require('fs');
const path = require('path');

let app;
try { ({ app } = require('electron')); } catch { /* not running under electron (tests) */ }

const DEFAULT_CONFIG = {
  version: 1,
  hotkeys: ['Alt+,', 'Alt+X'],
  hotkeyFallbacks: ['CommandOrControl+,', 'CommandOrControl+X'],
  maxResults: 40,
  indexedRoots: null,   // null = auto (all drives + shortcut dirs)
  excludedDirs: [],     // extra basenames to skip, on top of built-in SKIP_DIRS
  quickActions: {
    calculator: true,
    unitConvert: true,
    webSearch: true,
    webSearchEngine: 'https://www.google.com/search?q=%s',
  },
  clipboard: {
    enabled: true,
    maxEntries: 50,
    maxTextChars: 20000,
    retainAcrossRestarts: true,
  },
  snippets: [], // { id, trigger, body }
};

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function clampNumber(n, min, max, fallback) {
  n = Number(n);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// Merge loaded JSON over defaults, validating/clamping anything user- or
// disk-supplied so a malformed config.json can't crash the app or produce
// nonsensical runtime behavior.
function sanitize(raw) {
  const cfg = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  if (!raw || typeof raw !== 'object') return cfg;

  if (Array.isArray(raw.hotkeys) && raw.hotkeys.every((h) => typeof h === 'string')) {
    cfg.hotkeys = raw.hotkeys.slice(0, 8);
  }
  if (Array.isArray(raw.hotkeyFallbacks) && raw.hotkeyFallbacks.every((h) => typeof h === 'string')) {
    cfg.hotkeyFallbacks = raw.hotkeyFallbacks.slice(0, 8);
  }
  cfg.maxResults = clampNumber(raw.maxResults, 5, 200, DEFAULT_CONFIG.maxResults);

  if (Array.isArray(raw.indexedRoots) && raw.indexedRoots.every((r) => typeof r === 'string')) {
    cfg.indexedRoots = raw.indexedRoots.slice(0, 64);
  } else {
    cfg.indexedRoots = null;
  }
  if (Array.isArray(raw.excludedDirs)) {
    cfg.excludedDirs = raw.excludedDirs.filter((d) => typeof d === 'string').slice(0, 256);
  }

  const qa = raw.quickActions;
  if (qa && typeof qa === 'object') {
    cfg.quickActions.calculator = qa.calculator !== false;
    cfg.quickActions.unitConvert = qa.unitConvert !== false;
    cfg.quickActions.webSearch = qa.webSearch !== false;
    if (typeof qa.webSearchEngine === 'string' && /^https:\/\/.+%s/.test(qa.webSearchEngine)) {
      cfg.quickActions.webSearchEngine = qa.webSearchEngine;
    }
  }

  const cb = raw.clipboard;
  if (cb && typeof cb === 'object') {
    cfg.clipboard.enabled = cb.enabled !== false;
    cfg.clipboard.maxEntries = clampNumber(cb.maxEntries, 1, 500, DEFAULT_CONFIG.clipboard.maxEntries);
    cfg.clipboard.maxTextChars = clampNumber(cb.maxTextChars, 100, 200000, DEFAULT_CONFIG.clipboard.maxTextChars);
    cfg.clipboard.retainAcrossRestarts = cb.retainAcrossRestarts !== false;
  }

  if (Array.isArray(raw.snippets)) {
    cfg.snippets = raw.snippets
      .filter((s) => s && typeof s.trigger === 'string' && typeof s.body === 'string')
      .slice(0, 500)
      .map((s) => ({
        id: typeof s.id === 'string' ? s.id : String(Date.now()) + Math.random().toString(36).slice(2),
        trigger: s.trigger.slice(0, 64),
        body: s.body.slice(0, 20000),
      }));
  }

  return cfg;
}

let current = null;

function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    current = sanitize(raw);
  } catch {
    current = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
  return current;
}

function getConfig() {
  if (!current) loadConfig();
  return current;
}

function writeAtomic(file, contents) {
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, contents, 'utf8');
  fs.renameSync(tmp, file);
}

function saveConfig() {
  try { writeAtomic(configPath(), JSON.stringify(current, null, 2)); } catch { /* non-fatal */ }
}

// Shallow-merges a patch into the current config (one level deep for known
// object fields), sanitizes the result, persists it, and returns it.
function updateConfig(patch) {
  const merged = { ...current, ...patch };
  for (const key of ['quickActions', 'clipboard']) {
    if (patch && patch[key] && typeof patch[key] === 'object') {
      merged[key] = { ...current[key], ...patch[key] };
    }
  }
  current = sanitize(merged);
  saveConfig();
  return current;
}

module.exports = { loadConfig, getConfig, updateConfig, DEFAULT_CONFIG, configPath, writeAtomic };
