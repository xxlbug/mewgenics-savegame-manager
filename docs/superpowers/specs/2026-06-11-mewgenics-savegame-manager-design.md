# Mewgenics Savegame Manager — Design

**Date:** 2026-06-11
**Status:** Approved

## Purpose

A browser-based tool to manage Mewgenics savegames: create and restore backups
(both the game's own and user-managed ones), inspect savegame statistics
(cats, house state, adventure status), and diff two saves. Must be usable
while the game is running.

## Constraints

- **Pure browser app** — no server. Hosted on GitHub Pages
  (`https://xxlbug.github.io/mewgenics-savegame-manager/`).
- **Public repo** — required for free GitHub Pages.
- **Chrome/Edge only** — depends on the File System Access API
  (`showDirectoryPicker`); not available in Firefox/Safari.
- Save location (Windows):
  `%APPDATA%\Glaiel Games\Mewgenics\<steamid>\saves\`
  - Live save: `steamcampaign01.sav` (any `*.sav`)
  - Game backups: `backups/*.savbackup`

## Savegame format (reverse-engineered)

`.sav` files are SQLite 3 databases. Tables:

| Table | Schema | Content |
|---|---|---|
| `properties` | `key TEXT, data ANY` | Plain key/value game state |
| `cats` | `key INTEGER, data BLOB` | One row per cat, undocumented binary blob |
| `files` | `key TEXT, data BLOB` | Larger state blobs (adventure_state, house_state, …) |
| `furniture` | `key INTEGER, data BLOB` | Furniture items |
| `winning_teams` | `key INTEGER, data BLOB` | Past winning teams |

Confirmed `properties` keys of interest: `house_gold`, `house_food`,
`blank_collars`, `current_day`, `current_house_weather`, `on_adventure`,
`adventure_coins`, `adventure_food`, `save_file_percent`,
`house_boss_countdown`, `next_house_boss`, `house_storage_upgrades`,
`version_string`.

Confirmed blob findings:
- `files.adventure_state`: int32 count at offset 0, then `count` × int64 cat
  IDs starting at offset 4. IDs reference `cats.key`.
- `cats.data`: UTF-16LE cat name at offset 22 (length-prefixed region not yet
  fully mapped). Rest of blob (stats, class, level, HP) to be
  reverse-engineered incrementally.

## Architecture

Pure client-side app, three layers:

### Filesystem layer
- File System Access API. User picks the `saves` folder once via
  `showDirectoryPicker`; the directory handle is persisted in IndexedDB so
  later visits only need a one-click permission re-grant.
- All file access goes through this handle: live `.sav`, game's `backups/`
  subfolder, and our own `manager_backups/` subfolder (created inside
  `saves/` so it travels with the save location, no second picker).

### Savegame layer
- sql.js (SQLite compiled to WASM) opens `.sav` bytes entirely in memory,
  read-only. Bundled with the app (not CDN) so the tool works offline after
  first load.
- Parser modules:
  - `properties.ts` — typed accessors for the keys listed above
  - `cats.ts` — best-effort binary blob parser (name reliable; class/level/HP
    added as reverse-engineering matures; unknown fields degrade to "unknown",
    never crash)
  - `adventure.ts` — party cat IDs from `adventure_state`, joined with names

### UI layer
- Vanilla TypeScript + DOM, no framework (app is small).
- Views:
  - **Dashboard** — house stats, progress %, adventure status + party
  - **Cats** — list with ID, name, on-adventure badge, class/level/HP when
    parseable
  - **Backups** — game backups and own backups side by side; snapshot,
    restore, diff

## Concurrent use with running game

The app never holds a file open: reads load bytes into memory, parse, done.
Writes (restore, snapshot) write the whole file in one atomic
`createWritable()` pass. Reading is always safe while the game runs. The UI
shows a warning on restore-while-running: the game keeps state in RAM and
will overwrite a restored file on its next save.

## Features

### Statistics (Dashboard)
- House: gold, food, blank collars, current day, weather, storage upgrades,
  house boss countdown + next boss
- Adventure: on/off, adventure coins/food, party members (names)
- Progress: `save_file_percent`, total cat count (`COUNT(*)` on `cats`)

### Backups
- **Game backups:** list `backups/*.savbackup` sorted by timestamp
  (parsed from filename `<save>_<YYYY-MM-DD>_<HH-MM>.savbackup`).
- **Own backups:** stored in `manager_backups/`. Snapshot = copy live `.sav`
  to `<label>_<timestamp>.sav`, plus an entry in a single shared
  `manager_backups/manifest.json` containing label, ISO date, and parsed
  quick-stats (day, gold, cat count). If the manifest is missing or corrupt,
  it is rebuilt from the files present (labels recovered from filenames).
- **Restore:** from either source. Before any restore, an automatic safety
  snapshot of the current live save is written to `manager_backups/`.
- **Diff:** pick any two saves (live, game backup, or own backup); show
  property-level diff (day, gold, food, weather, …) plus cat-level diff
  (added / removed / renamed cats by ID + name).

### Error handling
- No File System Access API → upfront full-page notice (use Chrome/Edge).
- Parse failure → show raw error; never write in a degraded state.
- All writes full-file, atomic via `createWritable()` (write temp, then
  close commits).

## Testing

- **Vitest** for the savegame layer: parser modules tested against fixture
  files (small sanitized SQLite extracts checked into `tests/fixtures/`).
- UI tested manually (single-user tool, low UI complexity).

## Build & deploy

- Vite + TypeScript. `npm run build` → static `dist/`.
- GitHub Actions workflow: on push to `main`, build and deploy `dist/` to
  GitHub Pages.
- Vite `base` set to `/mewgenics-savegame-manager/` for Pages subpath.

## Out of scope (YAGNI)

- Editing savegames (stats, cats) — read-only inspection + whole-file restore
  only
- Firefox/Safari support
- Hosted multi-user service
- Automatic scheduled backups (game already does this)
