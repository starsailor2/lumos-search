// Capture the real launcher with sample documents and an isolated profile.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const documents = path.join(root, 'test-output/readme-demo/Documents');
const output = path.join(root, 'docs/screenshots');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lumos-readme-'));
fs.mkdirSync(documents, { recursive: true });
fs.mkdirSync(output, { recursive: true });
for (const [name, text] of Object.entries({
  'Project Brief.md': '# Project Brief\n\nBuild a faster way to find everyday files and commands.\n\nOwner: Design team\nStatus: Ready for review',
  'Project Roadmap.md': '# Project Roadmap\n\n1. Explore\n2. Design\n3. Build\n4. Test and ship',
  'Project Budget.csv': 'Item,Amount\nDesign,2400\nDevelopment,4800\nTesting,1200',
  'Release Notes.md': '# Release Notes\n\nLumos Search 2.0.2\n\n- One pill-shaped search bar.\n- Results expand smoothly beneath your query.\n- Find files, preview text, and run commands.\n- Your file index stays on this PC.',
})) fs.writeFileSync(path.join(documents, name), text);
fs.writeFileSync(path.join(profile, 'config.json'), JSON.stringify({
  version: 2, indexedRoots: [documents], hotkeys: ['F24'], hotkeyFallbacks: [],
  clipboard: { enabled: false, retainAcrossRestarts: false },
  appearance: { theme: 'dark', accentColor: '#eeeeee', animations: true },
}));
app.setPath('userData', profile);
app.setAppUserModelId('com.starsailor.lumos.readme');
const main = require('../src/main');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, message) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) { if (await check()) return; await pause(50); }
  throw new Error(message);
}
app.whenReady().then(async () => {
  try {
    const win = BrowserWindow.getAllWindows()[0];
    win.webContents.setBackgroundThrottling(false);
    await until(() => win.webContents.executeJavaScript('Boolean(window.lumos && document.querySelector("input"))').catch(() => false), 'Launcher did not initialize');
    await until(() => main.idx.status === 'ready', 'Demo index did not complete');
    win.setBounds({ x: 100, y: 80, width: 600, height: 60 });
    win.show(); win.focus();
    await win.webContents.executeJavaScript('document.querySelector("input").focus(); document.fonts.ready.then(() => true)');
    const capture = async (name) => {
      await pause(300);
      const image = await win.webContents.capturePage();
      assert(!image.isEmpty());
      fs.writeFileSync(path.join(output, name), image.toPNG());
      console.log(`${name}: ${image.getSize().width} × ${image.getSize().height}`);
    };
    const search = async (query, expectedTitle) => {
      win.show(); win.focus(); await pause(50);
      await win.webContents.executeJavaScript('document.querySelector("input").focus(); document.querySelector("input").select();');
      await win.webContents.insertText(query);
      assert.equal(await win.webContents.executeJavaScript('document.querySelector("input").value'), query);
      await until(() => win.webContents.executeJavaScript(`document.querySelector('#search-results').getAttribute('aria-busy') === 'false' && Array.from(document.querySelectorAll('.item-title')).some((item) => item.textContent === ${JSON.stringify(expectedTitle)})`), 'Search did not finish');
      await until(async () => Math.abs(win.getBounds().height - await win.webContents.executeJavaScript('60 + Math.ceil(document.querySelector(".results-content").getBoundingClientRect().height)')) <= 1, 'Launcher did not finish resizing');
    };
    await capture('01-compact.png');
    await search('project', 'Project Brief.md');
    assert(await win.webContents.executeJavaScript('Array.from(document.querySelectorAll(".item-title")).some((item) => item.textContent === "Project Brief.md")'));
    await capture('02-expanded.png');
    await search('@files release notes', 'Release Notes.md');
    await until(() => win.webContents.executeJavaScript('document.querySelector(".item-title")?.textContent === "Release Notes.md"'), 'Demo file was not found');
    await win.webContents.executeJavaScript('Array.from(document.querySelectorAll(".action-dock button")).find((button) => button.textContent === "Preview").click()');
    await until(() => win.webContents.executeJavaScript('Boolean(document.querySelector(".file-preview")?.textContent.includes("Your file index stays on this PC"))'), 'Real file preview did not load');
    await capture('03-file-preview.png');
    await win.webContents.executeJavaScript('document.querySelector(".clear-search").click()');
    await until(() => win.getBounds().height === 60, 'Launcher did not collapse');
    await search('120 x 4 - 28', '452');
    assert.equal(await win.webContents.executeJavaScript('document.querySelector(".item-title")?.textContent'), '452');
    await capture('04-calculator.png');
    app.exit(0);
  } catch (error) {
    console.error(error);
    const win = BrowserWindow.getAllWindows()[0];
    if (win) console.error(await win.webContents.executeJavaScript('JSON.stringify({ query: document.querySelector("input")?.value, results: Array.from(document.querySelectorAll(".item-title")).map((item) => item.textContent) })').catch(() => 'Renderer unavailable'));
    app.exit(1);
  }
});
