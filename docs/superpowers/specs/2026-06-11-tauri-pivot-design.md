# Tauri Pivot — Design Addendum

**Date:** 2026-06-11
**Status:** Approved (supersedes the "pure browser" deployment decision in the
original design; everything else in that spec still applies)

## Why

Chromium blocks the File System Access API for everything under
`%APPDATA%` (Roaming and Local) with `kBlockAllChildren`: directory picks,
single-file picks, and save dialogs all fail, and symlinks/junctions are
resolved and re-checked. There is no browser-side workaround. The Mewgenics
saves live under `%APPDATA%\Glaiel Games\Mewgenics\<steamid>\saves`, so the
GitHub-Pages browser app cannot reach them.

## Decision

Ship a **Tauri 2 desktop app** for Windows. Frontend (Vite + TS, all parser
and UI modules) is reused unchanged except for the filesystem layer. Users
download a single `.exe` from GitHub Releases.

## Architecture changes

### Filesystem layer: Rust commands instead of FileSystemDirectoryHandle

All file access goes through Tauri `invoke` commands implemented in Rust
(no `plugin-fs` scope configuration; full control, no blocklist):

| Command | Signature | Notes |
|---|---|---|
| `detect_saves_dirs` | `() -> Vec<String>` | scans `%APPDATA%/Glaiel Games/Mewgenics/*/saves`, returns absolute paths |
| `list_files` | `(dir: String) -> Vec<{name, modifiedMs}>` | files only |
| `read_file` | `(path: String) -> String` | base64-encoded bytes |
| `write_file` | `(path: String, dataB64: String)` | atomic: temp file + rename |
| `create_dir` | `(path: String)` | mkdir -p |
| `path_exists` | `(path: String) -> bool` | |

Base64 over IPC: saves are <1 MB, encoding cost negligible, avoids JSON
number-array bloat and binary-IPC complexity.

`src/fs/files.ts` keeps its function names but takes directory **path
strings** instead of handles; paths join with `/` (valid on Windows).
`src/fs/directory.ts` is replaced: auto-detect via `detect_saves_dirs`,
fallback to a folder dialog (`@tauri-apps/plugin-dialog`), chosen path
persisted in `localStorage`.

`AppState.savesDir` becomes `string`. View modules (dashboard, cats,
backups) are unchanged apart from the type.

### App flow

1. Start → `detect_saves_dirs`
2. Exactly one result → enter app directly (zero-config for the common case)
3. Multiple → simple chooser list
4. None → folder dialog fallback
5. Chosen dir persisted; "change folder" stays possible

### Build & distribution

- `src-tauri/` Rust project, Tauri 2, window 1000×800, app id
  `de.xxlbug.mewgenics-savegame-manager`
- GitHub Actions:
  - CI job on PRs: vitest + tsc + vite build (ubuntu, no Rust needed) plus
    `cargo check`/build on windows runner
  - Release job on `v*` tags: `tauri-action` builds the Windows installer
    (NSIS) + portable exe, attaches to a GitHub Release
- The GitHub Pages deploy workflow is **removed** (the Pages app cannot work
  for AppData saves). README points to Releases.
- Unsigned binary: README notes the SmartScreen warning.

## Out of scope

- macOS/Linux builds (Mewgenics saves path is Windows-specific here)
- Auto-update
- Keeping a read-only browser fallback
