// Match highlighting shared by the file provider and launcher.
function computeMatchRanges(name, query) {
  if (!query) return [];
  const exact = name.indexOf(query);
  if (exact >= 0) return [[exact, exact + query.length]];
  const ranges = [];
  let at = -1;
  for (let i = 0; i < query.length; i++) {
    at = name.indexOf(query[i], at + 1);
    if (at < 0) return [];
    const previous = ranges[ranges.length - 1];
    if (previous && previous[1] === at) previous[1]++;
    else ranges.push([at, at + 1]);
  }
  return ranges;
}

module.exports = { computeMatchRanges };
