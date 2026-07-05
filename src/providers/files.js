// Files/folders/apps provider — the original index scan + scoring logic,
// wrapped to emit the unified Result shape shared across all providers.

function isSubsequence(q, s) {
  let qi = 0;
  for (let si = 0; si < s.length && qi < q.length; si++) {
    if (s.charCodeAt(si) === q.charCodeAt(qi)) qi++;
  }
  return qi === q.length;
}

function scoreEntry(idx, i, q, pathMode, frecencyBoost) {
  const name = idx.names[i];
  let s = -1;
  if (name === q) s = 1000;
  else if (name.startsWith(q)) s = 880 - Math.min(name.length - q.length, 80);
  else {
    const at = name.indexOf(q);
    if (at > 0) {
      const prev = name[at - 1];
      const boundary = prev === ' ' || prev === '-' || prev === '_' || prev === '.' || prev === '(';
      s = (boundary ? 720 : 520) - Math.min(at, 100);
    } else if (q.length >= 3 && q.length <= 20 && name.length < 80 && isSubsequence(q, name)) {
      s = 220 - Math.min(name.length - q.length, 60);
    } else if (pathMode && idx.paths[i].toLowerCase().includes(q)) {
      s = 300;
    }
  }
  if (s < 0) return -1;
  const f = idx.flags[i];
  if (f === 2) s += 320;               // apps first, Spotlight-style
  else if (f === 0) s += 150;          // files ranked above folders for equivalent matches
  // shallower paths are usually more relevant
  const depth = (idx.paths[i].match(/[\\/]/g) || []).length;
  s -= Math.min(depth * 4, 60);
  if (frecencyBoost) s += frecencyBoost(idx.paths[i]);
  return s;
}

function kindOf(flag) {
  return flag === 2 ? 'app' : flag === 1 ? 'folder' : 'file';
}

function search(ctx) {
  const { idx, qLower: q, frecencyBoost } = ctx;
  if (q.length < 1) return [];
  const pathMode = q.includes('\\') || q.includes('/');
  const hits = [];
  const n = idx.count;
  for (let i = 0; i < n; i++) {
    const s = scoreEntry(idx, i, q, pathMode, frecencyBoost);
    if (s > 0) hits.push([s, i]);
  }
  const results = [];
  for (let k = 0; k < hits.length; k++) {
    const [s, i] = hits[k];
    const p = idx.paths[i];
    const kind = kindOf(idx.flags[i]);
    results.push({
      type: kind,
      id: p,
      title: idx.names[i],
      subtitle: p,
      score: s,
      icon: null,
      actions: ['open', 'reveal'],
      data: { path: p, kind },
    });
  }
  return results;
}

module.exports = { search, scoreEntry, isSubsequence };
