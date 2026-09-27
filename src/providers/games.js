// Game launcher — Steam, Epic, GOG library indexing.

const fs = require('fs');
const path = require('path');
const os = require('os');

let gameCache = [];
let cacheTime = 0;
const CACHE_TTL = 300000;

function readSteamGames() {
  const games = [];
  const steamPaths = [
    'C:\\Program Files (x86)\\Steam\\steamapps',
    'C:\\Program Files\\Steam\\steamapps',
    path.join('D:\\SteamLibrary\\steamapps'),
    path.join('E:\\SteamLibrary\\steamapps'),
  ];
  for (const steamRoot of steamPaths) {
    const common = path.join(steamRoot, 'common');
    const acfDir = steamRoot;
    if (!fs.existsSync(acfDir)) continue;
    try {
      const acfFiles = fs.readdirSync(acfDir).filter((f) => f.endsWith('.acf'));
      for (const acf of acfFiles) {
        const content = fs.readFileSync(path.join(acfDir, acf), 'utf8');
        const nameMatch = /"name"\s+"([^"]+)"/.exec(content);
        const dirMatch = /"installdir"\s+"([^"]+)"/.exec(content);
        if (nameMatch) {
          const installDir = dirMatch ? path.join(common, dirMatch[1]) : common;
          games.push({ name: nameMatch[1], path: installDir, platform: 'Steam' });
        }
      }
    } catch { /* skip */ }
    if (fs.existsSync(common)) {
      try {
        for (const dir of fs.readdirSync(common)) {
          const full = path.join(common, dir);
          if (fs.statSync(full).isDirectory() && !games.some((g) => g.path === full)) {
            games.push({ name: dir, path: full, platform: 'Steam' });
          }
        }
      } catch { /* skip */ }
    }
  }
  return games;
}

function readEpicGames() {
  const games = [];
  const manifestDir = path.join(os.homedir(), 'AppData', 'Local', 'EpicGamesLauncher', 'Saved', 'Manifests');
  if (!fs.existsSync(manifestDir)) return games;
  try {
    for (const file of fs.readdirSync(manifestDir)) {
      if (!file.endsWith('.item')) continue;
      try {
        const data = JSON.parse(fs.readFileSync(path.join(manifestDir, file), 'utf8'));
        if (data.DisplayName && data.InstallLocation) {
          games.push({ name: data.DisplayName, path: data.InstallLocation, platform: 'Epic' });
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return games;
}

function getGames() {
  if (Date.now() - cacheTime < CACHE_TTL && gameCache.length) return gameCache;
  gameCache = [...readSteamGames(), ...readEpicGames()];
  cacheTime = Date.now();
  return gameCache;
}

function search(ctx) {
  const { q, qLower } = ctx;
  const games = getGames();
  const results = [];
  for (const game of games) {
    let score = -1;
    if (!q) score = 320;
    else if (game.name.toLowerCase().includes(qLower)) score = 600;
    else if (game.platform.toLowerCase().includes(qLower)) score = 400;
    if (score < 0) continue;
    results.push({
      type: 'game',
      id: 'game:' + game.path,
      title: game.name,
      subtitle: game.platform + ' · ' + game.path,
      score,
      icon: '🎮',
      actions: ['open', 'reveal'],
      data: { path: game.path, kind: 'folder' },
    });
    if (results.length >= 40) break;
  }
  return results;
}

module.exports = { search, getGames };
