const { cachedSnapshot, runPowerShell } = require('../powershell');
const { nameScore } = require('./files');
const { computeMatchRanges } = require('../search-index');

const listStartApps = cachedSnapshot('[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding; Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress', 60000);

async function search(ctx) {
  const apps = await listStartApps();
  const query = ctx.qLower;
  return apps.filter((entry) => entry && typeof entry.Name === 'string' && entry.Name && typeof entry.AppID === 'string' && entry.AppID)
    .map((entry) => {
      let score = query ? nameScore(entry.Name.toLowerCase(), query) : 400;
      if (query && entry.AppID === 'Microsoft.Windows.Explorer') score = Math.max(score, nameScore('file manager', query));
      if (score < 0) return null;
      return {
        type: 'app', id: 'startapp:' + entry.AppID, title: entry.Name,
        subtitle: 'Windows application', score: score + 180 + (ctx.frecencyBoost?.('startapp:' + entry.AppID) || 0),
        icon: null, actions: ['launch-app'], data: { appId: entry.AppID },
        matchRanges: computeMatchRanges(entry.Name.toLowerCase(), query),
      };
    }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, ctx.config?.maxResults || 40);
}

async function launchApp(appId) {
  if (typeof appId !== 'string' || !appId || /[\x00-\x1f]/.test(appId)) throw new Error('Invalid application ID.');
  const registered = await listStartApps();
  if (!registered.some((entry) => entry.AppID === appId)) throw new Error('This app is no longer registered with Windows. Reopen search and try again.');
  const target = ('shell:AppsFolder\\' + appId).replace(/'/g, "''");
  // Explorer can exit with code 1 after a successful activation; use ShellExecute directly.
  return runPowerShell(`$ErrorActionPreference = 'Stop'; (New-Object -ComObject Shell.Application).ShellExecute('${target}', '', '', 'open', 1)`);
}

module.exports = { search, launchApp, listStartApps };
