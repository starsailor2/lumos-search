const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const archive = path.join(root, 'release/win-unpacked/resources/app.asar');
let checked = 0;
function verifyDirectory(relative) {
  for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const file = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) verifyDirectory(file);
    else { assert(fs.readFileSync(path.join(root, file)).equals(asar.extractFile(archive, path.normalize(file))), `Package differs: ${file}`); checked++; }
  }
}
verifyDirectory('src'); verifyDirectory('dist/renderer');
const packaged = JSON.parse(asar.extractFile(archive, 'package.json'));
const current = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
assert.equal(packaged.version, current.version);
assert(packaged.dependencies['electron-updater']);
assert(asar.extractFile(archive, path.normalize('node_modules/electron-updater/package.json')).length);
console.log(`PASS package: ${checked} source/assets match the working tree; runtime updater is included.`);
const installer = path.join(root, `release/Lumos Search Setup ${current.version}.exe`);
assert(fs.statSync(installer).mtimeMs >= fs.statSync(archive).mtimeMs, 'Installer predates the verified payload.');
console.log(JSON.stringify({ installer, bytes: fs.statSync(installer).size,
  sha256: crypto.createHash('sha256').update(fs.readFileSync(installer)).digest('hex') }));
