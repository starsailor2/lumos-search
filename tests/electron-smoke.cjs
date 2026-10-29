// Native-input integration test against an isolated profile and fixture tree.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lumos-smoke-'));
const fixtures = path.join(directory, 'fixtures');
fs.mkdirSync(fixtures);
fs.mkdirSync(path.join(fixtures, 'Project Alpha'));
fs.writeFileSync(path.join(fixtures, 'Quarterly Report Unique.txt'), 'Preview of the quarterly report.');
for (let i = 0; i < 24; i++) fs.writeFileSync(path.join(fixtures, `Quarterly Report ${i}.txt`), 'Report');
for (const extension of ['pdf', 'xlsx', 'zip', 'docx', 'png', 'mp4', 'mp3', 'ts']) fs.writeFileSync(path.join(fixtures, `Color Palette.${extension}`), 'Icon test fixture');
fs.mkdirSync(path.join(fixtures, 'Color Palette Folder'));
for (const name of ['Camera', 'WhatsApp', 'File Manager']) {
  fs.writeFileSync(path.join(fixtures, name + '.txt'), 'App priority fixture');
  fs.mkdirSync(path.join(fixtures, name));
}
fs.writeFileSync(path.join(directory, 'config.json'), JSON.stringify({ version: 2, hotkeys: ['F24'], hotkeyFallbacks: [], indexedRoots: [fixtures], clipboard: { enabled: false, retainAcrossRestarts: false }, appearance: { theme: 'dark', accentColor: '#eeeeee' } }));
app.setPath('userData', directory);
app.setAppUserModelId('com.starsailor.lumos.smoketest');
const main = require('../src/main');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, message) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) { if (await fn()) return; await pause(50); }
  throw new Error(message);
}
app.whenReady().then(async () => {
  let exitCode = 0;
  try {
    const win = BrowserWindow.getAllWindows()[0];
    const errors = [];
    win.webContents.on('console-message', (details) => { if (details.level === 'error') errors.push(details.message); });
    win.webContents.on('render-process-gone', (_event, details) => errors.push(details.reason));
    win.webContents.setBackgroundThrottling(false);
    await until(() => win.webContents.executeJavaScript('Boolean(window.lumos && document.querySelector("input"))').catch(() => false), 'Renderer did not initialize');
    await until(() => main.idx.status === 'ready', 'Index did not complete');
    assert((await win.webContents.executeJavaScript('window.lumos.search("quarterly unique")')).results.some((r) => r.title === 'Quarterly Report Unique.txt'));
    assert((await win.webContents.executeJavaScript('window.lumos.search("project alpha")')).results.some((r) => r.type === 'folder'));
    assert((await win.webContents.executeJavaScript('window.lumos.search("grinning")')).results.some((r) => r.type === 'emoji'));
    assert((await win.webContents.executeJavaScript('window.lumos.search("lorem")')).results.some((r) => r.id === 'ext:lorem'));
    win.setBounds({ x: 100, y: 80, width: 600, height: 60 }); win.show(); win.focus();
    await win.webContents.executeJavaScript('window.originalInput = document.querySelector("input"); originalInput.focus();');
    const anchor = win.getBounds();
    const header = await win.webContents.executeJavaScript('JSON.stringify(document.querySelector(".search-header").getBoundingClientRect().toJSON())');
    const output = path.resolve(__dirname, '../test-output'); fs.mkdirSync(output, { recursive: true });
    const compact = await win.webContents.capturePage();
    const pixels = compact.toBitmap();
    const size = compact.getSize();
    for (const offset of [0, (size.width - 1) * 4, (size.height - 1) * size.width * 4, (size.width * size.height - 1) * 4]) assert.equal(pixels[offset + 3], 0, 'Compact corners must be transparent');
    assert(JSON.parse(header).top >= 0, 'Compact input scrolled out of view');
    fs.writeFileSync(path.join(output, 'launcher-compact.png'), compact.toPNG());
    const typeQuery = async (text) => {
      await win.webContents.executeJavaScript('originalInput.focus(); originalInput.select();');
      await win.webContents.insertText(text);
    };
    const settleHeight = async () => {
      await until(async () => Math.abs(win.getBounds().height - await win.webContents.executeJavaScript('60 + Math.ceil(document.querySelector(".results-content").getBoundingClientRect().height)')) <= 1, 'Native height did not fit the results');
    };
    await typeQuery('quarterly unique');
    const samples = [];
    for (let i = 0; i < 12; i++) { samples.push(win.getBounds().height); await pause(25); }
    await until(() => win.webContents.executeJavaScript('Boolean(document.querySelector(".result-card")?.textContent.includes("Quarterly Report Unique.txt")) && !document.querySelector("#search-results").getAttribute("aria-busy").includes("true")'), 'Search results did not render');
    await settleHeight();
    const shortHeight = win.getBounds().height;
    assert(shortHeight > 60 && shortHeight < 400);
    assert(samples.some((height) => height > 60 && height < shortHeight), 'Expansion did not have intermediate frames');
    assert.equal(win.getBounds().x, anchor.x); assert.equal(win.getBounds().y, anchor.y); assert.equal(win.getBounds().width, anchor.width);
    assert.equal(await win.webContents.executeJavaScript('document.querySelector("input") === originalInput && document.activeElement === originalInput'), true);
    assert.equal(await win.webContents.executeJavaScript('JSON.stringify(document.querySelector(".search-header").getBoundingClientRect().toJSON())'), header);
    assert.equal(await win.webContents.executeJavaScript('document.querySelector("nav, .sidebar") === null'), true);
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
    assert.equal(await win.webContents.executeJavaScript(`document.fonts.check('600 13px Manrope') && document.fonts.check('400 13px "DM Sans"')`), true);
    fs.writeFileSync(path.join(output, 'launcher-dark.png'), (await win.webContents.capturePage()).toPNG());
    await typeQuery('quarterly');
    await until(() => win.webContents.executeJavaScript('document.querySelectorAll(".result-card").length > 20'), 'Larger searches did not render');
    await settleHeight();
    const largeHeight = win.getBounds().height;
    assert(largeHeight > shortHeight); assert(largeHeight <= 540);
    assert.equal(await win.webContents.executeJavaScript('document.querySelector("input") === originalInput'), true);
    await win.webContents.executeJavaScript('document.querySelector(".clear-search").click()');
    await until(() => win.getBounds().height === 60, 'Clearing search did not collapse to the bar');
    assert.equal(await win.webContents.executeJavaScript('document.querySelector(".results-content").inert'), true);
    await typeQuery('quarterly unique');
    await until(() => win.webContents.executeJavaScript('Boolean(document.querySelector(".result-card")?.textContent.includes("Quarterly Report Unique.txt"))'), 'Retyping after collapse failed');
    await settleHeight();
    await win.webContents.executeJavaScript('document.querySelector(".action-dock button:last-child").click()');
    await until(() => win.webContents.executeJavaScript('Boolean(document.querySelector(".file-preview")?.textContent.includes("Preview of the quarterly report"))'), 'Preview did not render');
    await settleHeight();
    assert(win.getBounds().height > shortHeight);
    fs.writeFileSync(path.join(output, 'launcher-preview.png'), (await win.webContents.capturePage()).toPNG());
    assert.equal(win.getBounds().x, anchor.x); assert.equal(win.getBounds().y, anchor.y); assert.equal(win.getBounds().width, anchor.width);
    await win.webContents.executeJavaScript('document.querySelector(".action-dock button:last-child").click()');
    await typeQuery('@files color palette');
    await until(() => win.webContents.executeJavaScript('document.querySelectorAll(".result-card").length === 8 && document.querySelector("#search-results").getAttribute("aria-busy") === "false"'), 'Colored file results did not render');
    await until(() => win.webContents.executeJavaScript('Array.from(document.querySelectorAll(".result-card .illustrated-icon")).every((image) => image.complete && image.naturalWidth > 0)'), 'SVG assets did not load');
    const iconStyles = JSON.parse(await win.webContents.executeJavaScript(`JSON.stringify(Array.from(document.querySelectorAll('.result-card')).map((row) => ({ title: row.querySelector('.item-title').textContent, tone: row.querySelector('.item-icon-box').dataset.tone, artwork: row.querySelector('.illustrated-icon').dataset.icon, filter: getComputedStyle(row.querySelector('.item-icon-box')).filter, color: getComputedStyle(row.querySelector('.item-icon-box')).color })))`));
    for (const [extension, tone] of Object.entries({ pdf: 'red', xlsx: 'green', zip: 'yellow', docx: 'blue', png: 'violet', mp4: 'red', mp3: 'pink', ts: 'blue' })) {
      const icon = iconStyles.find((entry) => entry.title === `Color Palette.${extension}`);
      assert.equal(icon.tone, tone); assert.equal(icon.filter, 'none');
    }
    assert.equal(new Set(iconStyles.map((entry) => entry.color)).size, 6);
    for (const [extension, artwork] of Object.entries({ pdf: 'pdf', xlsx: 'spreadsheet', zip: 'archive', docx: 'file', png: 'image', mp4: 'video', mp3: 'audio', ts: 'code' })) assert.equal(iconStyles.find((entry) => entry.title === `Color Palette.${extension}`).artwork, artwork);
    await settleHeight();
    fs.writeFileSync(path.join(output, 'launcher-colors.png'), (await win.webContents.capturePage()).toPNG());
    await typeQuery('@folders color palette');
    await until(() => win.webContents.executeJavaScript('Boolean(document.querySelector(".result-card img[data-icon=folder]")?.naturalWidth)'), 'Folder illustration did not render');
    await settleHeight();
    fs.writeFileSync(path.join(output, 'launcher-folder.png'), (await win.webContents.capturePage()).toPNG());
    const registered = await require('../src/providers/apps').listStartApps();
    for (const [query, name] of [['Camera', 'Camera'], ['WhatsApp', 'WhatsApp'], ['File Manager', 'File Explorer']]) {
      if (!registered.some((entry) => entry.Name === name)) continue;
      const { results } = await win.webContents.executeJavaScript(`window.lumos.search(${JSON.stringify(query)})`);
      assert.equal(results[0].type, 'app', `${query} should show applications first`);
      assert(results.some((entry) => entry.type === 'app' && entry.title === name), `Missing Windows app: ${name}`);
      const firstOther = results.findIndex((entry) => entry.type !== 'app');
      assert(firstOther > 0 && results.slice(firstOther).every((entry) => entry.type !== 'app'), `${query} applications must precede every other result`);
      assert(results.some((entry) => entry.type === 'file' && entry.title === query + '.txt'));
      console.log(`PASS app priority: ${query} → ${results[0].title}, followed by files/folders`);
    }
    await typeQuery('Camera');
    await until(() => win.webContents.executeJavaScript('document.querySelector("#search-results").getAttribute("aria-busy") === "false" && document.querySelector("input").value === "Camera" && Boolean(document.querySelector(".result-card"))'), 'Application priority results did not render');
    await settleHeight();
    fs.writeFileSync(path.join(output, 'launcher-app-priority.png'), (await win.webContents.capturePage()).toPNG());
    const notepad = registered.find((entry) => entry.AppID.includes('WindowsNotepad'));
    if (notepad) assert((await win.webContents.executeJavaScript(`window.lumos.search(${JSON.stringify('@apps ' + notepad.Name)})`)).results.some((entry) => entry.type === 'app' && entry.title === notepad.Name));
    await win.webContents.executeJavaScript('window.lumos.openSettings()');
    await until(() => BrowserWindow.getAllWindows().length === 2, 'Settings did not open');
    const settings = BrowserWindow.getAllWindows().find((w) => w !== win);
    await until(() => settings.webContents.executeJavaScript('Boolean(window.lumosSettings && document.querySelector("#theme"))').catch(() => false), 'Settings did not initialize');
    await settings.webContents.executeJavaScript('document.fonts.ready.then(() => true)'); await pause(150);
    fs.writeFileSync(path.join(output, 'settings-dark.png'), (await settings.webContents.capturePage()).toPNG());
    await settings.webContents.executeJavaScript('window.lumosSettings.updateConfig({ appearance: { theme: "light", accentColor: "#8957e5", animations: false } })');
    await until(() => win.webContents.executeJavaScript('document.documentElement.dataset.theme === "light"'), 'Appearance changes did not reach launcher');
    assert.equal(await win.webContents.executeJavaScript('document.documentElement.style.getPropertyValue("--accent")'), '#8957e5');
    assert.deepEqual(errors, []);
    console.log(`PASS Electron: unified search, fixed input/anchor/width, animated heights ${JSON.stringify(samples)}, content resize ${shortHeight} → ${largeHeight}, clear/collapse, preview, fonts, file-type colors, Windows apps, settings, appearance.`);
  } catch (error) {
    console.error(error);
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) console.error('Layout diagnostic:', win.getBounds(), await win.webContents.executeJavaScript('JSON.stringify({ panel: document.querySelector(".results-content")?.getBoundingClientRect().toJSON(), query: document.querySelector("input")?.value, launcher: document.querySelector(".launcher")?.className, deviceScale: devicePixelRatio })').catch(() => 'unavailable'));
    exitCode = 1;
  }
  finally { app.exit(exitCode); }
});
