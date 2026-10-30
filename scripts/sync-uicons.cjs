// Regenerate the small mapping from Flaticon's official 4.0.0 thin-rounded CSS.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(process.argv[2] || path.join(root, 'test-output/uicons-thin-rounded-4.css'), 'utf8');
const names = {
  search: 'search', folder: 'folder', file: 'document', pdf: 'file-pdf', spreadsheet: 'table', image: 'picture',
  video: 'video-camera', audio: 'music-alt', archive: 'file-zipper', code: 'file-code', app: 'apps', clipboard: 'clipboard',
  web: 'globe', settings: 'settings', window: 'browser', game: 'gamepad', process: 'microchip', workflow: 'diagram-project',
  ai: 'sparkles', calculator: 'calculator', close: 'cross-small', enter: 'arrow-turn-down-left', preview: 'eye', copy: 'copy',
  paste: 'paste', refresh: 'refresh', open: 'arrow-up-right-from-square', reveal: 'folder-open', keyboard: 'keyboard',
  info: 'info', check: 'check', camera: 'camera',
  history: 'time-past', favourite: 'star', link: 'link', emoji: 'smile', lock: 'lock', sleep: 'moon', power: 'power',
  volume: 'volume', 'volume-down': 'volume-down', muted: 'volume-mute', trash: 'trash',
};
const icons = Object.fromEntries(Object.entries(names).map(([kind, name]) => {
  const match = source.match(new RegExp('\\.fi-tr-' + name + ':before\\s*\\{\\s*content:\\s*"\\\\([a-f0-9]+)";?\\s*\\}'));
  assert(match, `Official thin icon is unavailable: ${name}`);
  return [kind, { name, codepoint: match[1] }];
}));
const font = fs.readFileSync(path.join(root, 'src/assets/icons/uicons-thin-rounded.woff2'));
assert.equal(font.subarray(0, 4).toString(), 'wOF2');
const brandSource = fs.readFileSync(path.join(root, 'test-output/uicons-brands-4.css'), 'utf8');
const brandNames = ['whatsapp', 'firefox', 'spotify', 'slack', 'discord', 'telegram', 'zoom', 'github', 'windows', 'microsoft', 'microsoft-edge', 'skype'];
const brands = Object.fromEntries(brandNames.map((name) => {
  const match = brandSource.match(new RegExp('\\.fi-brands-' + name + ':before\\s*\\{\\s*content:\\s*"\\\\([a-f0-9]+)";?\\s*\\}'));
  assert(match, `Official brand icon is unavailable: ${name}`);
  return [name, { name, codepoint: match[1] }];
}));
const brandFont = fs.readFileSync(path.join(root, 'src/assets/icons/uicons-brands.woff2'));
assert.equal(brandFont.subarray(0, 4).toString(), 'wOF2');
const manifest = { version: '4.0.0', style: 'thin-rounded', source: 'https://cdn-uicons.flaticon.com/4.0.0/uicons-thin-rounded/',
  fontSha256: crypto.createHash('sha256').update(font).digest('hex'), brandFontSha256: crypto.createHash('sha256').update(brandFont).digest('hex'), icons, brands };
fs.writeFileSync(path.join(root, 'src/assets/icons/uicons.json'), JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'src/styles/uicons.css'), `/* Official Flaticon Uicons 4.0.0 · Thin Rounded. See src/assets/icons/Flaticon-LICENSE.txt. */
@font-face { font-family: 'uicons-thin-rounded'; src: url('../assets/icons/uicons-thin-rounded.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: block; }
@font-face { font-family: 'uicons-brands'; src: url('../assets/icons/uicons-brands.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: block; }
.interface-icon { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 1em; height: 1em; vertical-align: middle; }
.interface-icon::before { display: block; font-family: 'uicons-thin-rounded' !important; font-size: inherit; font-style: normal; font-weight: 400 !important; font-variant: normal; line-height: 1; text-transform: none; -webkit-font-smoothing: antialiased; }
.interface-icon.brand-icon::before { font-family: 'uicons-brands' !important; }
` + Object.entries(icons).map(([kind, icon]) => `.uicon-${kind}::before { content: "\\${icon.codepoint}"; }`).join('\n') + '\n' +
  Object.entries(brands).map(([kind, icon]) => `.uicon-brand-${kind}::before { content: "\\${icon.codepoint}"; }`).join('\n') + '\n');
console.log(`PASS: mapped ${Object.keys(icons).length} official thin-rounded icons; SHA-256 ${manifest.fontSha256}`);
