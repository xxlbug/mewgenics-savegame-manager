# Mewgenics Savegame Manager

Desktop savegame manager for [Mewgenics](https://store.steampowered.com/app/686060/Mewgenics/).
Reads your saves directly — statistics, backups, restore, diff — and works
while the game is running.

**Download:** grab the latest Windows installer from
[Releases](https://github.com/xxlbug/mewgenics-savegame-manager/releases).

> Windows SmartScreen may warn because the binary is unsigned —
> "More info" → "Run anyway".

## Features

- **Zero setup** — finds your saves folder automatically
  (`%APPDATA%\Glaiel Games\Mewgenics\<steam-id>\saves`)
- **Dashboard** — day, gold, food, weather, house boss, save completion,
  adventure status and party
- **Cats** — all cats by name, filterable, with on-adventure badges
- **Backups**
  - Browse the game's automatic backups (`backups/*.savbackup`)
  - Create your own labeled snapshots (stored in `saves/manager_backups/`)
  - Restore any backup (a safety snapshot is taken first, and the restored
    file is verified after writing)
  - Diff two saves: changed properties plus added/removed/renamed cats

Reading stats works fine while the game is running. Restoring while the game
runs is not reliable — the game will overwrite the file on its next save.

## Why a desktop app?

This started as a browser app on GitHub Pages, but Chromium blocks the File
System Access API for everything under `%APPDATA%` (`kBlockAllChildren` —
folder picks, file picks and save dialogs all refused, symlinks resolved and
re-checked). A desktop shell is the only reliable way to reach Mewgenics
saves. Tauri keeps it small: the web UI is unchanged, the Rust backend is
six small filesystem commands.

## Development

```bash
npm install
npm test             # unit tests (Vitest)
npm run dev          # frontend only, in a browser
npm run tauri dev    # full app (needs Rust toolchain)
npm run tauri build  # Windows installer
```

Savegames are SQLite databases; format notes are in
`docs/superpowers/specs/`.

## Disclaimer

Fan tool, not affiliated with Glaiel Games. Back up your saves (this tool
helps with that). Cat blob parsing is reverse-engineered best effort.
