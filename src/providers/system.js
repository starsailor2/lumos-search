// System commands — lock, sleep, shutdown, settings, volume.

const { exec } = require('child_process');

const COMMANDS = [
  { id: 'lock', title: 'Lock Screen', subtitle: 'System', icon: '🔒', keywords: ['lock', 'screen'] },
  { id: 'sleep', title: 'Sleep', subtitle: 'System', icon: '😴', keywords: ['sleep', 'suspend'] },
  { id: 'shutdown', title: 'Shut Down', subtitle: 'System', icon: '⏻', keywords: ['shutdown', 'shut', 'off'] },
  { id: 'restart', title: 'Restart', subtitle: 'System', icon: '🔄', keywords: ['restart', 'reboot'] },
  { id: 'settings', title: 'Windows Settings', subtitle: 'System', icon: '⚙️', keywords: ['settings', 'config'] },
  { id: 'display', title: 'Display Settings', subtitle: 'System', icon: '🖥️', keywords: ['display', 'monitor', 'screen'] },
  { id: 'volume-up', title: 'Volume Up', subtitle: 'System', icon: '🔊', keywords: ['volume', 'louder', 'up'] },
  { id: 'volume-down', title: 'Volume Down', subtitle: 'System', icon: '🔉', keywords: ['volume', 'quieter', 'down'] },
  { id: 'volume-mute', title: 'Mute Volume', subtitle: 'System', icon: '🔇', keywords: ['mute', 'silent'] },
  { id: 'empty-trash', title: 'Empty Recycle Bin', subtitle: 'System', icon: '🗑️', keywords: ['trash', 'recycle', 'bin'] },
];

function runSystemCommand(id) {
  const cmds = {
    lock: 'rundll32.exe user32.dll,LockWorkStation',
    sleep: 'rundll32.exe powrprof.dll,SetSuspendState 0,1,0',
    shutdown: 'shutdown /s /t 0',
    restart: 'shutdown /r /t 0',
    settings: 'start ms-settings:',
    display: 'start ms-settings:display',
    'volume-up': 'powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]175)"',
    'volume-down': 'powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]174)"',
    'volume-mute': 'powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"',
    'empty-trash': 'powershell -Command "Clear-RecycleBin -Force -ErrorAction SilentlyContinue"',
  };
  const cmd = cmds[id];
  if (cmd) exec(cmd, { windowsHide: true });
}

function search(ctx) {
  const { q, qLower } = ctx;
  const results = [];
  for (const cmd of COMMANDS) {
    let score = -1;
    if (!q) score = 350;
    else if (cmd.title.toLowerCase().includes(qLower)) score = 700;
    else if (cmd.keywords.some((k) => k.includes(qLower) || qLower.includes(k))) score = 600;
    if (score < 0) continue;
    results.push({
      type: 'system',
      id: 'sys:' + cmd.id,
      title: cmd.title,
      subtitle: cmd.subtitle,
      score,
      icon: cmd.icon,
      actions: ['system-run'],
      data: { commandId: cmd.id },
    });
  }
  return results;
}

module.exports = { search, runSystemCommand };
