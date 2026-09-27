// Path intelligence — cd ~/folder navigates to indexed paths in Explorer.

const { shell } = require('electron');

function expandPath(p) {
  if (p.startsWith('~/')) {
    const os = require('os');
    return require('path').join(os.homedir(), p.slice(2));
  }
  return p;
}

function search(ctx) {
  const { q, qLower, idx } = ctx;
  if (!q) return [];
  const results = [];

  const cdMatch = /^(?:cd|goto|nav)\s+(.+)$/i.exec(q.trim());
  if (cdMatch) {
    const target = expandPath(cdMatch[1].trim()).toLowerCase();
    for (let i = 0; i < idx.count; i++) {
      if (idx.flags[i] !== 1) continue;
      const p = idx.paths[i];
      if (p.toLowerCase().endsWith(target) || idx.names[i].includes(target.replace(/\\/g, ''))) {
        results.push({
          type: 'folder',
          id: 'pathnav:' + p,
          title: 'Go to ' + idx.names[i],
          subtitle: 'Navigate · ' + p,
          score: 750,
          icon: '📂',
          actions: ['reveal'],
          data: { path: p, kind: 'folder' },
        });
        if (results.length >= 5) break;
      }
    }
  }

  if (qLower.startsWith('cd ')) return results;

  return results;
}

module.exports = { search, expandPath };
