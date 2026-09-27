// Window management — list/snap/focus windows via PowerShell.

const { execSync } = require('child_process');

function listWindows() {
  if (process.platform !== 'win32') return [];
  try {
    const ps = 'Get-Process | Where-Object MainWindowTitle | Select-Object Id, MainWindowTitle, ProcessName | ConvertTo-Json -Compress';
    const out = execSync(`powershell -NoProfile -Command "${ps}"`, { encoding: 'utf8', windowsHide: true });
    const parsed = JSON.parse(out || '[]');
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr.filter((w) => w && w.MainWindowTitle);
  } catch {
    return [];
  }
}

function focusWindow(pid) {
  if (process.platform !== 'win32') return;
  const ps = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class Win32 { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow); }'; $p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($p -and $p.MainWindowHandle -ne 0) { [Win32]::ShowWindow($p.MainWindowHandle, 9); [Win32]::SetForegroundWindow($p.MainWindowHandle) }`;
  try {
    require('child_process').execSync(`powershell -NoProfile -Command "${ps}"`, { windowsHide: true });
  } catch { /* ignore */ }
}

function snapWindow(direction) {
  const keys = { left: '%{LEFT}', right: '%{RIGHT}', maximize: '%{UP}', minimize: '%{DOWN}' };
  const key = keys[direction];
  if (!key) return;
  try {
    execSync(`powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys('${key}')"`, { windowsHide: true });
  } catch { /* ignore */ }
}

function search(ctx) {
  const { q, qLower } = ctx;
  const results = [];
  const windows = listWindows();

  const snapCommands = [
    { id: 'snap-left', title: 'Snap Window Left', icon: '◧', keywords: ['snap', 'left'] },
    { id: 'snap-right', title: 'Snap Window Right', icon: '◨', keywords: ['snap', 'right'] },
    { id: 'maximize', title: 'Maximize Window', icon: '⬜', keywords: ['maximize', 'full'] },
    { id: 'minimize', title: 'Minimize Window', icon: '➖', keywords: ['minimize'] },
  ];

  for (const cmd of snapCommands) {
    let score = -1;
    if (!q) score = 300;
    else if (cmd.title.toLowerCase().includes(qLower) || cmd.keywords.some((k) => k.includes(qLower))) score = 650;
    if (score < 0) continue;
    results.push({
      type: 'window',
      id: 'win:' + cmd.id,
      title: cmd.title,
      subtitle: 'Window Management',
      score,
      icon: cmd.icon,
      actions: ['window-snap'],
      data: { snapId: cmd.id },
    });
  }

  for (const w of windows) {
    const title = w.MainWindowTitle;
    if (!title) continue;
    let score = -1;
    if (!q) score = 280;
    else if (title.toLowerCase().includes(qLower)) score = 550;
    else if (w.ProcessName && w.ProcessName.toLowerCase().includes(qLower)) score = 500;
    if (score < 0) continue;
    results.push({
      type: 'window',
      id: 'winfocus:' + w.Id,
      title,
      subtitle: 'Window · ' + w.ProcessName,
      score,
      icon: '🪟',
      actions: ['window-focus'],
      data: { pid: w.Id },
    });
    if (results.length > 50) break;
  }
  return results;
}

module.exports = { search, focusWindow, snapWindow };
