# Lumos improvement sequence

This tracks the plan requested on 30 October 2026. Completed items below have regression and local Electron coverage; remaining items are not claimed as shipped.

## 1. Index controls and fast application results — implemented

- Searchable refresh, rebuild, and index-settings commands; live scan status in both windows; queued rebuilds and unreadable locations.
- Startup application-catalog warmup and nonblocking refresh of cached catalog entries.
- Incremental provider results, default selection of the best result, and preservation of user-selected identity during late updates.

## 2. File freshness and recovery — implemented

- Recursive monitoring of indexed roots, batched affected-folder rescans, retry while another scan runs, and reattachment of unavailable watchers.
- Reconciliation after resume and existing scheduled refresh/full-scan fallback.
- Retention of entries under unreadable locations during full rebuild as well as refresh.

## 3. Search scaling — first increment implemented

- File matching runs in a worker that receives index batches and updates. Queries do not resend the full index.
- Regression comparison against the reference matcher, including scoped, fuzzy, ancestor, rebuild and unavailable-root behavior.
- Capacity benchmark includes worker query times, main-thread heartbeats and process RSS.
- Remaining: faster exact/prefix candidate lookup without losing fallback matches, and moving legacy metadata consumers so the main process no longer keeps a second metadata index. Exhaustive matching remains linear; cold ingestion still takes time.

## 4. Interaction polish — official icon update implemented

- Flaticon Uicons 4.0 Thin Rounded throughout the launcher, vector brand glyphs where available, local fonts and publisher attribution.
- Action icons, supported-format preview controls, clickable index status, and useful missing-result recovery.
- Remaining: image/metadata previews and an extended mixed-DPI, multiple-monitor and accessibility review.

## 5. Feature discovery — first increment implemented

- Inline `@` mode suggestions, searchable maintenance commands, data-folder access, and a practical README covering all currently exposed sources.
- Remaining: canonical application deduplication and visual favourites/workflow editors. Current configuration-based workflows are documented accurately.

## 6. Privacy and release reliability — next

- OS-backed secret storage and a migration for existing keys; stronger clipboard persistence controls and protection.
- Opt-in diagnostic export with private content removed.
- Windows CI, installer-upgrade and recovery testing, visible update state, and a release workflow.
- Signing requires the owner's certificate/setup. No signing credential is present or assumed.

## Release checks still needed on relevant hardware/accounts

Mixed monitor scaling, removable/network-drive soak tests, cloud-placeholder behavior, elevated-app paste, game launches, a real configured AI endpoint, signed releases and real updater downloads.
