// Prefix trie + inverted word index for sub-16ms file search on large indexes.
// Built atomically when the file index swaps; queried by providers/files.js.

function tokenize(name) {
  return name.split(/[\s\-_.()]+/).filter((w) => w.length > 0);
}

function buildSearchIndex(idx) {
  const exact = new Map();
  const prefixBuckets = new Map();
  const wordIndex = new Map();
  const n = idx.count;

  for (let i = 0; i < n; i++) {
    const name = idx.names[i];

    let list = exact.get(name);
    if (!list) { list = []; exact.set(name, list); }
    list.push(i);

    const bucket = name.length >= 3 ? name.slice(0, 3) : name;
    let bl = prefixBuckets.get(bucket);
    if (!bl) { bl = []; prefixBuckets.set(bucket, bl); }
    bl.push(i);

    const words = tokenize(name);
    for (let w = 0; w < words.length; w++) {
      const word = words[w];
      let wl = wordIndex.get(word);
      if (!wl) { wl = []; wordIndex.set(word, wl); }
      wl.push(i);
    }
  }

  return { exact, prefixBuckets, wordIndex, count: n };
}

function intersectSets(sets) {
  if (!sets.length) return new Set();
  sets.sort((a, b) => a.size - b.size);
  const result = new Set(sets[0]);
  for (let s = 1; s < sets.length; s++) {
    for (const v of result) {
      if (!sets[s].has(v)) result.delete(v);
    }
    if (!result.size) break;
  }
  return result;
}

function bucketCandidates(index, q) {
  const out = new Set();
  const bucket = q.length >= 3 ? q.slice(0, 3) : q;
  const list = index.prefixBuckets.get(bucket);
  if (list) {
    for (let i = 0; i < list.length; i++) out.add(list[i]);
  }
  if (bucket.length >= 2) {
    const shorter = index.prefixBuckets.get(q.slice(0, 2));
    if (shorter) {
      for (let i = 0; i < shorter.length; i++) out.add(shorter[i]);
    }
  }
  if (bucket.length >= 1) {
    const one = index.prefixBuckets.get(q.slice(0, 1));
    if (one && one.length < 50000) {
      for (let i = 0; i < one.length; i++) out.add(one[i]);
    }
  }
  return out;
}

function queryCandidates(index, idx, q, pathMode) {
  const candidates = new Set();
  const exact = index.exact.get(q);
  if (exact) {
    for (let i = 0; i < exact.length; i++) candidates.add(exact[i]);
  }

  const bucket = bucketCandidates(index, q);
  for (const i of bucket) {
    const name = idx.names[i];
    if (name.startsWith(q) || name.includes(q)) candidates.add(i);
  }

  const words = tokenize(q);
  if (words.length > 1) {
    const sets = [];
    for (let w = 0; w < words.length; w++) {
      const wl = index.wordIndex.get(words[w]);
      if (wl) sets.push(new Set(wl));
    }
    const inter = intersectSets(sets);
    for (const i of inter) candidates.add(i);
  } else if (words.length === 1) {
    const wl = index.wordIndex.get(words[0]);
    if (wl) {
      for (let i = 0; i < wl.length; i++) candidates.add(wl[i]);
    }
  }

  if (candidates.size < 200 && q.length >= 3) {
    const bucketList = index.prefixBuckets.get(q.slice(0, 3)) || [];
    for (let i = 0; i < bucketList.length && candidates.size < 5000; i++) {
      candidates.add(bucketList[i]);
    }
  }

  if (pathMode && candidates.size < 100) {
    for (let i = 0; i < idx.count && candidates.size < 2000; i++) {
      if (idx.paths[i].toLowerCase().includes(q)) candidates.add(i);
    }
  }

  if (!candidates.size && q.length >= 3) {
    const fallback = index.prefixBuckets.get(q.slice(0, 3));
    if (fallback) {
      for (let i = 0; i < fallback.length && candidates.size < 3000; i++) {
        candidates.add(fallback[i]);
      }
    }
  }

  return candidates;
}

function computeMatchRanges(name, q) {
  const ranges = [];
  if (!q) return ranges;
  let start = name.indexOf(q);
  if (start >= 0) {
    ranges.push([start, start + q.length]);
    return ranges;
  }
  let qi = 0;
  let rs = -1;
  for (let si = 0; si < name.length && qi < q.length; si++) {
    if (name[si] === q[qi]) {
      if (rs < 0) rs = si;
      qi++;
      if (qi === q.length) {
        ranges.push([rs, si + 1]);
        break;
      }
    } else if (rs >= 0 && name[si] !== q[qi]) {
      // subsequence — keep scanning
    }
  }
  if (!ranges.length && qi === q.length && rs >= 0) {
    ranges.push([rs, rs + q.length]);
  }
  return ranges;
}

module.exports = { buildSearchIndex, queryCandidates, computeMatchRanges };
