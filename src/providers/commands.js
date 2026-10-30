const COMMANDS = [
  { id: 'settings', title: 'Open Settings', subtitle: 'Configure Lumos Search', keywords: ['settings', 'preferences'], action: 'open-settings' },
  { id: 'index-settings', title: 'Index settings', subtitle: 'Choose folders and exclusions; check scan status', keywords: ['index settings', 'indexing', 'missing file'], action: 'open-settings', data: { section: 'indexing' } },
  { id: 'refresh', title: 'Refresh recent folders', subtitle: 'Check selected folders, or Desktop, Documents, Downloads and media folders', keywords: ['refresh', 'refresh index', 'scan changes', 'update index'], action: 'refresh-index' },
  { id: 'rebuild', title: 'Rebuild Index', subtitle: 'Scan all included locations again; keep existing results available', keywords: ['reindex', 'rebuild', 'rebuild index', 'full scan'], action: 'rebuild-index' },
  { id: 'clipboard', title: 'Browse Clipboard History', subtitle: 'Type @clip to browse all entries', keywords: ['clipboard', 'clipboard history'], action: 'scope-clip' },
  { id: 'data-folder', title: 'Open Lumos data folder', subtitle: 'Configuration, local history and extensions', keywords: ['data folder', 'config folder', 'configuration file'], action: 'open-data-folder' },
];

const MODES = {
  apps: 'Installed Windows applications', files: 'Indexed files', folders: 'Indexed folders', clip: 'Clipboard history', snippets: 'Saved text snippets',
  calc: 'Calculator', convert: 'Unit conversion', emoji: 'Find emoji characters', links: 'Quicklinks', recent: 'Recent launches', fav: 'Favourites',
  windows: 'Open windows and window actions', process: 'Running processes', system: 'System and index commands', games: 'Steam and Epic libraries',
  workflows: 'Configured workflows', ai: 'Your configured AI endpoint',
};

function search(ctx) {
  if (ctx.scope && !['system', 'sys'].includes(ctx.scope)) return [];
  const q = ctx.qLower.trim();
  if (q.startsWith('@')) return Object.entries(MODES).filter(([mode]) => ('@' + mode).startsWith(q)).map(([mode, subtitle]) => ({
    type: 'command', id: 'scope:' + mode, title: '@' + mode, subtitle, score: 1600, icon: null, actions: ['set-scope'], data: { scope: mode },
  }));
  return COMMANDS.filter((command) => !q || command.keywords.some((keyword) => keyword.includes(q) || keyword.startsWith(q)))
    .map((command, i) => ({ type: 'command', id: 'cmd:' + command.id, title: command.title, subtitle: command.subtitle,
      score: (q ? 1600 : 400) - i, icon: null, actions: [command.action], data: command.data || {} }));
}

module.exports = { search };
