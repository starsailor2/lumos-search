// Process manager — list and kill running processes.

const { execSync } = require('child_process');

function listProcesses() {
  if (process.platform !== 'win32') return [];
  try {
    const ps = 'Get-Process | Sort-Object CPU -Descending | Select-Object -First 80 Id, ProcessName, CPU, WorkingSet | ConvertTo-Json -Compress';
    const out = execSync(`powershell -NoProfile -Command "${ps}"`, { encoding: 'utf8', windowsHide: true });
    const parsed = JSON.parse(out || '[]');
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function killProcess(pid) {
  try {
    execSync(`taskkill /PID ${pid} /F`, { windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

function formatMem(bytes) {
  const mb = Math.round((bytes || 0) / 1048576);
  return mb + ' MB';
}

function search(ctx) {
  const { q, qLower } = ctx;
  const procs = listProcesses();
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
