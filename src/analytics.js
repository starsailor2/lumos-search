// Local-only search analytics — most searched terms and opens.

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { writeAtomic } = require('./config');

let data = { searches: {}, opens: {}, totalSearches: 0 };
let saveTimer = null;

function analyticsPath() {
  return path.join(app.getPath('userData'), 'analytics.json');
}

function loadAnalytics() {
  try {
    const raw = JSON.parse(fs.readFileSync(analyticsPath(), 'utf8'));
    if (raw && typeof raw === 'object') data = {
      searches: Object.fromEntries(Object.entries(raw.searches || {}).filter(([, n]) => Number.isFinite(n)).slice(-2000)),
      opens: Object.fromEntries(Object.entries(raw.opens || {}).filter(([, n]) => Number.isFinite(n)).slice(-10000)),
      totalSearches: Number.isFinite(raw.totalSearches) ? raw.totalSearches : 0,
    };
  } catch { /* fresh */ }
}

function saveDebounced() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { writeAtomic(analyticsPath(), JSON.stringify(data, null, 2)); } catch { /* ignore */ }
  }, 3000);
}

function recordSearch(query) {
  if (!query || query.length < 2) return;
  const key = query.toLowerCase().slice(0, 100);
  const count = Object.hasOwn(data.searches, key) ? data.searches[key] : 0;
  Object.defineProperty(data.searches, key, { value: count + 1, enumerable: true, writable: true, configurable: true });
  const keys = Object.keys(data.searches);
  if (keys.length > 2000) delete data.searches[keys[0]];
  data.totalSearches++;
  saveDebounced();
}

function recordOpen(path) {
  if (!path) return;
  data.opens[path] = (data.opens[path] || 0) + 1;
  const keys = Object.keys(data.opens);
  if (keys.length > 10000) delete data.opens[keys[0]];
  saveDebounced();
}

function getTopSearches(n) {
  return Object.entries(data.searches)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n || 10)
    .map(([q, count]) => ({ query: q, count }));
}

function clearAnalytics() {
  clearTimeout(saveTimer);
  data = { searches: {}, opens: {}, totalSearches: 0 };
  writeAtomic(analyticsPath(), JSON.stringify(data));
}

function flushAnalytics() {
  clearTimeout(saveTimer);
  try { writeAtomic(analyticsPath(), JSON.stringify(data)); } catch { /* non-fatal on exit */ }
}

module.exports = { loadAnalytics, recordSearch, recordOpen, getTopSearches, clearAnalytics, flushAnalytics };
