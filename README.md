# Lumos Search 🔍

A Spotlight-style global search for Windows, built with Electron.
Press **Alt+,** (or **Alt+X**) anywhere and search every app, file, and folder on all your drives.

**Read-only by design** — the app can only *find*, *open*, and *navigate to* items.
It contains no code paths that rename, move, delete, or modify your files.

---

## Features

- **Global hotkey**: configurable (default `Alt+,` / `Alt+X`, falls back to `Ctrl+,` / `Ctrl+X` if taken).
- **Full-drive index**: crawls every drive letter (C:\, D:\, …), or just the folders you choose, in a background worker thread.
- **App search**: Start Menu and Desktop shortcuts are indexed and ranked first, like Spotlight.
- **Quick actions**: type a calculation (`12*4+1`) or a conversion (`10 km to mi`) for an instant answer, or fall back to a web search.
- **Clipboard history & snippets**: recent text you've copied and your own saved snippets show up right alongside file results.
- **Smart ranking**: exact > prefix > word-boundary > substring > fuzzy matches, boosted by how often and recently you actually open each result ("frecency").
- **Real file/app icons**, loaded lazily so typing never slows down; a preview pane for small text files and images.
- **Keyboard-first**: `↑↓` navigate · `Enter` runs the primary action (open/paste/copy) · `Ctrl+Enter` reveals in File Explorer when available · `Esc` close.
- **Settings window**: change the hotkey, indexed folders, quick actions, clipboard behavior, and snippets without editing any files.
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
| Calculate | type a math expression, e.g. `12*4+1` |
| Convert units | `10 km to mi`, `100 f to c` |
| Open Settings | click the item counter (bottom right of the search bar), or tray → Settings… |

**Tray menu** (right-click the tray icon): show search, open Settings, toggle clipboard history, rebuild index, quit.

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
Open **Settings** (tray → Settings…) and rebind it to whatever combination you like — no rebuild needed.

**A new file doesn't show up in results**
The index is a snapshot. Rebuild it: tray icon → **Rebuild index**, or Settings → **Rebuild index now**.

**Search feels slow or memory is high**
Memory scales with file count (2–4M entries ≈ a few hundred MB). Add noisy
folders to the excluded-folders list in **Settings**, or restrict indexing to
specific folders there instead of the whole drive.

**I don't want my clipboard history captured**
Turn it off from the tray menu (one click) or in Settings → Clipboard history.
It's on by default but never leaves your machine, captures text only, and
you can also disable disk retention so it never touches disk at all.

**Uninstall**
Settings → Apps → Installed apps → Lumos Search → Uninstall.
This also removes all of the app's local data (`%APPDATA%\Lumos Search`), including
the index cache, your configuration, and clipboard history if it was retained.

---

## Read-only guarantees

- Renderer is sandboxed: `sandbox: true`, `contextIsolation: true`, no `nodeIntegration` — true of both the search window and the Settings window.
- The main search window's preload never exposes config-write capabilities;
  only the separate Settings window's preload can change configuration.
- The only OS actions taken on your **files** are `shell.openPath` (open files
  or shortcut targets with the default handler) and `shell.showItemInFolder`
  (navigate in File Explorer). No `fs.write`/rename/delete ever touches a
  file or folder that isn't already the app's own data below.
- The indexer uses only directory reads (`fs.readdirSync`); symlinks are skipped.
- The app's own local data — index cache, configuration, usage stats used for
  ranking, optional clipboard history, and the icon cache — lives entirely in
  `%APPDATA%\Lumos Search\`, never inside your files. Clipboard history is
  text-only, capped in size, and can be disabled (or excluded from disk
  entirely) from Settings or the tray menu at any time.
- Config/usage-stat writes are atomic (write to a temp file, then rename) so
  an interrupted write can't leave a corrupted file behind.

---

## Configuration

Everything is now configurable from the in-app **Settings window**
(tray → Settings…, or click the item counter in the search bar): hotkey,
indexed folders, excluded folders, max results, quick-action toggles and
search engine, clipboard behavior, and snippets. Nothing requires editing
source or rebuilding anymore.

---

## Project structure

```
lumos-search/
├── package.json          # app metadata + electron-builder config
└── src/
    ├── main.js           # main process: window, tray, hotkey, search orchestration, IPC
    ├── config.js         # persisted settings (config.json), atomic writes
    ├── frecency.js       # usage-based ranking boost (frecency.json)
    ├── icons.js          # lazy, cached real file/app icon resolution
    ├── indexer.js        # worker thread: crawls drives + Start Menu (read-only)
    ├── preload.js        # read/launch-only capabilities for the search window
    ├── preload-settings.js # config read/write capabilities, Settings window only
    ├── settings-window.js  # creates/reuses the Settings BrowserWindow
    ├── providers/
    │   ├── index.js      # ordered list of search providers
    │   ├── files.js       # file/folder/app index scoring
    │   ├── quickactions.js # calculator, unit conversion, web search
    │   └── clipboard.js   # clipboard history + snippets
    └── renderer/
        ├── index.html    # the Spotlight-style search UI
        └── settings.html # the Settings UI
```
