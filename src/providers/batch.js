// Batch operations — copy multiple paths, open multiple results.

function search(ctx) {
  const { q, qLower } = ctx;
  if (!q) return [];
  const results = [];

  if (qLower === 'copy paths' || qLower === 'batch copy') {
    const paths = [];
    for (let i = 0; i < Math.min(ctx.idx.count, 20); i++) {
      if (ctx.idx.flags[i] === 0 || ctx.idx.flags[i] === 1) {
        paths.push(ctx.idx.paths[i]);
      }
    }
    if (paths.length) {
      results.push({
        type: 'command',
        id: 'batch:copy-recent-paths',
        title: 'Copy ' + paths.length + ' indexed paths to clipboard',
        subtitle: 'Batch · copies newline-separated paths',
        score: 500,
        icon: '📋',
        actions: ['copy'],
        data: { text: paths.join('\n') },
      });
    }
  }

  return results;
}

module.exports = { search };
