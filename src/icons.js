// Real file/app icon resolution — deliberately kept OUT of search() so
// typing never blocks on OS icon extraction. The renderer requests icons
// one row at a time, after the emoji placeholder has already painted.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

const EXACT_PATH_EXTS = new Set(['.exe', '.lnk']);

const memCache = new Map();   // cacheKey -> data URL
const inFlight = new Map();   // cacheKey -> Promise<data URL>

function cacheDir() {
  return path.join(app.getPath('userData'), 'icon-cache');
}

function cacheKeyFor(filePath, kind) {
  if (kind === 'app') return 'exact:' + filePath;
  const ext = path.extname(filePath).toLowerCase();
  if (EXACT_PATH_EXTS.has(ext)) return 'exact:' + filePath;
  if (kind === 'folder') return 'ext:__dir__';
  return 'ext:' + (ext || '__noext__');
}

function diskPathFor(cacheKey) {
  const hash = crypto.createHash('sha1').update(cacheKey).digest('hex');
  return path.join(cacheDir(), hash + '.png');
}

async function getIcon(filePath, kind) {
  if (typeof filePath !== 'string' || !filePath) return null;
  const key = cacheKeyFor(filePath, kind);

  if (memCache.has(key)) return memCache.get(key);
  if (inFlight.has(key)) return inFlight.get(key);

  const promise = (async () => {
    const onDisk = diskPathFor(key);
    try {
      const buf = await fs.promises.readFile(onDisk);
      const dataUrl = 'data:image/png;base64,' + buf.toString('base64');
      memCache.set(key, dataUrl);
      return dataUrl;
    } catch { /* not cached on disk yet */ }

    try {
      const img = await app.getFileIcon(filePath, { size: 'normal' });
      const png = img.toPNG();
      const dataUrl = 'data:image/png;base64,' + png.toString('base64');
      memCache.set(key, dataUrl);
      fs.promises.mkdir(cacheDir(), { recursive: true })
        .then(() => fs.promises.writeFile(onDisk, png))
        .catch(() => { /* non-fatal */ });
      return dataUrl;
    } catch {
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

module.exports = { getIcon };
