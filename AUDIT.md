# Lumos Search 2.0.1 audit and repair

## 2.0.5 application search priority

Normal name searches now place matching applications before other results, retaining relevance and usage ranking within each group. The bounded index scan reserves app priority before trimming candidates, and the final provider merge applies the same ordering before deduplication and the global result limit. Learned file preferences cannot displace matching apps. Explicit scopes, direct path queries, and empty suggestions keep their existing behavior. `File Manager` matches the registered Windows File Explorer app.

Validation: all 24 regression tests, TypeScript, and native Electron checks passed. Coverage includes crowded file results, app priority across providers, within-group ranking, learned intent, limits, scopes, and path queries. Camera, WhatsApp, and File Manager each returned their installed Windows application ahead of same-name file/folder fixtures. The 100,000-entry and one-million-entry capacity checks remained bounded and continued yielding to the event loop.

## 2.0.4 illustrated SVG icons

Twenty standalone SVG illustrations replace the outline glyphs for files, folders, media, search, and commands. File extensions select the matching artwork; extension badges remain available for specific formats. Native application logos and actual emoji search results retain their existing rendering. Assets are bundled offline and require no new dependency.

Validation: all 22 regression tests, TypeScript, and the native Electron smoke checks passed. Coverage includes local vector content and paint references, eight file-type mappings, successful image loading, folder artwork, and the existing launcher interactions. The full icon collection and native launcher captures were visually inspected. The assets also have a reproducible SVG/PNG preview script.

## 2.0.3 colored icons and Windows applications

The dark launcher now uses file-type colors and extension badges: PDFs red, folders/archives yellow, spreadsheets green, documents/code blue, and media purple/pink. Native desktop app icons keep their original colors instead of being desaturated.

Windows app search now combines Start-menu shortcuts with the current user's cached `Get-StartApps` catalog. Registered applications, including Store apps, launch through the Windows shell using validated app IDs. Their recents preserve the app action instead of treating an application ID as a file path. Administrator access is not required for normal app launching.

Validation includes registered-app matching, ID validation, recents, action routing, and real Electron checks of five file-color categories. Windows returned 182 registered apps on the test PC, and Calculator was activated under a non-elevated Windows token. Other applications' elevation prompts and organization-specific Windows policies remain integration limits.

## 2.0.2 launcher interaction follow-up

The compact and expanded interfaces now share one persistent input and one 600-pixel-wide surface. Results open below the bar; measured content determines the window height. A 220-ms easing animation changes only the bottom edge, can retarget during typing, and respects disabled animations/reduced-motion preferences. Results scroll within a capped height. Clearing the query collapses the launcher.

The sidebar and category-switching UI were removed; all providers still search through the same input, with optional `@` scopes. The Windows acrylic backdrop was removed, leaving transparent corners around the pill. Selection scrolling now affects only the results list, preventing hidden suggestions from scrolling the search header out of view.

Validation: 18 regression tests, TypeScript, and real Electron/native-input checks passed. The integration test checks intermediate animation frames, unchanged top position/width/header geometry/input identity, different heights for short and long result sets, preview growth, clear/collapse, transparent compact corners, and unified file/folder/emoji/extension search. Existing integration limits below still apply.

## Original audit

What this repo does: Lumos is a Windows desktop launcher that searches a local file index and runs commands through Electron. It also searches clipboard history, snippets, emoji, quicklinks, games, windows, processes, workflows, and an optional AI endpoint. The assumed load is one Windows user, with a synthetic capacity check up to one million indexed paths.

All shipped JavaScript, React components, HTML, styles, provider implementations, extension sample, and build configuration were inspected. The requested changes were implemented in the working tree. This is a record of concrete fixes, not a claim that every possible machine or integration is fault-free.

## Must fix — repaired

