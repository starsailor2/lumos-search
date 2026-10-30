// Scoped search modes: @files, @clip, @snip, @calc, @emoji, @system, etc.

const SCOPES = {
  files: ['files'],
  file: ['files'],
  apps: ['apps', 'files'],
  app: ['apps', 'files'],
  folders: ['files'],
  folder: ['files'],
  web: ['quickactions', 'quicklinks', 'ai'],
  clip: ['clipboard'],
  clipboard: ['clipboard'],
  snip: ['clipboard'],
  snippets: ['clipboard'],
  snippet: ['clipboard'],
  calc: ['quickactions'],
  calculator: ['quickactions'],
  convert: ['quickactions'],
  emoji: ['emoji'],
  system: ['system', 'commands'],
  sys: ['system', 'commands'],
  quicklinks: ['quicklinks'],
  links: ['quicklinks'],
  ql: ['quicklinks'],
  recent: ['recent'],
  recents: ['recent'],
  fav: ['recent'],
  favourites: ['recent'],
  favorites: ['recent'],
  windows: ['windows'],
  win: ['windows'],
  games: ['games'],
  game: ['games'],
  process: ['process'],
  processes: ['process'],
  proc: ['process'],
  ai: ['ai'],
  path: ['pathintel'],
  batch: ['batch'],
  workflows: ['workflows'],
  workflow: ['workflows'],
};

const PROVIDER_MAP = {
  commands: './providers/commands',
  quickactions: './providers/quickactions',
  files: './providers/files',
  apps: './providers/apps',
  clipboard: './providers/clipboard',
  emoji: './providers/emoji',
  system: './providers/system',
  quicklinks: './providers/quicklinks',
  recent: './providers/recent',
  windows: './providers/windows',
  games: './providers/games',
  process: './providers/process',
  ai: './providers/ai',
  pathintel: './providers/pathintel',
  batch: './providers/batch',
  workflows: './providers/workflows',
};

function parseScope(query) {
  const m = /^@(\w+)(?:\s+(.*))?$/i.exec(String(query || '').trim());
  if (!m) return { scope: null, q: String(query || '').trim(), providers: null };
  const key = m[1].toLowerCase();
  const providerKeys = SCOPES[key];
  if (!providerKeys) return { scope: null, q: String(query || '').trim(), providers: null };
  return {
    scope: key,
    q: (m[2] || '').trim(),
    providers: providerKeys,
  };
}

function loadProviders(keys) {
  if (!keys) return null;
  return keys.map((k) => {
    const mod = PROVIDER_MAP[k];
    return mod ? require(mod) : null;
  }).filter(Boolean);
}

module.exports = { parseScope, loadProviders, SCOPES };
