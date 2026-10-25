// Process manager — list and kill running processes.

const { execFile } = require('child_process');
const { cachedSnapshot } = require('../powershell');

const listProcesses = cachedSnapshot('Get-Process | Sort-Object CPU -Descending | Select-Object Id, ProcessName, CPU, WorkingSet | ConvertTo-Json -Compress');

function killProcess(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid) return Promise.resolve(false);
  return new Promise((resolve) => execFile('taskkill.exe', ['/PID', String(pid), '/F'],
    { windowsHide: true, timeout: 5000 }, (error) => resolve(!error)));
}

function formatMem(bytes) {
  const mb = Math.round((bytes || 0) / 1048576);
  return mb + ' MB';
}

async function search(ctx) {
  if (!['process', 'processes', 'proc'].includes(ctx.scope)) return [];
  const { q, qLower } = ctx;
  const procs = await listProcesses();
  const results = [];
  for (const p of procs) {
    if (!p || !p.ProcessName) continue;
    let score = -1;
    if (!q) score = 250;
    else if (p.ProcessName.toLowerCase().includes(qLower)) score = 550;
    if (score < 0) continue;
    results.push({
      type: 'process',
      id: 'proc:' + p.Id,
      title: p.ProcessName,
      subtitle: 'Process · PID ' + p.Id + ' · ' + formatMem(p.WorkingSet),
      score,
      icon: '⚙️',
      actions: ['kill-process'],
      data: { pid: p.Id, name: p.ProcessName },
    });
    if (results.length >= 30) break;
  }
  return results;
}

module.exports = { search, killProcess };
