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
  skipDirs: [],         // if non-empty, replaces the built-in SKIP_DIRS list
  refresh: {
    hotMinutes: 5,      // interval for re-scanning user folders (Desktop, Documents, etc.)
    fullHours: 1,       // interval for full background re-crawl (idle gated)
  },
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
  favourites: [], // { path, title?, kind? }
  quicklinks: [], // { id, keyword, title, url }
  workflows: [], // { id, name, trigger?, steps: [{ action, data }] }
  appearance: {
    theme: 'system', // dark | light | system
    accentColor: '#4ea1ff',
    glassBlur: 40,
    animations: true,
  },
  ai: {
    enabled: false,
    apiKey: '',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
  },
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
  if (Array.isArray(raw.skipDirs)) {
    cfg.skipDirs = raw.skipDirs.filter((d) => typeof d === 'string').slice(0, 256);
  }

  const rf = raw.refresh;
  if (rf && typeof rf === 'object') {
    cfg.refresh.hotMinutes = clampNumber(rf.hotMinutes, 1, 60, DEFAULT_CONFIG.refresh.hotMinutes);
    cfg.refresh.fullHours = clampNumber(rf.fullHours, 0.25, 24, DEFAULT_CONFIG.refresh.fullHours);
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

  if (Array.isArray(raw.favourites)) {
    cfg.favourites = raw.favourites
      .filter((f) => f && typeof f.path === 'string')
      .slice(0, 100)
      .map((f) => ({
        path: f.path,
        title: typeof f.title === 'string' ? f.title.slice(0, 200) : undefined,
        kind: typeof f.kind === 'string' ? f.kind : 'file',
      }));
  }

  if (Array.isArray(raw.quicklinks)) {
    cfg.quicklinks = raw.quicklinks
      .filter((l) => l && typeof l.url === 'string')
      .slice(0, 200)
      .map((l) => ({
        id: typeof l.id === 'string' ? l.id : String(Date.now()) + Math.random().toString(36).slice(2),
        keyword: typeof l.keyword === 'string' ? l.keyword.slice(0, 32) : '',
        title: typeof l.title === 'string' ? l.title.slice(0, 200) : '',
        url: l.url.slice(0, 2000),
      }));
  }

  if (Array.isArray(raw.workflows)) {
    cfg.workflows = raw.workflows
      .filter((w) => w && typeof w.name === 'string')
      .slice(0, 50)
      .map((w) => ({
        id: typeof w.id === 'string' ? w.id : String(Date.now()) + Math.random().toString(36).slice(2),
        name: w.name.slice(0, 100),
        trigger: typeof w.trigger === 'string' ? w.trigger.slice(0, 32) : '',
        steps: Array.isArray(w.steps) ? w.steps.slice(0, 20) : [],
      }));
  }

  const app = raw.appearance;
  if (app && typeof app === 'object') {
    if (['dark', 'light', 'system'].includes(app.theme)) cfg.appearance.theme = app.theme;
    if (typeof app.accentColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(app.accentColor)) {
      cfg.appearance.accentColor = app.accentColor;
    }
    cfg.appearance.glassBlur = clampNumber(app.glassBlur, 0, 80, DEFAULT_CONFIG.appearance.glassBlur);
    cfg.appearance.animations = app.animations !== false;
  }

  const ai = raw.ai;
  if (ai && typeof ai === 'object') {
    cfg.ai.enabled = ai.enabled === true;
    if (typeof ai.apiKey === 'string') cfg.ai.apiKey = ai.apiKey.slice(0, 500);
    if (typeof ai.endpoint === 'string' && /^https?:\/\//.test(ai.endpoint)) {
      cfg.ai.endpoint = ai.endpoint.slice(0, 500);
    }
    if (typeof ai.model === 'string') cfg.ai.model = ai.model.slice(0, 100);
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
  for (const key of ['quickActions', 'clipboard', 'appearance', 'ai']) {
    if (patch && patch[key] && typeof patch[key] === 'object') {
      merged[key] = { ...current[key], ...patch[key] };
    }
  }
  if (patch && patch.favourites) merged.favourites = patch.favourites;
  if (patch && patch.quicklinks) merged.quicklinks = patch.quicklinks;
  if (patch && patch.workflows) merged.workflows = patch.workflows;
  current = sanitize(merged);
  saveConfig();
  return current;
}

module.exports = { loadConfig, getConfig, updateConfig, DEFAULT_CONFIG, configPath, writeAtomic, sanitize };
