const { execFile } = require('child_process');

function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64')],
    { windowsHide: true, timeout: 10000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' },
    (error, stdout) => error ? reject(error) : resolve(stdout));
  });
}

// Searches share a short-lived snapshot and never start duplicate OS queries.
function cachedSnapshot(script, ttl = 5000, staleWhileRevalidate = false) {
  let value = [];
  let expires = 0;
  let pending = null;
  let loaded = false;
  const read = async (force = false) => {
    if (process.platform !== 'win32') return [];
    if (!force && Date.now() < expires) return value;
    if (!pending) pending = runPowerShell(script).then((out) => {
      const parsed = JSON.parse(out.trim() || '[]');
      value = (Array.isArray(parsed) ? parsed : [parsed]).filter(Boolean);
      loaded = true;
      return value;
    }).catch(() => value).finally(() => { expires = Date.now() + ttl; pending = null; });
    return loaded && staleWhileRevalidate && !force ? value : pending;
  };
  read.refresh = () => read(true);
  return read;
}

module.exports = { runPowerShell, cachedSnapshot };
