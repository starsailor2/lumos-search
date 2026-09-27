// True paste: restore focus to the previous foreground window and simulate Ctrl+V.
// Falls back to copy-only if PowerShell SendKeys fails (e.g. elevated apps).

const { exec } = require('child_process');

let previousHwnd = null;

function captureForeground() {
  if (process.platform !== 'win32') return;
  const ps = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class Win32 { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); }'; [Win32]::GetForegroundWindow().ToInt64()`;
  exec(`powershell -NoProfile -Command "${ps}"`, { windowsHide: true }, (err, stdout) => {
    if (err) return;
    const hwnd = parseInt(String(stdout).trim(), 10);
    if (Number.isFinite(hwnd) && hwnd > 0) previousHwnd = hwnd;
  });
}

function restoreAndPaste(text, clipboard, onDone) {
  clipboard.writeText(text);
  if (process.platform !== 'win32') {
    onDone && onDone(false);
    return;
  }
  const hwnd = previousHwnd || 0;
  const ps = `Add-Type -AssemblyName System.Windows.Forms; Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class Win32 { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd); }'; if (${hwnd} -gt 0) { [void][Win32]::SetForegroundWindow([IntPtr]${hwnd}) }; Start-Sleep -Milliseconds 60; [System.Windows.Forms.SendKeys]::SendWait("^v")`;
  exec(`powershell -NoProfile -Command "${ps}"`, { windowsHide: true }, (err) => {
    onDone && onDone(!err);
  });
}

module.exports = { captureForeground, restoreAndPaste };
