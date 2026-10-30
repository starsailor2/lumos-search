const { parentPort } = require('worker_threads');
const path = require('path');
const { search } = require('./providers/files');
const empty = () => ({ paths: [], names: [], flags: [], parents: [], byPath: new Map(), parentPaths: new Map(), count: 0, filtered: true });
let index = empty();
let staging = empty();
let usage = { entries: {}, entriesByBase: {} };
function add(target, items) {
  for (const [p, flag] of items) {
    const key = path.normalize(p).toLowerCase();
    const at = target.byPath.get(key);
    const name = path.basename(p).replace(flag === 2 ? /\.(lnk|url|appref-ms)$/i : /$^/, '').toLowerCase();
    if (at !== undefined) { if (flag === 2) { target.flags[at] = flag; target.names[at] = name; } continue; }
    target.byPath.set(key, target.paths.length);
    target.paths.push(p); target.names.push(name); target.flags.push(flag);
    const parent = path.dirname(p).toLowerCase();
    if (!target.parentPaths.has(parent)) target.parentPaths.set(parent, parent);
    target.parents.push(target.parentPaths.get(parent));
  }
  target.count = target.paths.length;
}
const under = (p, root) => p === root || p.startsWith(root.endsWith(path.sep) ? root : root + path.sep);
function score(entry) {
  return entry ? Math.round(Math.min(Math.log2(entry.count + 1), 6) * 8 + Math.max(0, 1 - (Date.now() - entry.lastUsed) / 86400000 / 30) * 40) : 0;
}
parentPort.on('message', async (message) => {
  try {
    if (message.type === 'begin') staging = empty();
    else if (message.type === 'add') add(message.staging ? staging : index, message.items);
    else if (message.type === 'commit') { index = staging; staging = empty(); }
    else if (message.type === 'usage') usage = message.usage;
    else if (message.type === 'remove') {
      const roots = message.roots.map((p) => path.normalize(p).toLowerCase());
      const unreadable = (message.unreadable || []).map((p) => path.normalize(p).toLowerCase());
      const next = empty();
      for (let i = 0; i < index.count; i++) {
        const p = index.paths[i].toLowerCase();
        if (!roots.some((root) => under(p, root)) || unreadable.some((root) => under(p, root))) {
          next.byPath.set(path.normalize(index.paths[i]).toLowerCase(), next.paths.length);
          next.paths.push(index.paths[i]); next.names.push(index.names[i]); next.flags.push(index.flags[i]); next.parents.push(index.parents[i]);
          next.parentPaths.set(index.parents[i], index.parents[i]);
        }
      }
      next.count = next.paths.length;
      index = next;
    } else if (message.type === 'search') {
      const results = await search({ ...message, idx: index, frecencyBoost: (p) => Object.hasOwn(usage.entries, p) ? score(usage.entries[p]) :
        Math.round(score(usage.entriesByBase[path.basename(p).toLowerCase()]) * 0.5) });
      parentPort.postMessage({ id: message.id, results });
    }
  } catch (error) { if (message.id) parentPort.postMessage({ id: message.id, error: error.message }); }
});
