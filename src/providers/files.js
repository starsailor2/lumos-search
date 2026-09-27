// Files/folders/apps provider — the original index scan + scoring logic,
// wrapped to emit the unified Result shape shared across all providers.
//
// Matching model:
//   - Name tiers: exact > prefix > word-boundary > substring > fuzzy
//   - Parent matching: a token that misses the name can match the folder the
//     entry lives in, at a lower tier — so "lumos" surfaces files inside
//     lumos-search, and "lumos main" pins it down to main.js.
//   - Multi-token: every whitespace-separated token must match the name or
//     the parent path. Scores add up, so more matched tokens rank higher.
//   - Fast bigram prefilter: narrows candidate set on large indexes.

const { computeMatchRanges } = require('../search-index');

function isSubsequence(q, s) {
  let qi = 0;
  for (let si = 0; si < s.length && qi < q.length; si++) {
    if (s.charCodeAt(si) === q.charCodeAt(qi)) qi++;
  }
  return qi === q.length;
}

// ---------------------------------------------------------------------------
// Score a single token against an entry name. Returns -1 when no match.
// ---------------------------------------------------------------------------
function nameScore(name, q) {
  if (name === q) return 1000;
  if (name.startsWith(q)) return 880 - Math.min(name.length - q.length, 80);
  const at = name.indexOf(q);
  if (at > 0) {
    const prev = name[at - 1];
    const boundary = prev === ' ' || prev === '-' || prev === '_' || prev === '.' || prev === '(';
    return (boundary ? 720 : 520) - Math.min(at, 100);
  }
  if (q.length >= 3 && q.length <= 20 && name.length < 80 && isSubsequence(q, name)) {
    return 220 - Math.min(name.length - q.length, 60);
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Lowercased parent path: "c:\dev\lumos-search\src" for "...\src\main.js".
// ---------------------------------------------------------------------------
function parentOf(p) {
  const cut = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
  return cut > 0 ? p.slice(0, cut).toLowerCase() : '';
}

// ---------------------------------------------------------------------------
// Score a single token against the folder structure containing the entry.
// The immediate parent folder ranks highest, then any ancestor in the path.
// Returns -1 when no match.
// ---------------------------------------------------------------------------
function parentScore(parentLower, q) {
  if (!parentLower || q.length < 2) return -1;
  const cut = Math.max(parentLower.lastIndexOf('\\'), parentLower.lastIndexOf('/'));
  const immediate = cut >= 0 ? parentLower.slice(cut + 1) : parentLower;
  if (immediate === q) return 460;
  if (immediate.startsWith(q)) return 430 - Math.min(immediate.length - q.length, 60);
  const at = immediate.indexOf(q);
  if (at > 0) {
    const prev = immediate[at - 1];
    const boundary = prev === ' ' || prev === '-' || prev === '_' || prev === '.' || prev === '(';
    return (boundary ? 400 : 340) - Math.min(at, 60);
  }
  if (q.length >= 3 && parentLower.includes(q)) return 260;
  return -1;
}

// ---------------------------------------------------------------------------
// Core scoring function for a single entry against query q.
// ---------------------------------------------------------------------------
function scoreEntry(idx, i, q, pathMode, frecencyBoost) {
  const name = idx.names[i];
  let s;

  const tokens = (q.indexOf(' ') >= 0) ? q.split(/\s+/).filter(Boolean).slice(0, 8) : null;

  if (tokens && tokens.length > 1) {
    // Multi-token: every token must match the name or the parent path.
    let parentLower = null;
    let total = 0;
    for (let t = 0; t < tokens.length; t++) {
      const tok = tokens[t];
      if (tok.length > 32) return -1;
      let ts = nameScore(name, tok);
      if (ts < 0) {
        if (parentLower === null) parentLower = parentOf(idx.paths[i]);
        const ps = parentScore(parentLower, tok);
        if (ps >= 0) {
          ts = Math.round(ps * 0.7); // name match beats folder match
        } else if (pathMode && idx.paths[i].toLowerCase().includes(tok)) {
          ts = 200;
        } else {
          return -1; // every token must match somewhere
        }
      }
      total += ts;
    }
    s = total - 40 * (tokens.length - 1);
  } else {
    const tok = tokens && tokens.length === 1 ? tokens[0] : q;
    s = nameScore(name, tok);
    if (s < 0) {
      const ps = parentScore(parentOf(idx.paths[i]), tok);
      if (ps >= 0) s = ps;
      else if (pathMode && idx.paths[i].toLowerCase().includes(tok)) s = 300;
    }
  }

  if (s < 0) return -1;

  // Post-processing: apps (+320), folders (+180), files (+150)
  const f = idx.flags[i];
  if (f === 2) s += 320;
  else if (f === 1) s += 180;
  else if (f === 0) s += 150;

  // Shallower paths are usually more relevant
  const depth = (idx.paths[i].match(/[\\\/]/g) || []).length;
  s -= Math.min(depth * 4, 60);

  if (frecencyBoost) s += frecencyBoost(idx.paths[i]);
  return s;
}

function kindOf(flag) {
  return flag === 2 ? 'app' : flag === 1 ? 'folder' : 'file';
}

function displayTitle(idx, i) {
  const p = idx.paths[i];
  const f = idx.flags[i];
  if (f === 2) {
    const base = p.slice(Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/')) + 1);
    return base.replace(/\.(lnk|url|appref-ms)$/i, '');
  }
  return idx.names[i];
}

// ---------------------------------------------------------------------------
// Bigram prefilter: selects candidate entry indices using idx.bigrams.
// Falls back to null (triggering full scan) if the index is missing or any
// needed bigram is absent.
// ---------------------------------------------------------------------------
function getCandidates(idx, q, pathMode) {
  if (!idx.bigrams || pathMode) return null;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;

  // Select candidates for each token of length >= 2
  const tokenCandidateSets = [];
  for (const token of tokens) {
    if (token.length < 2) continue;
    const bgs = [];
    for (let j = 0; j < token.length - 1; j++) {
      bgs.push(token.slice(j, j + 2));
    }
    let allExist = true;
    const lists = [];
    for (const bg of bgs) {
      const list = idx.bigrams.get(bg);
      if (!list || !list.length) {
        allExist = false;
        break;
      }
      lists.push(list);
    }
    if (!allExist) {
      // If any needed bigram is absent in the index, fall back to full scan
      return null;
    }

    // Intersect the 3 rarest bigrams of the token
    lists.sort((a, b) => a.length - b.length);
    const rarest = lists.slice(0, 3);
    let set = new Set(rarest[0]);
    for (let k = 1; k < rarest.length; k++) {
      const next = new Set(rarest[k]);
      for (const id of set) {
        if (!next.has(id)) set.delete(id);
      }
      if (!set.size) break;
    }
    tokenCandidateSets.push(set);
  }

  if (!tokenCandidateSets.length) return null;

  if (tokenCandidateSets.length === 1) {
    return tokenCandidateSets[0];
  }

  // Multi-token: union candidates so entries matching any token's name are included
  const union = new Set();
  for (const s of tokenCandidateSets) {
    for (const id of s) union.add(id);
  }
  return union;
}

function search(ctx) {
  const { idx, qLower: q, frecencyBoost } = ctx;
  if (!q || q.length < 1) return [];
  const pathMode = q.includes('\\') || q.includes('/');
  const hits = [];

  const candidates = getCandidates(idx, q, pathMode);

  if (candidates && candidates.size > 0) {
    for (const i of candidates) {
      const s = scoreEntry(idx, i, q, pathMode, frecencyBoost);
      if (s > 0) hits.push([s, i]);
    }
  } else if (!candidates) {
    const n = idx.count;
    for (let i = 0; i < n; i++) {
      const s = scoreEntry(idx, i, q, pathMode, frecencyBoost);
      if (s > 0) hits.push([s, i]);
    }
  }

  const results = [];
  for (let k = 0; k < hits.length; k++) {
    const [s, i] = hits[k];
    const p = idx.paths[i];
    const kind = kindOf(idx.flags[i]);
    const title = displayTitle(idx, i);
    results.push({
      type: kind,
      id: p,
      title,
      subtitle: p,
      score: s,
      icon: null,
      actions: ['open', 'reveal'],
      data: { path: p, kind },
      matchRanges: computeMatchRanges(title.toLowerCase(), q),
    });
  }
  return results;
}

module.exports = { search, scoreEntry, isSubsequence, nameScore, parentOf, parentScore };