1. **Cold indexing stopped showing new batches and rebuild requests disappeared.** The first batch made `idx.count` nonzero, disabling further live additions; active scans discarded rebuild requests. The first-run streaming decision is now fixed for the crawl, subsequent rebuilds queue, replacement indexes build incrementally, and index progress refreshes visible results. Without this fix, searches appeared incomplete until an entire drive scan finished.

2. **Overlapping scans duplicated paths and hot refresh could remove unavailable data.** Start Menu/Desktop and drive scans indexed the same paths, while inaccessible hot roots were treated as empty. Paths now deduplicate case-insensitively, shortcut app identity survives merging, unreadable hot roots/subtrees retain their existing entries, and junctions are skipped to prevent cycles. Worker failure preserves the previous live index and reports an error.

3. **Typing blocked on synchronous PowerShell processes.** Windows and process enumeration ran on every query. These now use asynchronous, cached snapshots; expensive enumeration is limited to its relevant mode. Drive probing no longer launches PowerShell on the main thread. Without the fix, the native window and renderer IPC could freeze during ordinary typing.

4. **Search omitted legitimate matches.** Name-only bigram candidates excluded ancestor and fuzzy matches, and arbitrary token limits ignored parts of queries. Search now evaluates the matching rules consistently, preserves filename casing, filters app/file/folder scopes before limiting, and accounts for learned intent before selecting bounded results. Fuzzy highlighting marks the actual matched letters.

5. **Large searches allocated every match and index-cache work blocked the app.** Search now yields every 1,000 entries, cancels superseded work, caches parent scores, and keeps only the configured best results. Cache loading streams; cache saving writes serialized chunks and atomically replaces the previous file. The obsolete bigram/trie path was removed.

6. **Renderer subscriptions accumulated and actions could use stale results.** Preload events now return unsubscribe functions, effects clean up, queries invalidate pending responses, errors are shown, and actions wait for the current query. Keyboard selection scrolls into view, input focus survives expansion, and IME composition is respected.

7. **Appearance settings did not affect the active UI.** The old launcher hardcoded colors and did not consume appearance settings. The launcher and settings now share monochrome tokens, bundled DM Sans/Manrope fonts, live appearance updates, reduced-motion support, and semantic keyboard controls. Dark mode is the default and migrates existing version-1 appearance settings as requested; light/system remain available.

8. **Categories hid features and secondary actions were unreachable.** Categories filtered an already-truncated global response; many provider types had no usable category. Categories now request their provider scope directly. Clipboard, emoji, windows, processes, games, web/AI, and workflows are exposed. Selected results have action buttons and optional text preview.

9. **Copying an image copied the placeholder text, and image identities collided.** The text branch ran before the image branch, and only a common image-header prefix was used for identity. Image actions now write image data, and image history uses a full-content hash with a per-image size limit.

10. **Cleared clipboard data could be written back to disk.** Pending saves were not canceled, retention-off startup still loaded disk history, and clearing immediately recaptured the unchanged clipboard. Saves now respect the current retention preference, pending saves are canceled on clear/preference changes, and the current clipboard identity is remembered. Clipboard queries filter their text; snippet scopes browse snippets without mixing in history. Clipboard/snippet content is no longer recorded as launch intent.

11. **Calculator and conversion inputs produced wrong answers.** Malformed decimals were accepted by `parseFloat`, compact `2x3` failed, unary-minus precedence was incorrect, and negative/degree-marked temperatures were rejected. Parsing now validates literals, handles whitespace and compact multiplication, applies exponent precedence, and accepts signed conversions. Regression cases cover these inputs.

12. **Workflow steps disagreed with configuration and ran without awaiting opens.** The documented `{action, data}` format was not consumed by the action handler. Both legacy and nested steps are normalized, supported steps validate, file opens run sequentially, and failures stop execution with a visible error.

13. **AI failures looked like successful answers and requests could hang.** HTTP status errors and invalid responses were copied as text, endpoint query strings were dropped, and there was no timeout. Errors now reject, response size and request time are bounded, endpoint queries survive, and answers/errors remain readable in the launcher.

