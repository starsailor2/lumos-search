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
    if (raw && typeof raw === 'object') data = { ...data, ...raw };
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
  data.searches[key] = (data.searches[key] || 0) + 1;
  data.totalSearches++;
  saveDebounced();
}

function recordOpen(path) {
  if (!path) return;
  data.opens[path] = (data.opens[path] || 0) + 1;
  saveDebounced();
}

function getTopSearches(n) {
  return Object.entries(data.searches)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n || 10)
    .map(([q, count]) => ({ query: q, count }));
}

module.exports = { loadAnalytics, recordSearch, recordOpen, getTopSearches };
