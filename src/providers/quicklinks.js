// Quicklinks — keyword-triggered URL bookmarks (Raycast-style).

function search(ctx) {
  const { q, qLower, config } = ctx;
  const links = config.quicklinks || [];
  const results = [];

  for (const link of links) {
    if (!link || !link.url) continue;
    const keyword = (link.keyword || '').toLowerCase();
    const title = link.title || link.keyword || link.url;
    let score = -1;
    if (!q) {
      score = 350;
    } else if (keyword === qLower || keyword.startsWith(qLower) || qLower.startsWith(keyword)) {
      score = 700 + Math.max(0, 20 - Math.abs(keyword.length - qLower.length));
    } else if (title.toLowerCase().includes(qLower)) {
      score = 500;
    }
    if (score < 0) continue;
    results.push({
      type: 'quicklink',
      id: 'ql:' + (link.id || link.keyword),
      title,
      subtitle: 'Quicklink · ' + link.url,
      score,
      icon: '🔗',
      actions: ['open-external'],
      data: { url: link.url },
    });
  }
  return results;
}

module.exports = { search };
