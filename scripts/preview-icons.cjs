const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
const names = ['folder', 'file', 'pdf', 'spreadsheet', 'archive', 'image', 'video', 'audio', 'code', 'search', 'app', 'clipboard', 'web', 'settings', 'window', 'game', 'process', 'workflow', 'ai', 'calculator'];
const labels = { file: 'Document', pdf: 'PDF', spreadsheet: 'Spreadsheet', image: 'Image', archive: 'Archive', app: 'Application', ai: 'AI', web: 'Web search' };
const manifest = require('../src/assets/icons/uicons.json');
const tiles = names.map((name) => {
  const label = labels[name] || name[0].toUpperCase() + name.slice(1);
  assert(manifest.icons[name]);
  return `<div class="tile"><i class="interface-icon uicon-${name}"></i><span>${label}</span><small>fi-tr-${manifest.icons[name].name}</small></div>`;
}).join('\n');
const fontCss = pathToFileURL(path.join(root, 'src/styles/uicons.css')).href;
const html = `<!doctype html><html><head><link rel="stylesheet" href="${fontCss}"><style>
*{box-sizing:border-box}body{margin:0;background:#151515;color:#eee;padding:28px 40px;font-family:'Segoe UI',sans-serif}
h1{margin:0 0 6px;font-size:26px;font-weight:600;letter-spacing:-.7px}p{margin:0;color:#999;font-size:13px}
.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-top:22px}.tile{height:100px;border:1px solid #333;border-radius:14px;background:#1d1d1d;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px}
.tile .interface-icon{font-size:34px;color:#e4e4e4}.tile span{font-size:13px}.tile small{font-size:9px;color:#858585}footer{font-size:11px;color:#999;margin-top:20px}
</style></head><body><h1>Lumos · Official interface icons</h1><p>Flaticon Uicons 4.0 · Thin Rounded · Vector glyphs bundled offline</p><div class="grid">${tiles}</div><footer>Uicons by Flaticon · flaticon.com/uicons</footer></body></html>`;
fs.mkdirSync(path.join(root, 'docs/screenshots'), { recursive: true });
fs.mkdirSync(path.join(root, 'test-output'), { recursive: true });
const preview = path.join(root, 'test-output/icon-preview.html');
fs.writeFileSync(preview, html);
app.disableHardwareAcceleration();
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'lumos-icon-preview-')));
app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ width: 1000, height: 600, show: false, frame: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
    await win.loadFile(preview);
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
    assert(await win.webContents.executeJavaScript('document.fonts.check(\'34px "uicons-thin-rounded"\')'));
    const screenshot = await win.webContents.capturePage();
    assert(!screenshot.isEmpty());
    fs.writeFileSync(path.join(root, 'docs/screenshots/05-interface-icons.png'), screenshot.toPNG());
    console.log('PASS: rendered the official thin-rounded icons into docs/screenshots/05-interface-icons.png');
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
