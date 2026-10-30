const fs = require('fs');
const path = require('path');

function watchFolders(onChanges, excluded = () => []) {
  const roots = new Map();
  const watchers = new Map();
  const pending = new Set();
  const attempted = new Set();
  let timer;
  let closed = false;
  const under = (p, root) => p === root || p.startsWith(root.endsWith(path.sep) ? root : root + path.sep);
  const flush = () => {
    timer = null;
    const directories = [...pending].sort((a, b) => a.length - b.length)
      .filter((p, i, all) => !all.slice(0, i).some((parent) => under(p.toLowerCase(), parent.toLowerCase())));
    if (!directories.length) return;
    if (onChanges(directories)) pending.clear();
    else timer = setTimeout(flush, 1000);
  };
  function schedule(directory) {
    if (closed) return;
    pending.add(directory);
    if (!timer) timer = setTimeout(flush, 750);
  }
  function attach() {
    for (const [key, root] of roots) {
      if (watchers.has(key)) continue;
      const reconnecting = attempted.has(key);
      attempted.add(key);
      try {
        const watcher = fs.watch(root, { recursive: true }, (_event, name) => {
          const relative = name ? String(name) : '';
          if (relative.split(/[\\/]/).some((part) => excluded().includes(part.toLowerCase()))) return;
          const candidate = path.resolve(root, relative);
          if (!under(candidate.toLowerCase(), key)) return;
          schedule(pending.size >= 1000 ? root : relative ? path.dirname(candidate) : root);
        });
        watcher.on('error', () => { watcher.close(); watchers.delete(key); schedule(root); });
        watchers.set(key, watcher);
        if (reconnecting) schedule(root);
      } catch { /* Periodic scans remain the fallback for unavailable roots. */ }
    }
  }
  const retry = setInterval(attach, 30000);
  retry.unref();
  return {
    setRoots(locations) {
      const sorted = [...new Set(locations.map((p) => path.resolve(p)))].sort((a, b) => a.length - b.length);
      const selected = sorted.filter((p, i) => !sorted.slice(0, i).some((root) => under(p.toLowerCase(), root.toLowerCase())));
      roots.clear();
      for (const root of selected) roots.set(root.toLowerCase(), root);
      for (const [key, watcher] of watchers) if (!roots.has(key)) { watcher.close(); watchers.delete(key); }
      for (const directory of pending) if (![...roots.keys()].some((root) => under(directory.toLowerCase(), root))) pending.delete(directory);
      attach();
    },
    reconcile() { for (const root of roots.values()) schedule(root); attach(); },
    close() { closed = true; clearTimeout(timer); clearInterval(retry); for (const watcher of watchers.values()) watcher.close(); watchers.clear(); pending.clear(); },
  };
}

module.exports = { watchFolders };
