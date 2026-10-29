const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { EventEmitter } = require('node:events');
const { Worker } = require('node:worker_threads');
const files = require('../src/providers/files');
const { sanitize, DEFAULT_CONFIG } = require('../src/config');
const { tryCalculator, tryUnitConvert, search: quickSearch } = require('../src/providers/quickactions');
const { parseScope, loadProviders } = require('../src/scope');

test('standalone SVG icons contain only local vector artwork and valid paint references', () => {
  const directory = path.resolve(__dirname, '../src/assets/icons');
  const names = fs.readdirSync(directory).filter((name) => name.endsWith('.svg'));
  assert.equal(names.length, 20);
  for (const name of names) {
    const svg = fs.readFileSync(path.join(directory, name), 'utf8');
    assert.match(svg, /viewBox="0 0 48 48"/);
    assert(!/<script|<foreignObject|<image|\bon\w+=/i.test(svg), `Unexpected active content in ${name}`);
    assert(!/(?:href|src)=/i.test(svg), `External resource in ${name}`);
    const ids = new Set(Array.from(svg.matchAll(/\bid="([^"]+)"/g), (match) => match[1]));
    for (const match of svg.matchAll(/url\(#([^)]+)\)/g)) assert(ids.has(match[1]), `Missing SVG paint ${match[1]} in ${name}`);
  }
});

function fixture(paths, flags = paths.map(() => 0)) {
  return { paths, names: paths.map((p, i) => path.win32.basename(p).replace(flags[i] === 2 ? /\.(lnk|url)$/i : /$^/, '').toLowerCase()), flags, count: paths.length };
}
function context(idx, q = '', scope = null, config = DEFAULT_CONFIG) {
  return { idx, q, qLower: q.toLowerCase(), scope, config, frecencyBoost: () => 0 };
}
function loadIsolated(relative, mocks, extra = '') {
  const filename = path.resolve(__dirname, '..', relative);
  const realRequire = createRequire(filename);
  const sandbox = { module: { exports: {} }, require: (id) => id in mocks ? mocks[id] : realRequire(id),
    __dirname: path.dirname(filename), __filename: filename, process, Buffer, URL, console,
    setImmediate, setTimeout, clearTimeout, setInterval, clearInterval };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8') + extra, sandbox, { filename });
  return sandbox.module.exports;
}

test('file search retains ancestor, fuzzy, mixed-token, and case-preserving results', async () => {
  const idx = fixture(['C:\\Reports\\Budget Final.xlsx', 'C:\\Other\\Reports.txt', 'C:\\Tools\\Visual Studio Code.lnk', 'C:\\Other\\vscode.txt'], [0, 0, 2, 0]);
  assert((await files.search(context(idx, 'reports'))).some((r) => r.title === 'Budget Final.xlsx'));
  assert((await files.search(context(idx, 'vscode'))).some((r) => r.type === 'app'));
  assert.equal((await files.search(context(idx, 'reports budget')))[0].title, 'Budget Final.xlsx');
  assert.equal((await files.search(context(idx, 'budget nonexistent'))).length, 0);
});

test('fuzzy highlighting marks only matched letters and intent affects bounded selection', async () => {
  const { computeMatchRanges } = require('../src/search-index');
  assert.deepEqual(computeMatchRanges('visual code', 'vsc'), [[0, 1], [2, 3], [7, 8]]);
  assert.deepEqual(computeMatchRanges('visual code', 'xyz'), []);
  const idx = fixture(['C:\\Docs\\report.txt', 'C:\\Docs\\report-final.txt']);
  const ctx = context(idx, 'report', null, { maxResults: 1 });
  ctx.learnedIntent = { path: idx.paths[1] };
  assert.equal((await files.search(ctx))[0].title, 'report-final.txt');
});

test('scopes browse only the requested kinds and bound result materialization', async () => {
  const idx = fixture(['C:\\Apps\\Editor.lnk', 'C:\\Docs', 'C:\\Docs\\Notes.txt'], [2, 1, 0]);
  assert.deepEqual((await files.search(context(idx, '', 'apps'))).map((r) => r.type), ['app']);
  assert.deepEqual((await files.search(context(idx, '', 'folders'))).map((r) => r.type), ['folder']);
  assert.equal((await files.search(context(fixture(Array.from({ length: 2000 }, (_, i) => `C:\\Docs\\report${i}.txt`)), 'report', null, { maxResults: 5 }))).length, 5);
  for (const scope of ['@folders', '@web', '@workflows']) assert(loadProviders(parseScope(scope).providers).length);
});

test('indexed applications survive the result limit ahead of higher-scoring files and folders', async () => {
  const paths = [...Array.from({ length: 60 }, (_, i) => `C:\\Docs\\Camera ${i}.txt`), 'C:\\Docs\\Camera', 'C:\\Apps\\Windows Camera.lnk'];
  const idx = fixture(paths, [...Array(60).fill(0), 1, 2]);
  const ctx = context(idx, 'camera', null, { maxResults: 5 });
  ctx.frecencyBoost = (p) => p.endsWith('.txt') ? 5000 : 0;
  ctx.learnedIntent = { path: paths[0] };
  const results = await files.search(ctx);
  assert.equal(results.length, 5);
  assert.equal(results[0].type, 'app');
  assert.equal(results[0].title, 'Windows Camera');
  assert.equal(results[1].id, paths[0]);
  const scoped = await files.search({ ...ctx, scope: 'files' });
  assert(scoped.every((result) => result.type === 'file'));
  const navigation = await files.search({ ...ctx, qLower: 'c:\\docs\\camera' });
  assert(navigation.every((result) => result.type !== 'app'));
});

test('large scans yield to the event loop and superseded queries finish quickly', async () => {
  const idx = fixture(Array.from({ length: 30000 }, (_, i) => `C:\\Documents\\Report ${i}.txt`));
  let yielded = false;
  setImmediate(() => { yielded = true; });
  const stale = files.search(context(idx, 'report'));
  const current = files.search(context(idx, 'report 29999'));
  assert.equal((await stale).length, 0);
  assert((await current).some((r) => r.title === 'Report 29999.txt'));
  assert.equal(yielded, true);
});

test('calculator rejects malformed decimals and obeys exponent and unary precedence', () => {
  assert.equal(tryCalculator('2x3').title, '6');
  assert.equal(tryCalculator('2\t+\t3').title, '5');
  assert.equal(tryCalculator('1.2.3 + 4'), null);
  assert.equal(tryCalculator('-2^2').title, '-4');
  assert.equal(tryCalculator('2^-2').title, '0.25');
  assert.equal(tryCalculator('2^3^2').title, '512');
  assert.equal(tryCalculator('1/0'), null);
  assert.equal(tryUnitConvert('-40 °C TO °F').title, '-40 °F');
  assert.equal(tryUnitConvert('1.2.3 m to cm'), null);
  assert.equal(quickSearch(context({}, 'hello', 'calc')).length, 0);
});

test('configuration normalizes workflows and preserves refresh settings across partial updates', () => {
  const fractional = sanitize({ maxResults: 5.5, clipboard: { maxEntries: 2.5 } });
  assert.equal(fractional.maxResults, 6); assert.equal(fractional.clipboard.maxEntries, 3);
  const cfg = sanitize({ workflows: [{ name: 'Example', steps: [null, { action: 'unknown' }, { action: 'open', path: 'C:\\Example' }, { action: 'copy', data: { text: 'Hello' } }] }] });
  assert.deepEqual(cfg.workflows[0].steps, [
    { action: 'open', data: { path: 'C:\\Example' } }, { action: 'copy', data: { text: 'Hello' } },
  ]);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lumos-config-test-'));
  const config = loadIsolated('src/config.js', { electron: { app: { getPath: () => directory } } });
  config.loadConfig();
  config.updateConfig({ refresh: { fullHours: 12 } });
  assert.equal(config.updateConfig({ refresh: { hotMinutes: 2 } }).refresh.fullHours, 12);
  fs.rmSync(directory, { recursive: true, force: true });
  assert.throws(() => config.updateConfig({ maxResults: 100 }));
  assert.equal(config.getConfig().maxResults, 40);
});

function mainHarness(directory, providers = [files], learnedIntent = null) {
  const workers = [];
  const appLaunches = [];
  const handlers = new Map();
  class FakeWorker extends EventEmitter { constructor(_file, options) { super(); this.options = options; workers.push(this); } }
  const fakeApp = new EventEmitter();
  Object.assign(fakeApp, { requestSingleInstanceLock: () => true, whenReady: () => new Promise(() => {}), getPath: () => directory });
  const config = sanitize({ indexedRoots: ['C:\\Docs'] });
  const main = loadIsolated('src/main.js', {
    electron: { app: fakeApp, ipcMain: { handle: (name, fn) => handlers.set(name, fn), on: (name, fn) => handlers.set(name, fn) },
      shell: { openPath: async () => 'File was not found' }, clipboard: { writeText: () => {}, writeImage: () => {} }, nativeTheme: new EventEmitter(),
      screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) } },
    worker_threads: { Worker: FakeWorker },
    './config': { getConfig: () => config },
    './frecency': { frecencyBoost: () => 0, recordLaunch: () => {} }, './providers/clipboard': {}, './icons': {}, './settings-window': {}, './paste': {},
    './extensions': { getExtensionProviders: () => [] }, './providers/system': {}, './providers/windows': {}, './providers/process': {}, './providers/ai': {},
    './intent-memory': { getIntent: () => learnedIntent, getRecentIntents: () => [], recordIntent: () => {} },
    './providers/apps': { launchApp: async (appId) => appLaunches.push(appId) },
    './providers': providers, './providers/onboarding': {}, './analytics': { recordOpen: () => {} },
  }, '\nconfig = ' + JSON.stringify(config) + '; module.exports.test = { startIndexing, spawnIndexer, flush: () => cacheSave, setWindow: (value) => { win = value; } };');
  return { main, workers, handlers, appLaunches };
}

test('index batches stream, overlapping paths deduplicate, rebuild queues, and failures retain the live index', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lumos-index-test-'));
  try {
    const { main, workers, handlers } = mainHarness(directory);
    main.test.startIndexing();
    const first = workers[0];
    first.emit('message', { type: 'batch', items: [['C:\\Docs\\one.txt', 0]] });
    first.emit('message', { type: 'batch', items: [['C:\\Docs\\two.txt', 0], ['C:\\Docs\\one.txt', 0]] });
    assert.equal(main.idx.count, 2);
    main.test.startIndexing();
    assert.equal(workers.length, 1);
    first.emit('message', { type: 'done' }); first.emit('exit', 0);
    assert.equal(workers.length, 2);
    workers[1].emit('message', { type: 'error', error: 'test failure' }); workers[1].emit('exit', 1);
    assert.equal(main.idx.count, 2);
    assert.equal(main.idx.status, 'error');
    main.addEntries([['C:\\Apps\\Editor.lnk', 0], ['c:\\apps\\editor.lnk', 2]]);
    assert.equal(main.idx.count, 3); assert.equal(main.idx.flags[2], 2);
    assert.equal((await handlers.get('run-action')({}, { action: 'open', result: { data: { path: 'C:\\Missing' } } })).error, 'File was not found');
    await main.test.flush();
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('hot refresh only removes entries for successfully refreshed roots', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lumos-hot-test-'));
  try {
    const { main, workers } = mainHarness(directory);
    main.addEntries([['C:\\Docs\\old.txt', 0], ['D:\\Offline\\keep.txt', 0]]);
    main.test.spawnIndexer({ mode: 'hot', roots: ['C:\\Docs', 'D:\\Offline'] });
    workers[0].emit('message', { type: 'batch', items: [['C:\\Docs\\new.txt', 0]] });
    workers[0].emit('message', { type: 'done', roots: ['C:\\Docs'] }); workers[0].emit('exit', 0);
    assert.deepEqual(Array.from(main.idx.paths), ['D:\\Offline\\keep.txt', 'C:\\Docs\\new.txt']);
    await main.test.flush();
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('launcher resizing animates only the bottom edge and retargets safely', async () => {
  const { main } = mainHarness(os.tmpdir());
  const bounds = { x: 120, y: 100, width: 600, height: 60 };
  const heights = [];
  main.test.setWindow({ isDestroyed: () => false, isVisible: () => true,
    getBounds: () => ({ ...bounds }), setBounds: (patch) => { Object.assign(bounds, patch); heights.push(bounds.height); } });
  main.resizeLauncher(350);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert(bounds.height > 60 && bounds.height < 350);
  main.resizeLauncher(200);
  await new Promise((resolve) => setTimeout(resolve, 270));
  assert.deepEqual(bounds, { x: 120, y: 100, width: 600, height: 200 });
  assert(heights.length > 3);
  main.resizeLauncher(NaN); assert.equal(bounds.height, 200);
  main.resizeLauncher(-20, false); assert.equal(bounds.height, 60);
  main.resizeLauncher(5000, false); assert.equal(bounds.height, 600);
});

test('malformed provider results cannot crash the renderer or inject unknown actions', async () => {
  const { main } = mainHarness(os.tmpdir(), [{ search: () => [
    { id: 'bad', score: 100 },
    { id: 'safe', title: 'Safe', type: 'extension', score: 1, actions: ['unknown', 'copy'], matchRanges: [[0, 100], [0, 2], [1, 3]], data: null },
  ] }]);
  const response = await main.search('example');
  assert.equal(response.results.length, 1);
  assert.deepEqual(Array.from(response.results[0].actions), ['copy']);
  assert.equal(response.results[0].matchRanges.length, 1);
});

test('normal search ranks apps first across providers before limiting and retains relevance within each group', async () => {
  const { main } = mainHarness(os.tmpdir(), [
    { search: () => Array.from({ length: 45 }, (_, i) => ({ id: 'file:' + i, title: 'Camera ' + i, type: i === 0 ? 'folder' : 'file', score: 5000 - i, actions: ['open'] })) },
    { search: () => [
      { id: 'camera-tools', title: 'Camera Tools', type: 'app', score: 800, actions: ['open'] },
      { id: 'camera', title: 'Camera', type: 'app', score: 1180, actions: ['launch-app'] },
      { id: 'web', title: 'Search Camera online', type: 'websearch', score: 7000, actions: ['open-external'] },
    ] },
  ], { id: 'file:1' });
  const { results } = await main.search('camera');
  assert.equal(results.length, 40);
  assert.deepEqual(Array.from(results.slice(0, 2), (result) => result.id), ['camera', 'camera-tools']);
  assert.equal(results[2].id, 'web');
  assert.equal(results[3].id, 'file:1');
  const navigation = await main.search('C:\\Docs\\Camera');
  assert.equal(navigation.results[0].id, 'web', 'Path queries should keep relevance ordering');
  const suggestions = await main.search('');
  assert.equal(suggestions.results[0].id, 'web', 'Empty suggestions should keep their existing order');
});

test('real indexer skips dependencies, respects exclusions, and reports readable hot roots', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lumos-crawl-test-'));
  try {
    fs.mkdirSync(path.join(directory, 'node_modules'));
    fs.mkdirSync(path.join(directory, 'private'));
    fs.writeFileSync(path.join(directory, 'Visible.txt'), 'hello');
    fs.writeFileSync(path.join(directory, 'node_modules', 'noise.js'), '');
    const messages = await new Promise((resolve, reject) => {
      const messages = [];
      const worker = new Worker(path.resolve(__dirname, '../src/indexer.js'), { workerData: { mode: 'hot', roots: [directory, path.join(directory, 'missing')], excludedDirs: ['private'] } });
      worker.on('message', (message) => messages.push(message)); worker.on('error', reject);
      worker.on('exit', (code) => code ? reject(new Error(`Worker exited ${code}`)) : resolve(messages));
    });
    const entries = messages.filter((m) => m.type === 'batch').flatMap((m) => m.items);
    assert.equal(entries.length, 1); assert.equal(path.basename(entries[0][0]), 'Visible.txt');
    assert.deepEqual(messages.find((m) => m.type === 'done').roots, [directory]);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('clipboard scope filters its query, snippets browse, and cleared data cannot be resaved', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lumos-clipboard-test-'));
  let text = 'alpha'; let image = 'image-one'; let poll; let pending;
  const cfg = sanitize({ snippets: [{ trigger: 'hello', body: 'Hello world' }] });
  const clipboard = loadIsolated('src/providers/clipboard.js', {
    electron: { app: { getPath: () => directory }, clipboard: { readText: () => text, readImage: () => ({ isEmpty: () => false, toDataURL: () => image }) } },
  }, '\nsetInterval = (fn) => { testPoll = fn; return 1; }; setTimeout = (fn) => { testPending = fn; return 1; }; clearTimeout = () => { testPending = null; }; var testPoll, testPending; module.exports.test = { poll: () => testPoll(), pending: () => testPending };');
  try {
    clipboard.startClipboardWatch(() => cfg); clipboard.test.poll(); text = 'beta'; clipboard.test.poll();
    assert.equal(clipboard.search(context({}, 'alpha', 'clip', cfg)).length, 1);
    assert.equal(clipboard.search(context({}, '', 'snippets', cfg))[0].type, 'snippet');
    text = ''; clipboard.test.poll(); image = 'image-two'; clipboard.test.poll();
    assert.equal(clipboard.getHistory().filter((e) => e.kind === 'image').length, 2);
    clipboard.clearHistory(() => cfg); assert.equal(clipboard.test.pending(), null);
    clipboard.test.poll(); assert.equal(clipboard.getHistory().length, 0);
    clipboard.applyRetentionChange({ clipboard: { ...cfg.clipboard, retainAcrossRestarts: false } });
    assert.equal(fs.existsSync(path.join(directory, 'clipboard-history.json')), false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('AI preserves endpoint query parameters and rejects error responses', async () => {
  let requestedPath;
  let statusCode = 401;
  const transport = { request: (options, callback) => {
    requestedPath = options.path;
    const request = new EventEmitter(); request.setTimeout = () => {}; request.write = () => {};
    request.end = () => {
      const response = new EventEmitter(); response.statusCode = statusCode;
      callback(response);
      response.emit('data', statusCode === 401 ? '{"error":{"message":"Invalid API key"}}' : '{"choices":[{"message":{"content":"Hello"}}]}');
      response.emit('end');
    };
    return request;
  } };
  const ai = loadIsolated('src/providers/ai.js', { https: transport }, '');
  const config = { ai: { apiKey: 'test-key', endpoint: 'https://example.test/chat?version=1' } };
  await assert.rejects(ai.chatCompletion(config, []), /Invalid API key/);
  assert.equal(requestedPath, '/chat?version=1');
  statusCode = 200; assert.equal(await ai.chatCompletion(config, []), 'Hello');
});

test('preload event subscriptions can be removed without leaking listeners', () => {
  const ipc = new EventEmitter(); let api;
  loadIsolated('src/preload.js', { electron: { ipcRenderer: ipc, contextBridge: { exposeInMainWorld: (_name, value) => { api = value; } } } });
  let calls = 0;
  const unsubscribe = api.onShown(() => calls++);
  ipc.emit('window-shown', {}, {}); unsubscribe(); ipc.emit('window-shown', {}, {});
  assert.equal(calls, 1); assert.equal(ipc.listenerCount('window-shown'), 0);
});

test('extension searches have a deadline and receive no private configuration', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lumos-extension-test-'));
  const extensions = path.join(directory, 'extensions'); fs.mkdirSync(extensions);
  for (const [name, code] of [
    ['privacy', 'module.exports.search = (ctx) => [{ id: "privacy", title: String(ctx.config), score: 1 }];'],
    ['loop', 'module.exports.search = () => { while (true) {} };'],
  ]) {
    const folder = path.join(extensions, name); fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify({ name }));
    fs.writeFileSync(path.join(folder, 'index.js'), code);
  }
  const loader = loadIsolated('src/extensions.js', { electron: { app: { getPath: () => directory } } });
  try {
    loader.loadExtensions();
    const providers = loader.getExtensionProviders();
    assert.equal(providers.length, 2);
    const results = await Promise.allSettled(providers.map((p) => p.search({ q: 'hello', config: { ai: { apiKey: 'private' } } })));
    assert.equal(results.find((r) => r.status === 'fulfilled').value[0].title, 'undefined');
    assert.match(results.find((r) => r.status === 'rejected').reason.message, /timed out/);
  } finally { await loader.stopExtensions(); fs.rmSync(directory, { recursive: true, force: true }); }
});

test('persisted ranking data survives malformed records and reserved query keys', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lumos-memory-test-'));
  const electron = { app: { getPath: () => directory } };
  try {
    fs.writeFileSync(path.join(directory, 'intent-memory.json'), '{"queries":null}');
    const memory = loadIsolated('src/intent-memory.js', { electron });
    memory.loadIntentMemory(); assert.equal(memory.getIntent('constructor'), null);
    memory.recordIntent('__proto__', { id: 'file', title: 'Example' });
    assert.equal(memory.getIntent('__proto__').id, 'file'); memory.flushIntentMemory();
    fs.writeFileSync(path.join(directory, 'frecency.json'), '{"entries":{"invalid":null}}');
    const frecency = loadIsolated('src/frecency.js', { electron });
    frecency.loadFrecency(); assert.equal(frecency.getTopRecents().length, 0);
    frecency.flushFrecency();
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('OS snapshots share a single asynchronous process and numeric process IDs are validated', async () => {
  let calls = 0; let args;
  const helper = loadIsolated('src/powershell.js', { child_process: { execFile: (_file, options, _config, callback) => {
    calls++; args = options; setImmediate(() => callback(null, '[{"Id":123}]'));
  } } });
  const snapshot = helper.cachedSnapshot('Get-Process');
  const [first, second] = await Promise.all([snapshot(), snapshot()]);
  assert.equal(calls, 1); assert.equal(first[0].Id, second[0].Id);
  assert(args.includes('-EncodedCommand'));
  assert.equal(Buffer.from(args.at(-1), 'base64').toString('utf16le'), 'Get-Process');
  const proc = require('../src/providers/process');
  assert.equal(await proc.killProcess('1 & calc.exe'), false);
  assert.equal(await proc.killProcess(process.pid), false);
});

test('registered Windows apps search by name and launch only catalogued IDs', async () => {
  const entries = [
    { Name: 'Calculator', AppID: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App' },
    { Name: 'Visual Studio Code', AppID: 'Microsoft.VisualStudioCode' },
    { Name: 'File Explorer', AppID: 'Microsoft.Windows.Explorer' },
    { Name: null, AppID: 'bad' },
  ];
  const calls = [];
  const apps = loadIsolated('src/providers/apps.js', {
    '../powershell': { cachedSnapshot: () => async () => entries, runPowerShell: async (script) => calls.push(script) },
  });
  const results = await apps.search(context({}, 'calc', 'apps'));
  assert.equal(results.length, 1); assert.equal(results[0].title, 'Calculator');
  assert.equal(results[0].actions[0], 'launch-app');
  assert.equal((await apps.search(context({}, '', 'apps'))).length, 3);
  assert.equal((await apps.search(context({}, 'file manager')))[0].title, 'File Explorer');
  await apps.launchApp(entries[0].AppID);
  assert(calls[0].includes(".ShellExecute('shell:AppsFolder\\" + entries[0].AppID + "', '', '', 'open', 1)"));
  await assert.rejects(apps.launchApp('unknown-app'), /no longer registered/);
  await assert.rejects(apps.launchApp('bad\napp'), /Invalid/);
  assert.equal(calls.length, 1);
});

test('recent registered apps preserve the app launch action and display name', async () => {
  const appId = 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App';
  const recent = loadIsolated('src/providers/recent.js', {
    '../frecency': { getTopRecents: () => [{ path: 'startapp:' + appId, score: 20 }] },
    './apps': { listStartApps: async () => [{ Name: 'Calculator', AppID: appId }] },
  });
  const results = await recent.search(context(fixture([]), '', 'recent'));
  const app = results.find((entry) => entry.type === 'app');
  assert.equal(app.title, 'Calculator'); assert.equal(app.actions[0], 'launch-app');
  assert.equal(app.data.appId, appId); assert.equal(app.data.path, undefined);
});

test('registered-app result actions reach the Windows launcher', async () => {
  const { handlers, appLaunches } = mainHarness(os.tmpdir());
  const result = await handlers.get('run-action')({}, { action: 'launch-app', result: {
    type: 'app', id: 'startapp:example', title: 'Example App', data: { appId: 'example' },
  } });
  assert.equal(result, undefined); assert.deepEqual(appLaunches, ['example']);
});

test('batch paths skip app entries and media actions use native keys', async () => {
  const { search } = require('../src/providers/batch');
  const idx = fixture([...Array.from({ length: 30 }, (_, i) => `C:\\Apps\\App${i}.lnk`), 'C:\\Docs\\Keep.txt'], [...Array(30).fill(2), 0]);
  assert.equal(search(context(idx, 'copy paths'))[0].data.text, 'C:\\Docs\\Keep.txt');
  const scripts = [];
  const system = loadIsolated('src/providers/system.js', { '../powershell': { runPowerShell: async (script) => scripts.push(script) } });
  await system.runSystemCommand('volume-up'); await system.runSystemCommand('sleep');
  assert(scripts[0].includes('keybd_event(175')); assert(scripts[1].includes('SetSuspendState($false, $false, $false)'));
});