14. **Native actions had broken quoting, incorrect snap/media keys, and unsafe process interpolation.** PowerShell now receives encoded scripts through `execFile`; process IDs validate and use argument arrays; self-termination is rejected. Window snapping uses native window positioning instead of sending Alt+Arrow. Volume uses actual media-key events and sleep calls the correctly typed Windows power API. Paste relies on focus restoration after hiding instead of a delayed capture that could remember Lumos itself.

15. **Action failures vanished and destructive actions had no confirmation.** Failed `openPath` calls previously counted as launches and hid the window. Opens and system actions now report errors; failed native actions can restore the window. Shutdown, restart, empty-trash, and process termination require an in-app confirmation with Cancel selected by default. Workflow opens also report failures.

16. **Settings could inject folder names as HTML and discarded focus while saving.** Folder/exclusion labels now use `textContent`; normal saves no longer rebuild every editor. Persistence errors are reported instead of silently claiming success. Partial refresh patches merge correctly, workflow records sanitize, count limits round to valid integers, and settings/launcher navigation is restricted.

17. **Malformed history and reserved keys could break ranking.** Persisted usage/intent records now validate, reserved query names are handled as own properties, intent/analytics flush on exit, and “Clear usage history” clears all three usage stores. Analytics key counts are bounded.

18. **Extension searches had no execution deadline and received private config.** Each extension now runs in a separate worker with a memory limit, timed VM invocation, and host-side deadline. Searches receive query context only and return bounded JSON results. Plugins and their microtasks no longer run on Electron's main thread or receive API keys and clipboard data. Node's VM is not a security boundary for hostile plugins; installed local extensions must still be trusted.

19. **The release configuration omitted runtime functionality and bundled vulnerable tools.** The updater moved to runtime dependencies; the update owner now matches the Git remote (`starsailor2/lumos-search`). Uninstall preserves app data. Executable resource editing stays enabled so icon/version metadata is applied. Electron is now 45.0.0, electron-builder 26.18.0, and Vite 6.4.5 in the lockfile. `npm audit` went from 19 advisories to zero. Electron release support was checked against the [official release schedule](https://releases.electronjs.org/schedule).

20. **Verification was missing and a shared type import was wrong.** A repeatable regression suite, typecheck, real Electron smoke test, and capacity benchmark were added. The shared hook's invalid import was corrected. Verified unused UI components and five unused direct dependencies were removed.

## Verification

- `npm test`: 17 regression tests passed.
- `npm run typecheck`: passed.
- `npm run test:smoke`: real Electron 45 startup, fixture indexing, extension search, renderer results, focus, bounds, preview, bundled fonts, settings, and live appearance passed with an isolated profile.
- `npm run test:benchmark`: synthetic 100,000-entry search about 144 ms; one-million-entry search about 467 ms in the recorded run. Results stay capped and event-loop work continues. These are local measurements, not a universal latency promise.
- `npm audit`: zero reported vulnerabilities after dependency fixes.
- Dark and light launcher screenshots were visually inspected. The requested delivery uses dark mode.
- The Windows NSIS installer built successfully. Payload verification compared all 51 source and UI/font assets against the working tree and confirmed the runtime updater is present. The executable contains Lumos branding and version 2.0.1 metadata.

## Remaining manual integration checks

No live paid AI request, shutdown/restart/recycle-bin action, forced process termination, or elevated-app paste was performed. Steam/Epic launches, multiple monitors/DPI combinations, real release downloads, and prolonged scans of removable/network drives still need checks on the relevant installed environments. Full scans can take time; large matching queries still perform a linear scan, split into cancellable slices.

The installer is a local unsigned build because no signing certificate is configured. Release hosting was not published or changed. Existing installed/running copies must be replaced or restarted using the new build to receive the changes.

Verdict: the reproduced indexing, UI, action, persistence, and packaging defects above are repaired and covered by repeatable checks. Native integrations listed above remain explicit release-validation limits.
