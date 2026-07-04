# Lumos Search 🔍

A Spotlight-style global search for Windows, built with Electron.
Press **Alt+,** (or **Alt+X**) anywhere and search every app, file, and folder on all your drives.

**Read-only by design** — the app can only *find*, *open*, and *navigate to* items.
It contains no code paths that rename, move, delete, or modify your files.

---

## Features

- **Global hotkey**: `Alt+,` or `Alt+X` from anywhere (falls back to `Ctrl+,` / `Ctrl+X` if taken).
- **Full-drive index**: crawls every drive letter (C:\, D:\, …) in a background worker thread.
- **App search**: Start Menu and Desktop shortcuts are indexed and ranked first, like Spotlight.
- **Smart ranking**: exact > prefix > word-boundary > substring > fuzzy matches; shallower paths rank higher.
- **Keyboard-first**: `↑↓` navigate · `Enter` open · `Ctrl+Enter` reveal in File Explorer · `Esc` close.
- **Instant startup**: index is cached in the app's own data folder, then refreshed in the background.
- **Auto-start**: the installed app launches with Windows and lives in the system tray.
- **Path search**: type a `\` or `/` in your query to also match against full paths.

---

## Requirements

- Windows 10/11
- [Node.js](https://nodejs.org) 18+ (only needed to build; the installed app is standalone)

---

## Installation

### Step 1 — Install dependencies (one time)

```powershell
cd D:\lumos-search
npm install
```

### Step 2 — Build the installer

```powershell
npm run dist
```

This produces:

```
D:\lumos-search\dist\Lumos Search Setup 1.0.0.exe
```

### Step 3 — Run the installer

Double-click `Lumos Search Setup 1.0.0.exe`. It is a one-click installer that:

- installs to your user profile (no admin needed),
- creates a **Desktop shortcut** and **Start Menu entry**,
- launches the app immediately after finishing.

> **SmartScreen warning?** The app isn't code-signed, so Windows may show
> "Windows protected your PC". Click **More info → Run anyway**.

### Step 4 — Done

The app now **starts automatically with Windows** and waits in the system tray.
You never need to open this folder again. Press **Alt+,** or **Alt+X** anytime.

First launch spends a few minutes indexing all drives — you can already search
while it runs; the item counter in the search bar shows progress.

---

## Usage

| Action | Key |
|---|---|
| Open / close search bar | `Alt+,` or `Alt+X` |
| Move through results | `↑` / `↓` |
| Open selected file or app | `Enter` |
| Show selected item in File Explorer | `Ctrl+Enter` |
| Close the search bar | `Esc` |
| Search inside full paths | include `\` in the query, e.g. `users\srish` |

**Tray menu** (right-click the tray dot): show search, rebuild index, quit.

---

## Running without installing (dev mode)

```powershell
cd D:\lumos-search
npm start
```

Same app, but no auto-start with Windows and no shortcuts.

---

## Troubleshooting

**Build fails with "Cannot create symbolic link … winCodeSign"**
Already handled: `"signAndEditExecutable": false` in `package.json` skips the
code-signing toolkit. If you ever want executable metadata/icons embedded,
enable *Settings → System → For developers → Developer Mode*, delete
`C:\Users\<you>\AppData\Local\electron-builder\Cache\winCodeSign`, and rebuild.

**Alt+, / Alt+X doesn't open the bar**
Another app owns the hotkey; Lumos automatically falls back to `Ctrl+,` / `Ctrl+X`.
To change it permanently, edit `HOTKEYS` in `src/main.js` and rebuild.

**A new file doesn't show up in results**
The index is a snapshot. Rebuild it: tray icon → **Rebuild index** (or restart the app).

**Search feels slow or memory is high**
Memory scales with file count (2–4M entries ≈ a few hundred MB). Add noisy
folders to `SKIP_DIRS` in `src/indexer.js` and rebuild the index.

**Uninstall**
Settings → Apps → Installed apps → Lumos Search → Uninstall.
This also removes the index cache (`%APPDATA%\lumos-search`).

---

## Read-only guarantees

- Renderer is sandboxed: `sandbox: true`, `contextIsolation: true`, no `nodeIntegration`.
- The preload exposes exactly four capabilities: `search`, `open`, `reveal`, `hide`.
- The only OS actions taken on your data are `shell.openPath` (open files or
  shortcut targets with the default handler) and `shell.showItemInFolder`
  (navigate in File Explorer).
- The indexer uses only directory reads (`fs.readdirSync`); symlinks are skipped.
- The only file the app ever writes is its own index cache in `%APPDATA%\lumos-search\`.

---

## Configuration

| Setting | File | Default |
|---|---|---|
| Hotkey | `src/main.js` → `HOTKEYS` | `Alt+,`, `Alt+X` |
| Max results shown | `src/main.js` → `MAX_RESULTS` | 40 |
| Skipped folders | `src/indexer.js` → `SKIP_DIRS` | recycle bin, WinSxS, node_modules, .git, … |

After changing anything: `npm run dist` and reinstall (or just `npm start` to test).

---

## Project structure

```
lumos-search/
├── package.json          # app metadata + electron-builder config
└── src/
    ├── main.js           # main process: window, tray, hotkey, search, IPC
    ├── indexer.js        # worker thread: crawls drives + Start Menu (read-only)
    ├── preload.js        # exposes search/open/reveal/hide to the UI
    └── renderer/
        └── index.html    # the Spotlight-style search UI
```
