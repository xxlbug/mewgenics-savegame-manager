# Mewgenics Savegame Manager

Desktop savegame manager for [Mewgenics](https://store.steampowered.com/app/686060/Mewgenics/).
Reads your saves directly — statistics, backups, restore, diff — and works
while the game is running.

**Download:** grab the latest portable Windows exe from
[Releases](https://github.com/xxlbug/mewgenics-savegame-manager/releases).
No installation — download it and run it.

> Windows SmartScreen may warn because the binary is unsigned —
> "More info" → "Run anyway".

> Requires the Microsoft Edge WebView2 runtime — preinstalled on Windows
> 10/11; if missing, install it from Microsoft.

## Features

- **Zero setup** — finds your saves folder automatically
  (`%APPDATA%\Glaiel Games\Mewgenics\<steam-id>\saves`)
- **Cats** — all cats by name, filterable, with on-adventure badges
- **Backups** — with a current-save summary header (day, gold, food, cats,
  completion, weather, adventure status)
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
npm run tauri build  # portable Windows exe
```

Savegames are SQLite databases; format notes are in
`docs/superpowers/specs/`.

## Disclaimer

Fan tool, not affiliated with Glaiel Games. Back up your saves (this tool
helps with that). Cat blob parsing is reverse-engineered best effort.
