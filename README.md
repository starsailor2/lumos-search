# Lumos Search

A premium Raycast-class global search launcher for Windows, built with Electron and React.

Press **Alt+,** (or **Alt+X**) anywhere to search apps, files, clipboard history, snippets, emoji, system commands, games, and more.

## Features

### Core
- **Global hotkey** — configurable with fallbacks
- **Full-drive file index** — background worker with instant cache startup
- **Fast search** — prefix trie + inverted word index (sub-16ms on large indexes)
- **True paste** — restores focus and simulates Ctrl+V into the previous app
- **Glassmorphic UI** — Windows Acrylic + backdrop blur, Framer Motion animations
- **React launcher** — virtualized result list, action panel (Tab), match highlighting

### Raycast-style providers
- `@files` / `@clip` / `@emoji` / `@system` / `@games` / `@process` / `@ai` scoped modes
- **Quicklinks** — keyword URL bookmarks
- **Clipboard history** — text + image, browse with `@clip`
- **Snippets** — trigger-based text expansion
- **Calculator** — natural language (`120 x 4 - 28`)
- **Unit conversion** — length, mass, volume, temperature, data
- **Emoji picker** — search by name, copy to clipboard
- **System commands** — lock, sleep, shutdown, volume, settings
- **Window management** — snap, focus, list open windows
- **Game launcher** — Steam + Epic Games libraries
- **Process manager** — list and kill processes
- **Quick AI** — BYOK OpenAI-compatible API
- **Workflows** — multi-step command chains

### Premium extras
- Favourites + recents empty-state UX
- Extension plugin system with sample Lorem Ipsum extension
- Path intelligence (`cd ~/projects`)
- Batch path copy
- Local search analytics
- Auto-update (electron-updater, packaged builds)
- Onboarding welcome on first run

## Development

```powershell
npm install
npm run build    # build React launcher
npm start        # run Electron
npm run dist     # build + Windows installer
```

The app loads the React build from `dist/renderer/launcher/` when present, falling back to `src/renderer/index.html`.

## Project structure

```
lumos-search/
├── src/
│   ├── main.js              # Electron main process
│   ├── search-index.js      # Fast file search index
│   ├── paste.js             # True paste via PowerShell
│   ├── extensions.js        # Plugin loader
│   ├── analytics.js         # Local search analytics
│   ├── providers/           # Search providers
│   ├── launcher/            # React UI (Vite)
│   ├── shared/              # Types and hooks
│   └── styles/tokens.css    # Design tokens
├── extensions/sample-lorem/ # Sample plugin
└── dist/renderer/launcher/  # Built UI
```

## Settings

Open via tray → Settings, or click the item counter in the search bar.

Configure hotkeys, appearance (theme/accent/glass blur), indexing, quicklinks, clipboard, snippets, AI, and more.
