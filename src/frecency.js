// Usage-based ranking boost ("frecency" = frequency + recency).
// Persisted at %APPDATA%\lumos-search\frecency.json, written atomically and
// debounced so a launch storm doesn't hammer disk with full-file rewrites.

const fs = require('fs');
const path = require('path');
let app;
try { ({ app } = require('electron')); } catch { /* not running under electron (tests) */ }
const { writeAtomic } = require('./config');

let entries = {};
const entriesByBase = new Map();
const MAX_BASE_ENTRIES = 10000;
let saveTimer = null;

function frecencyPath() {
  if (app && app.getPath) return path.join(app.getPath('userData'), 'frecency.json');
  return path.join(process.cwd(), 'frecency.json');
}

function updateBaseEntry(base, entry) {
  if (entriesByBase.has(base)) {
    entriesByBase.delete(base);
  } else if (entriesByBase.size >= MAX_BASE_ENTRIES) {
    const oldest = entriesByBase.keys().next().value;
    entriesByBase.delete(oldest);
  }
  entriesByBase.set(base, entry);
}

function loadFrecency() {
  try {
    const raw = JSON.parse(fs.readFileSync(frecencyPath(), 'utf8'));
    entries = (raw && typeof raw.entries === 'object' && raw.entries) ? raw.entries : {};
    entriesByBase.clear();
    if (raw && raw.entriesByBase && typeof raw.entriesByBase === 'object') {
      for (const [k, v] of Object.entries(raw.entriesByBase)) {
        updateBaseEntry(k, v);
      }
    } else {
      for (const [p, e] of Object.entries(entries)) {
        updateBaseEntry(path.basename(p).toLowerCase(), e);
      }
    }
  } catch {
    entries = {};
    entriesByBase.clear();
  }
  return entries;
}

function saveFrecencyNow() {
  try {
    const baseObj = {};
    for (const [k, v] of entriesByBase.entries()) {
      baseObj[k] = v;
    }
    writeAtomic(frecencyPath(), JSON.stringify({ version: 1, entries, entriesByBase: baseObj }, null, 2));
  } catch { /* non-fatal */ }
}

function saveFrecencyDebounced() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveFrecencyNow, 2000);
}

function flushFrecency() {
  clearTimeout(saveTimer);
  saveFrecencyNow();
}

function recordLaunch(p) {
  if (typeof p !== 'string' || !p) return;
  const prev = entries[p];
  const entry = { count: (prev && prev.count || 0) + 1, lastUsed: Date.now() };
  entries[p] = entry;

  const base = path.basename(p).toLowerCase();
  updateBaseEntry(base, entry);

  saveFrecencyDebounced();
}

function resetFrecency() {
  entries = {};
  entriesByBase.clear();
  saveFrecencyDebounced();
}

function calcScore(e) {
  const ageDays = (Date.now() - e.lastUsed) / 86400000;
  const recencyFactor = Math.max(0, 1 - ageDays / 30);
  const freqFactor = Math.min(Math.log2(e.count + 1), 6);
  return Math.round(freqFactor * 8 + recencyFactor * 40);
}

// Bounded bonus: log-scaled frequency + 30-day recency decay. Capped well
// below the gap between adjacent scoring tiers in providers/files.js (exact
// 1000 / prefix 880 / word-boundary 720) so this reorders within a tier
// instead of letting a barely-related fuzzy hit outrank an exact match.
// Checks exact path first, then basename match with half weight.
function frecencyBoost(p) {
  const e = entries[p];
  if (e) return calcScore(e);
  if (typeof p === 'string' && p) {
    const base = path.basename(p).toLowerCase();
    const eb = entriesByBase.get(base);
    if (eb) {
      updateBaseEntry(base, eb); // refresh LRU
      return Math.round(calcScore(eb) * 0.5); // half weight
    }
  }
  return 0;
}

function getTopRecents(limit) {
  const list = Object.entries(entries)
    .map(([p, e]) => ({
      path: p,
      score: calcScore(e),
      lastUsed: e.lastUsed,
    }))
    .sort((a, b) => b.lastUsed - a.lastUsed)
    .slice(0, limit || 8);
  return list;
}

module.exports = {
  loadFrecency,
  recordLaunch,
  resetFrecency,
  frecencyBoost,
  flushFrecency,
  getTopRecents,
  entriesByBase,
};
