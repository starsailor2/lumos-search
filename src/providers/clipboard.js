// Clipboard history (text-only in v1) + user-defined snippets.
//
// Privacy note: this is the first feature that persists user *content*
// beyond the app's own file index. It captures plain text only (no images),
// is on by default but can be disabled entirely from Settings or the tray
// menu in one click, caps how much it retains, and — if the user turns off
// "retain across restarts" — never touches disk at all. There is no reliable
// way to detect password-manager copies from a sandboxed Electron renderer,
// so that residual risk is documented rather than silently claimed as solved.

const fs = require('fs');
const path = require('path');
const { app, clipboard } = require('electron');
const { writeAtomic } = require('../config');

const POLL_MS = 800;

let history = []; // [{ id, text, ts }], newest first
let lastSeen = '';
let pollTimer = null;
let saveTimer = null;
let enabledCache = true;

function historyPath() {
  return path.join(app.getPath('userData'), 'clipboard-history.json');
}

function loadHistory() {
  try {
    const raw = JSON.parse(fs.readFileSync(historyPath(), 'utf8'));
    if (Array.isArray(raw && raw.entries)) history = raw.entries;
  } catch { /* no history yet */ }
}

function saveHistoryNow() {
  try { writeAtomic(historyPath(), JSON.stringify({ version: 1, entries: history }, null, 2)); } catch { /* non-fatal */ }
}

function saveHistoryDebounced() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveHistoryNow, 1500);
}

function clearPersistedHistory() {
  try { fs.unlinkSync(historyPath()); } catch { /* fine if absent */ }
}

function pollClipboard(getConfig) {
  const cfg = getConfig().clipboard;
  if (!cfg.enabled) return;
  let text;
  try { text = clipboard.readText(); } catch { return; }
  if (!text || text === lastSeen) return;
  lastSeen = text;
  const truncated = text.length > cfg.maxTextChars ? text.slice(0, cfg.maxTextChars) : text;
  history.unshift({ id: 'clip:' + Date.now() + ':' + Math.random().toString(36).slice(2), text: truncated, ts: Date.now() });
  if (history.length > cfg.maxEntries) history.length = cfg.maxEntries;
  if (cfg.retainAcrossRestarts) saveHistoryDebounced();
}

function startClipboardWatch(getConfig) {
  loadHistory();
  if (pollTimer) return;
  pollTimer = setInterval(() => pollClipboard(getConfig), POLL_MS);
}

// If the user disables retention, drop whatever was persisted so it doesn't
// linger on disk after the user opted out.
function applyRetentionChange(cfg) {
  if (!cfg.clipboard.retainAcrossRestarts) clearPersistedHistory();
}

function firstLine(text) {
  const nl = text.indexOf('\n');
  return (nl === -1 ? text : text.slice(0, nl)).slice(0, 120);
}

function relativeTime(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.round(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.round(h / 24) + 'd ago';
}

function search(ctx) {
  const { q, qLower, config } = ctx;
  const results = [];

  if (config.clipboard.enabled) {
    for (let i = 0; i < history.length; i++) {
      const entry = history[i];
      const textLower = entry.text.toLowerCase();
      let score = -1;
      if (!q) {
        // Empty query never reaches providers (search() gates on q.length>=1
        // upstream) — kept defensive in case that changes.
        score = 200 - i * 2;
      } else if (textLower.includes(qLower)) {
        score = 250 + Math.max(0, 30 - i); // recent entries rank slightly higher, capped below file fuzzy tier
      }
      if (score < 0) continue;
      results.push({
        type: 'clip',
        id: entry.id,
        title: firstLine(entry.text) || '(empty)',
        subtitle: 'Clipboard · ' + relativeTime(entry.ts),
        score,
        icon: null,
        actions: ['paste', 'copy'],
        data: { text: entry.text },
      });
    }
  }

  for (const snip of config.snippets) {
    if (!q) continue;
    if (snip.trigger.toLowerCase().startsWith(qLower) || qLower.startsWith(snip.trigger.toLowerCase())) {
      results.push({
        type: 'snippet',
        id: 'snippet:' + snip.id,
        title: snip.trigger,
        subtitle: 'Snippet · ' + firstLine(snip.body),
        score: 260,
        icon: null,
        actions: ['paste', 'copy'],
        data: { text: snip.body },
      });
    }
  }

  return results;
}

module.exports = { search, startClipboardWatch, applyRetentionChange, clearPersistedHistory };
