// True paste: restore focus to the previous foreground window and simulate Ctrl+V.
// Falls back to copy-only if PowerShell SendKeys fails (e.g. elevated apps).

const { runPowerShell } = require('./powershell');

function restoreAndPaste(text, clipboard, onDone) {
  clipboard.writeText(text);
  if (process.platform !== 'win32') {
    onDone && onDone(false);
    return;
  }
  // Windows restores focus when the launcher hides. A delayed foreground
  // capture can instead remember Lumos itself and paste back into search.
  runPowerShell('Add-Type -AssemblyName System.Windows.Forms; Start-Sleep -Milliseconds 120; [System.Windows.Forms.SendKeys]::SendWait("^v")')
    .then(() => onDone && onDone(true)).catch(() => onDone && onDone(false));
}

module.exports = { restoreAndPaste };
