# Mewgenics Savegame Manager

Browser-based savegame manager for [Mewgenics](https://store.steampowered.com/app/686060/Mewgenics/).
Runs entirely in your browser — no install, no server, your saves never leave
your machine.

**Use it:** https://xxlbug.github.io/mewgenics-savegame-manager/

## Features

- **Dashboard** — day, gold, food, weather, house boss, save completion,
  adventure status and party
- **Cats** — all cats by name, filterable, with on-adventure badges
- **Backups**
  - Browse the game's automatic backups (`backups/*.savbackup`)
  - Create your own labeled snapshots (stored in `saves/manager_backups/`)
  - Restore any backup (a safety snapshot is taken first)
  - Diff two saves: changed properties plus added/removed/renamed cats

## Requirements

- Chrome or Edge (uses the File System Access API)
- Point it at your saves folder:
  `%APPDATA%\Glaiel Games\Mewgenics\<steam-id>\saves`

### "Can't open this folder because it contains system files"

Chrome refuses to grant folder access anywhere inside `AppData`. Workaround:
create a directory junction outside AppData and select that instead. In
`cmd.exe` (no admin required):

```
mklink /J "%USERPROFILE%\MewgenicsSaves" "%APPDATA%\Glaiel Games\Mewgenics\<steam-id>\saves"
```

Then select `C:\Users\<you>\MewgenicsSaves` in the app. All reads and writes
pass through to the real saves folder.

Reading stats works fine while the game is running. Restoring while the game
runs is not reliable — the game will overwrite the file on its next save.

## Development

```bash
npm install
npm run dev    # local dev server
npm test       # unit tests (Vitest)
npm run build  # production build to dist/
```

Savegames are SQLite databases; parsing notes are in
`docs/superpowers/specs/`.

## Disclaimer

Fan tool, not affiliated with Glaiel Games. Back up your saves (this tool
helps with that). Cat blob parsing is reverse-engineered best effort.
