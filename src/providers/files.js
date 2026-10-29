// Files/folders/apps provider — the original index scan + scoring logic,
// wrapped to emit the unified Result shape shared across all providers.
//
// Matching model:
//   - Name tiers: exact > stem exact > prefix > word-boundary > substring > fuzzy
//   - Noise barrier: strictly eliminates virtual envs, package folders, and build noise
//   - Parent matching: a token that misses the name can match the folder the
//     entry lives in, at a lower tier — so "lumos" surfaces files inside
//     lumos-search, and "lumos main" pins it down to main.js.
//   - Multi-token: every whitespace-separated token must match the name or
//     the parent path. Scores add up, so more matched tokens rank higher.
//   - Cancellable search slices and bounded result collection keep typing responsive.

const { computeMatchRanges } = require('../search-index');

// Hard barrier: paths traversing virtual environments, package managers, and build artifacts
const NOISE_PATH_REGEX = /[\\/](\.venv|venv|env|\.env|virtualenv|\.virtualenvs|\.conda|conda-env|site-packages|dist-packages|node_modules|bower_components|__pycache__|\.pytest_cache|\.mypy_cache|\.ruff_cache|\.tox|\.nox|\.eggs|pip-wheel-metadata|\.git|\.next|\.nuxt|\.turbo|\.cargo|\.rustup|\.gradle|\.m2|\.nuget|obj|cmake-build-debug|cmake-build-release|\.vs|\.idea|ipch)[\\/]/i;

// High-value user roots that receive a priority relevance boost
const USER_ROOTS_REGEX = /[\\/](Desktop|Downloads|Documents|Pictures|Videos|Music)[\\/]/i;

function isSubsequence(q, s) {
  let at = -1;
  for (const character of q) {
    at = s.indexOf(character, at + 1);
    if (at < 0) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Score a single token against an entry name. Returns -1 when no match.
// ---------------------------------------------------------------------------
function nameScore(name, q) {
  if (name === q) return 1000;
  const dot = name.lastIndexOf('.');
  if (dot > 0 && name.slice(0, dot) === q) return 980; // Stem exact match (e.g. "gate" for "gate.pdf")
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
function scoreEntry(idx, i, q, pathMode, frecencyBoost, queryTokens, allowNoise = false, cachedParentScore) {
  const p = idx.paths[i];

  // Hard barrier: noise directory rejection unless user is in explicit path navigation mode
  if (!idx.filtered && !allowNoise && idx.flags[i] !== 2 && !pathMode && NOISE_PATH_REGEX.test(p)) return -1;

  const name = idx.names[i];
  let s;

  const tokens = queryTokens || ((q.indexOf(' ') >= 0) ? q.split(/\s+/).filter(Boolean) : null);

  if (tokens && tokens.length > 1) {
    // Multi-token: every token must match the name or the parent path.
    let parentLower = null;
    let total = 0;
    for (let t = 0; t < tokens.length; t++) {
      const tok = tokens[t];
      let ts = nameScore(name, tok);
      if (ts < 0) {
        if (!cachedParentScore && parentLower === null) parentLower = parentOf(p);
        const ps = cachedParentScore ? cachedParentScore(i, tok) : parentScore(parentLower, tok);
        if (ps >= 0) {
          ts = Math.round(ps * 0.7); // name match beats folder match
        } else if (pathMode && p.toLowerCase().includes(tok)) {
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
      const ps = cachedParentScore ? cachedParentScore(i, tok) : parentScore(parentOf(p), tok);
      if (ps >= 0) s = ps;
      else if (pathMode && p.toLowerCase().includes(tok)) s = 300;
    }
  }

  if (s < 0) return -1;

  // Post-processing: apps (+320), folders (+180), files (+150)
  const f = idx.flags[i];
  if (f === 2) s += 320;
  else if (f === 1) s += 180;
  else if (f === 0) s += 150;

  // High-value user location boost (Desktop, Downloads, Documents, Pictures, Videos, Music)
  if (USER_ROOTS_REGEX.test(p)) {
    s += 80;
  }

  // Progressive depth penalty: shallow root paths have 0 penalty; deep sub-paths are penalized
  const depth = (p.match(/[\\\/]/g) || []).length;
  if (depth > 4) {
    s -= Math.min((depth - 4) * 12, 120);
  }

  if (frecencyBoost) s += frecencyBoost(p);
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
  return p.slice(Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/')) + 1);
}

let searchGeneration = 0;

async function search(ctx) {
  // Snapshot arrays so a completed background refresh cannot mix two indexes.
  const idx = { ...ctx.idx };
  const { qLower: q, frecencyBoost } = ctx;
  const browse = ['apps', 'app', 'files', 'file', 'folders', 'folder'].includes(ctx.scope);
  if (!q && !browse) return [];
  const generation = ++searchGeneration;
  const pathMode = q.includes('\\') || q.includes('/');
  const appsFirst = Boolean(q) && !ctx.scope && !pathMode;
  const hits = [];
  const tokens = q.split(/\s+/).filter(Boolean);
  const limit = ctx.config?.maxResults || 40;
  const scopeFlag = ['apps', 'app'].includes(ctx.scope) ? 2 : ['folders', 'folder'].includes(ctx.scope) ? 1 : ['files', 'file'].includes(ctx.scope) ? 0 : null;
  const parentScores = new Map();
  const cachedParentScore = (i, token) => {
    const parent = idx.parents?.[i] ?? parentOf(idx.paths[i]);
    let scores = parentScores.get(parent);
    if (!scores) { scores = new Map(); parentScores.set(parent, scores); }
    if (!scores.has(token)) scores.set(token, parentScore(parent, token));
    return scores.get(token);
  };

  // Name-only bigrams omit valid ancestor and fuzzy matches. Scan in short,
  // cancellable slices and keep only the best results, with bounded memory.
  for (let start = 0; start < idx.count; start += 1000) {
    if (generation !== searchGeneration) return [];
    for (let i = start; i < Math.min(start + 1000, idx.count); i++) {
      if (scopeFlag !== null && idx.flags[i] !== scopeFlag) continue;
      const baseScore = q ? scoreEntry(idx, i, q, pathMode, frecencyBoost, tokens, Boolean(ctx.config?.skipDirs?.length), cachedParentScore) :
        (idx.flags[i] === 2 ? 640 : 300) + (frecencyBoost?.(idx.paths[i]) || 0);
      if (baseScore <= 0) continue;
      const s = baseScore + ((ctx.learnedIntent?.id === idx.paths[i] || ctx.learnedIntent?.path === idx.paths[i]) ? 450 : 0);
      if (s <= 0) continue;
      const priority = appsFirst && idx.flags[i] === 2 ? 1 : 0;
      let at = hits.length;
      while (at > 0 && (hits[at - 1][3] < priority || (hits[at - 1][3] === priority && hits[at - 1][0] < s))) at--;
      if (at >= limit) continue;
      hits.splice(at, 0, [s, i, baseScore, priority]);
      if (hits.length > limit) hits.pop();
    }
    if (start + 1000 < idx.count) await new Promise((resolve) => setImmediate(resolve));
  }

  const results = [];
  for (let k = 0; k < hits.length; k++) {
    const [, i, s] = hits[k];
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

module.exports = {
  search,
  scoreEntry,
  isSubsequence,
  nameScore,
  parentOf,
  parentScore,
  NOISE_PATH_REGEX,
  USER_ROOTS_REGEX,
};
