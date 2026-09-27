// Emoji picker — search by name/keyword, copy to clipboard.

const EMOJI_DATA = require('../data/emoji.json');

function search(ctx) {
  const { q, qLower } = ctx;
  if (!q || q.length < 1) {
    return EMOJI_DATA.slice(0, 20).map((e, i) => ({
      type: 'emoji',
      id: 'emoji:' + e.emoji,
      title: e.emoji + '  ' + e.name,
      subtitle: 'Emoji',
      score: 300 - i,
      icon: null,
      actions: ['copy'],
      data: { text: e.emoji },
    }));
  }
  const results = [];
  for (const e of EMOJI_DATA) {
    const nameLower = e.name.toLowerCase();
    const keywords = (e.keywords || []).join(' ').toLowerCase();
    let score = -1;
    if (nameLower === qLower) score = 900;
    else if (nameLower.startsWith(qLower)) score = 800;
    else if (nameLower.includes(qLower) || keywords.includes(qLower)) score = 600;
    if (score < 0) continue;
    results.push({
      type: 'emoji',
      id: 'emoji:' + e.emoji,
      title: e.emoji + '  ' + e.name,
      subtitle: 'Emoji · click to copy',
      score,
      icon: null,
      actions: ['copy'],
      data: { text: e.emoji },
    });
    if (results.length >= 40) break;
  }
  return results;
}

module.exports = { search };
