// System commands — lock, sleep, shutdown, settings, volume.

const { exec } = require('child_process');
const { runPowerShell } = require('../powershell');

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
  if (id.startsWith('volume-')) {
    const key = { 'volume-up': 175, 'volume-down': 174, 'volume-mute': 173 }[id];
    if (!key) return Promise.reject(new Error('Unknown volume command.'));
    return runPowerShell(`Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class MediaKey { [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra); }'; [MediaKey]::keybd_event(${key}, 0, 0, [UIntPtr]::Zero); [MediaKey]::keybd_event(${key}, 0, 2, [UIntPtr]::Zero)`);
  }
  if (id === 'sleep') return runPowerShell(`Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class Power { [DllImport("PowrProf.dll", SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool SetSuspendState(bool hibernate, bool force, bool disableWake); }'; if (-not [Power]::SetSuspendState($false, $false, $false)) { throw 'Unable to put this PC to sleep.' }`);
  const cmds = {
    lock: 'rundll32.exe user32.dll,LockWorkStation',
    shutdown: 'shutdown /s /t 0',
    restart: 'shutdown /r /t 0',
    settings: 'start ms-settings:',
    display: 'start ms-settings:display',
    'empty-trash': 'powershell -Command "Clear-RecycleBin -Force -ErrorAction SilentlyContinue"',
  };
  const cmd = cmds[id];
  if (!cmd) return Promise.reject(new Error('Unknown system command.'));
  return new Promise((resolve, reject) => exec(cmd, { windowsHide: true, timeout: 10000 },
    (error) => error ? reject(error) : resolve()));
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
