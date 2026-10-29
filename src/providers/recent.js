// Surfaces favourites, recents, and quick actions when query is empty or scoped @recent.

const { getTopRecents } = require('../frecency');
const { listStartApps } = require('./apps');

function basename(p) {
  return p.slice(Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/')) + 1);
}

async function search(ctx) {
  const { q, config, idx } = ctx;
  const isEmpty = !q || q.length < 1;
  const isRecentScope = ['recent', 'recents', 'fav', 'favourites', 'favorites'].includes(ctx.scope);
  if (!isEmpty && !isRecentScope) return [];

  const results = [];

  const favourites = config.favourites || [];
  for (let i = 0; i < favourites.length; i++) {
    const fav = favourites[i];
    if (!fav || !fav.path) continue;
    const title = fav.title || basename(fav.path);
    if (!isEmpty && !title.toLowerCase().includes(q.toLowerCase())) continue;
    results.push({
      type: fav.kind || 'file',
      id: 'fav:' + fav.path,
      title,
      subtitle: 'Favourite · ' + fav.path,
      score: 950 - i,
      icon: null,
      actions: ['open', 'reveal'],
      data: { path: fav.path, kind: fav.kind || 'file' },
      pin: true,
    });
  }

  const recents = ['fav', 'favourites', 'favorites'].includes(ctx.scope) ? [] : getTopRecents(8);
  const registered = recents.some((entry) => entry.path.startsWith('startapp:')) ? await listStartApps() : [];
  for (let i = 0; i < recents.length; i++) {
    const { path: p, score } = recents[i];
    const appId = p.startsWith('startapp:') ? p.slice('startapp:'.length) : null;
    const installedApp = appId ? registered.find((entry) => entry.AppID === appId) : null;
    if (appId && !installedApp) continue;
    const title = installedApp ? installedApp.Name : basename(p);
    if (!isEmpty && !title.toLowerCase().includes(q.toLowerCase())) continue;
    if (favourites.some((f) => f.path === p)) continue;
    let kind = appId ? 'app' : 'file';
    for (let j = 0; j < idx.count; j++) {
      if (idx.paths[j] === p) {
        kind = idx.flags[j] === 2 ? 'app' : idx.flags[j] === 1 ? 'folder' : 'file';
        break;
      }
    }
    results.push({
      type: kind,
      id: 'recent:' + p,
      title,
      subtitle: appId ? 'Recent · Windows application' : 'Recent · ' + p,
      score: 800 + score - i * 5,
      icon: null,
      actions: appId ? ['launch-app'] : ['open', 'reveal'],
      data: appId ? { appId } : { path: p, kind },
    });
  }

  if (isEmpty) {
    results.push({
      type: 'command',
      id: 'cmd:settings',
      title: 'Open Settings',
      subtitle: 'Configure Lumos Search',
      score: 400,
      icon: '⚙️',
      actions: ['open-settings'],
      data: {},
    });
    results.push({
      type: 'command',
      id: 'cmd:rebuild',
      title: 'Rebuild Index',
      subtitle: 'Re-scan all drives for files and apps',
      score: 390,
      icon: '🔄',
      actions: ['rebuild-index'],
      data: {},
    });
    results.push({
      type: 'command',
      id: 'cmd:clipboard',
      title: 'Browse Clipboard History',
      subtitle: 'Type @clip to browse all entries',
      score: 380,
      icon: '📋',
      actions: ['scope-clip'],
      data: {},
    });
  }

  return results;
}

module.exports = { search };
