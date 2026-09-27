// Sample extension: Lorem Ipsum generator

function search(ctx) {
  const { q, qLower } = ctx;
  if (!qLower.includes('lorem') && qLower !== 'ipsum') return [];
  const text = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';
  return [{
    type: 'extension',
    id: 'ext:lorem',
    title: 'Generate Lorem Ipsum',
    subtitle: 'Sample Extension',
    score: 500,
    icon: '📄',
    actions: ['copy'],
    data: { text },
  }];
}

module.exports = { search };
