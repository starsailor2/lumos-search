// Lumos Search — Intent Learning Memory
// Learns query-to-selection patterns: when a user types query Q and selects result R,
// Lumos remembers that intent. Next time the user types Q (or a prefix of Q),
// the intended result is awarded a high intent boost to surface directly at #1.

const fs = require('fs');
const path = require('path');
let app;
try { ({ app } = require('electron')); } catch { /* tests / pure node */ }
const { writeAtomic } = require('./config');

let memory = {
  version: 1,
  queries: {}, // normalizedQuery -> { id, path, title, type, count, lastUsed }
};

let saveTimer = null;
const MAX_LEARNED_QUERIES = 2000;

function memoryPath() {
  if (app && app.getPath) return path.join(app.getPath('userData'), 'intent-memory.json');
  return path.join(process.cwd(), 'intent-memory.json');
}

function loadIntentMemory() {
  try {
    const raw = JSON.parse(fs.readFileSync(memoryPath(), 'utf8'));
    if (raw && typeof raw.queries === 'object') {
      memory = {
        version: 1,
        queries: raw.queries,
      };
    }
  } catch {
    memory = { version: 1, queries: {} };
  }
  return memory;
}

function saveMemoryNow() {
  try {
    writeAtomic(memoryPath(), JSON.stringify(memory, null, 2));
  } catch { /* non-fatal */ }
}

function saveMemoryDebounced() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveMemoryNow, 1500);
}

function normalizeQuery(q) {
  return String(q || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Record that for query `q`, the user intended and launched `result`
function recordIntent(rawQuery, result) {
  const q = normalizeQuery(rawQuery);
  if (!q || q.length < 2 || !result || !result.id) return;

  const prev = memory.queries[q];
  const count = (prev && prev.count ? prev.count : 0) + 1;
  const targetPath = (result.data && typeof result.data.path === 'string') ? result.data.path : result.id;

  memory.queries[q] = {
    id: result.id,
    path: targetPath,
    title: result.title || '',
    type: result.type || 'file',
    count,
    lastUsed: Date.now(),
  };

  // Bound memory size (LRU eviction if exceeds limit)
  const keys = Object.keys(memory.queries);
  if (keys.length > MAX_LEARNED_QUERIES) {
    keys.sort((a, b) => memory.queries[a].lastUsed - memory.queries[b].lastUsed);
    const toRemove = keys.slice(0, keys.length - MAX_LEARNED_QUERIES);
    for (const k of toRemove) delete memory.queries[k];
  }

  saveMemoryDebounced();
}

// Retrieve learned intent for query
function getIntent(rawQuery) {
  const q = normalizeQuery(rawQuery);
  if (!q || q.length < 2) return null;

  // 1. Exact query match
  const exact = memory.queries[q];
  if (exact) return exact;

  // 2. Prefix intent check (e.g. user typed "gat" and previously chose for "gate")
  if (q.length >= 3) {
    const keys = Object.keys(memory.queries);
    for (let k = 0; k < keys.length; k++) {
      const storedKey = keys[k];
      if (storedKey.startsWith(q) && storedKey.length <= q.length + 3) {
        return memory.queries[storedKey];
      }
    }
  }

  return null;
}

// Top recent & frequent learned intents (for empty state recommendations)
function getRecentIntents(limit) {
  const list = Object.entries(memory.queries)
    .map(([query, data]) => ({
      query,
      ...data,
    }))
    .sort((a, b) => b.lastUsed - a.lastUsed)
    .slice(0, limit || 6);
  return list;
}

function clearIntentMemory() {
  memory.queries = {};
  saveMemoryDebounced();
}

module.exports = {
  loadIntentMemory,
  recordIntent,
  getIntent,
  getRecentIntents,
  clearIntentMemory,
};
