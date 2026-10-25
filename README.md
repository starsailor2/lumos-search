# Lumos Search

A desktop search launcher for Windows, built with Electron and React. Version 2.0.2 uses a dark monochrome pill with Aahar's DM Sans and Manrope typography, bundled for offline use. Results expand smoothly beneath the same input and resize to their content, without a sidebar or outer rectangular backdrop.

Press **Alt+,** (or **Alt+X**) anywhere to search apps, files, clipboard history, snippets, emoji, system commands, games, and more.

## Features

### Core
- **Global hotkey** — configurable with fallbacks
- **Full-drive file index** — background worker with instant cache startup
- **Responsive search** — cancellable search slices, cached folder scoring, and bounded results
- **True paste** — restores focus and simulates Ctrl+V into the previous app
- **Monochrome UI** — charcoal surfaces, gray dividers, local fonts, light/system theme options
- **React launcher** — keyboard navigation, secondary action buttons, file previews, and match highlighting

### Raycast-style providers
- `@files` / `@clip` / `@emoji` / `@system` / `@games` / `@process` / `@ai` scoped modes
- **Quicklinks** — keyword URL bookmarks
- **Clipboard history** — text + image, browse with `@clip`
- **Snippets** — find by trigger in the launcher and paste into the previous app; browse with `@snippets`
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
npm test         # regression tests
npm run typecheck
npm run test:smoke      # isolated Electron UI and integration checks
npm run test:benchmark  # synthetic 100k / 1m entry search benchmark
```

The app loads the React build from `dist/renderer/launcher/`. Build before launching Electron directly. The smoke test uses a temporary profile and fixture directory; it does not change your normal settings or clipboard history.

Type to open matching results beneath the pill. Clearing the input collapses it. Use **Ctrl+K** to toggle suggestions, **Up/Down** to select, **Enter** for the primary action, and **Shift+Enter** for the secondary action. Tab moves through buttons. Escape clears the query and collapses the results, then hides the launcher. All search types share this input; optional `@files`, `@emoji`, `@clip`, and other scopes remain available.

## Project structure

```
lumos-search/
├── src/
│   ├── main.js              # Electron main process
│   ├── search-index.js      # Match highlighting
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

Open via tray → Settings, or the Settings button in the expanded launcher's footer.

Configure hotkeys, appearance (theme/accent/glass blur), indexing, quicklinks, clipboard, snippets, AI, and more.

See [AUDIT.md](AUDIT.md) for the 2.0.1 audit, fixes, verification, and integration limits.
