// Usage-based ranking boost ("frecency" = frequency + recency).
// Persisted at %APPDATA%\lumos-search\frecency.json, written atomically and
// debounced so a launch storm doesn't hammer disk with full-file rewrites.

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { writeAtomic } = require('./config');

let entries = {};
let saveTimer = null;

function frecencyPath() {
  return path.join(app.getPath('userData'), 'frecency.json');
}

function loadFrecency() {
  try {
    const raw = JSON.parse(fs.readFileSync(frecencyPath(), 'utf8'));
    entries = (raw && typeof raw.entries === 'object' && raw.entries) ? raw.entries : {};
  } catch {
    entries = {};
  }
  return entries;
}

function saveFrecencyNow() {
  try { writeAtomic(frecencyPath(), JSON.stringify({ version: 1, entries }, null, 2)); } catch { /* non-fatal */ }
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
  entries[p] = { count: (prev && prev.count || 0) + 1, lastUsed: Date.now() };
  saveFrecencyDebounced();
}

function resetFrecency() {
  entries = {};
  saveFrecencyDebounced();
}

// Bounded bonus: log-scaled frequency + 30-day recency decay. Capped well
// below the gap between adjacent scoring tiers in providers/files.js (exact
// 1000 / prefix 880 / word-boundary 720) so this reorders within a tier
// instead of letting a barely-related fuzzy hit outrank an exact match.
function frecencyBoost(p) {
  const e = entries[p];
  if (!e) return 0;
  const ageDays = (Date.now() - e.lastUsed) / 86400000;
  const recencyFactor = Math.max(0, 1 - ageDays / 30);
  const freqFactor = Math.min(Math.log2(e.count + 1), 6);
  return Math.round(freqFactor * 8 + recencyFactor * 40);
}

module.exports = { loadFrecency, recordLaunch, resetFrecency, frecencyBoost, flushFrecency };
