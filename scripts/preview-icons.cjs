const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const names = ['folder', 'file', 'pdf', 'spreadsheet', 'archive', 'image', 'video', 'audio', 'code', 'search', 'app', 'clipboard', 'web', 'settings', 'window', 'game', 'process', 'workflow', 'ai', 'calculator'];
const labels = { file: 'Document', spreadsheet: 'Spreadsheet', image: 'Image', archive: 'Archive', app: 'Application', ai: 'AI', web: 'Web search' };
const tiles = names.map((name, index) => {
  const x = 40 + (index % 5) * 184;
  const y = 98 + Math.floor(index / 5) * 136;
  const artwork = fs.readFileSync(path.join(root, 'src/assets/icons', name + '.svg'), 'utf8')
    .replace(/<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const label = labels[name] || name[0].toUpperCase() + name.slice(1);
  return `<rect x="${x}" y="${y}" width="176" height="124" rx="16" fill="#20242C" stroke="#303642"/>
    <svg x="${x + 52}" y="${y + 10}" width="72" height="72" viewBox="0 0 48 48">${artwork}</svg>
    <text x="${x + 88}" y="${y + 105}" text-anchor="middle" fill="#D1D8E5" font-size="13">${label}</text>`;
}).join('\n');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="680" viewBox="0 0 1000 680" font-family="Segoe UI, Arial, sans-serif">
  <rect width="1000" height="680" rx="24" fill="#14171D"/>
  <text x="40" y="46" fill="#F4F6FA" font-size="27" font-weight="700">Lumos icon collection</text>
  <text x="40" y="72" fill="#98A6BB" font-size="13">Colorful SVG illustrations for files, media, and everyday actions</text>
  ${tiles}
  <text x="40" y="660" fill="#8491A5" font-size="11">20 standalone vector assets · Offline · Sharp at every size</text>
</svg>`;
fs.mkdirSync(path.join(root, 'docs/screenshots'), { recursive: true });
const vector = path.join(root, 'docs/icon-preview.svg');
fs.writeFileSync(vector, svg);
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ width: 1000, height: 680, show: false, frame: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<html><body style="margin:0;overflow:hidden">${svg}</body></html>`));
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
    const screenshot = await win.webContents.capturePage();
    assert(!screenshot.isEmpty());
    fs.writeFileSync(path.join(root, 'docs/screenshots/05-svg-icons.png'), screenshot.toPNG());
    console.log('PASS: rendered all 20 SVG illustrations into docs/icon-preview.svg and docs/screenshots/05-svg-icons.png');
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
