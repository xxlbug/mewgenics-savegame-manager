# Mewgenics Savegame Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pure-browser app (GitHub Pages) that reads Mewgenics SQLite savegames via the File System Access API, shows statistics (house, cats, adventure party), and manages backups (snapshot with label, restore with safety snapshot, diff two saves).

**Architecture:** Three layers: filesystem (File System Access API + IndexedDB handle persistence), savegame (sql.js WASM, read-only parsers for `properties`, `cats` blobs, `adventure_state`), UI (vanilla TypeScript + DOM, three views). No server. Vite build deployed to GitHub Pages via Actions.

**Tech Stack:** Vite, TypeScript, sql.js (+@types/sql.js), idb-keyval, @types/wicg-file-system-access, Vitest. Chrome/Edge only.

**Spec:** `docs/superpowers/specs/2026-06-11-mewgenics-savegame-manager-design.md`

**Branch:** all work on `feature/initial-implementation`; finish with a PR to `main`. Never push to `main` directly.

---

## Reverse-engineered format facts (verified against real save)

- `.sav` and `.savbackup` files are SQLite 3 databases (identical format).
- Tables: `properties(key TEXT, data ANY)`, `cats(key INTEGER, data BLOB)`, `files(key TEXT, data BLOB)`, `furniture`, `winning_teams`.
- `files.adventure_state` blob: int32 LE count at offset 0, then `count` × int64 LE cat IDs from offset 4. IDs reference `cats.key`.
- `cats.data` blob: cat name is UTF-16LE starting at byte offset 22; terminate when a code unit is not printable ASCII (high byte ≠ 0 or low byte outside 0x20–0x7E). Verified on 5 cats ("Ren", "Blaze", "Belipe", "Micion", "Poc"). Rest of blob is unmapped — parser must not crash on any input.
- Game backup filenames: `<saveName>_<YYYY-MM-DD>_<HH-MM>.savbackup` in `saves/backups/`.
- Live saves: `saves/*.sav` (there can be several, e.g. `steamcampaign01.sav`, `test00.sav`).
- Noisy `properties` keys to exclude from diffs: `random_seed` (BLOB), `savefile_timer`, `savefile_timer_adjusted`.

## File structure

```
package.json, tsconfig.json, vite.config.ts, index.html, .gitignore
src/
  main.ts               — bootstrap: browser check, sql.js init, folder picker, tab routing
  styles.css            — single stylesheet
  save/
    db.ts               — sql.js init + open bytes as Database
    properties.ts       — typed accessors for properties table
    cats.ts             — cat blob name parser + cat list
    adventure.ts        — adventure_state party parser
    summary.ts          — quick stats (day/gold/food/catCount/onAdventure/percent)
    diff.ts             — diff two saves (properties + cats)
  backups/
    gameBackups.ts      — parse .savbackup filenames
    ownBackups.ts       — manifest.json model: parse/rebuild/entry/filename helpers
  fs/
    directory.ts        — pick + persist directory handle (idb-keyval), permission re-grant
    files.ts            — read/write/list helpers over FileSystemDirectoryHandle
  ui/
    state.ts            — shared app state (dir handle, selected save)
    dashboard.ts        — Dashboard view
    catsView.ts         — Cats view
    backupsView.ts      — Backups view (lists, snapshot, restore, diff)
tests/
  helpers/buildFixture.ts — builds an in-memory save-like SQLite DB
  *.test.ts               — one per parser module
.github/workflows/deploy.yml
```

Pure logic (save/, backups/) is fully unit-tested. fs/ and ui/ are browser-only and thin; tested manually (per spec).

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/styles.css`, `.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "mewgenics-savegame-manager",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install sql.js idb-keyval
npm install -D vite typescript vitest @types/sql.js @types/wicg-file-system-access
```
Expected: `package.json` gains deps; `node_modules/` and `package-lock.json` appear.

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "wicg-file-system-access"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 4: Create vite.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/mewgenics-savegame-manager/',
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
```

- [ ] **Step 6: Create index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mewgenics Savegame Manager</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 7: Create placeholder src/main.ts and empty src/styles.css**

```ts
import './styles.css';

document.querySelector<HTMLDivElement>('#app')!.textContent =
  'Mewgenics Savegame Manager';
```

`src/styles.css`: create empty file.

- [ ] **Step 8: Verify build works**

Run: `npm run build`
Expected: `dist/` created, no TypeScript errors.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html src .gitignore
git commit -m "chore: scaffold Vite + TypeScript project"
```

---

### Task 2: Save DB module + test fixture helper

**Files:**
- Create: `src/save/db.ts`
- Create: `tests/helpers/buildFixture.ts`
- Test: `tests/db.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/db.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { initSql, openSave } from '../src/save/db';
import { buildFixtureBytes } from './helpers/buildFixture';

describe('openSave', () => {
  it('opens save bytes as a queryable SQLite database', async () => {
    await initSql();
    const bytes = await buildFixtureBytes({
      properties: { house_gold: 590, current_day: 187 },
    });
    const db = openSave(bytes);
    const res = db.exec(
      "SELECT data FROM properties WHERE key = 'house_gold'",
    );
    expect(res[0]!.values[0]![0]).toBe(590);
    db.close();
  });

  it('throws a clear error on non-SQLite bytes', async () => {
    await initSql();
    expect(() => openSave(new Uint8Array([1, 2, 3, 4]))).toThrow();
  });
});
```

`tests/helpers/buildFixture.ts`:
```ts
import initSqlJs from 'sql.js';

export interface FixtureSpec {
  properties?: Record<string, string | number>;
  /** id -> cat name (encoded UTF-16LE at offset 22, like the real format) */
  cats?: Record<number, string>;
  /** cat ids on adventure (encoded into files.adventure_state) */
  adventureParty?: number[];
}

/** Encode a cat blob: 22 header bytes, UTF-16LE name, non-ASCII terminator. */
export function buildCatBlob(name: string): Uint8Array {
  const nameBytes = new Uint8Array(name.length * 2);
  for (let i = 0; i < name.length; i++) {
    nameBytes[i * 2] = name.charCodeAt(i) & 0xff;
    nameBytes[i * 2 + 1] = 0;
  }
  const blob = new Uint8Array(22 + nameBytes.length + 2);
  blob.set(nameBytes, 22);
  blob[22 + nameBytes.length] = 0x65; // junk byte pair, hi != 0 terminates name
  blob[22 + nameBytes.length + 1] = 0x0d;
  return blob;
}

/** Encode adventure_state: int32 LE count + count * int64 LE cat ids. */
export function buildAdventureBlob(ids: number[]): Uint8Array {
  const buf = new ArrayBuffer(4 + ids.length * 8);
  const view = new DataView(buf);
  view.setInt32(0, ids.length, true);
  ids.forEach((id, i) => view.setBigInt64(4 + i * 8, BigInt(id), true));
  return new Uint8Array(buf);
}

export async function buildFixtureBytes(spec: FixtureSpec): Promise<Uint8Array> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('CREATE TABLE properties (key TEXT PRIMARY KEY, data ANY)');
  db.run('CREATE TABLE cats (key INTEGER PRIMARY KEY, data BLOB)');
  db.run('CREATE TABLE files (key TEXT PRIMARY KEY, data BLOB)');
  for (const [k, v] of Object.entries(spec.properties ?? {})) {
    db.run('INSERT INTO properties VALUES (?, ?)', [k, v]);
  }
  for (const [id, name] of Object.entries(spec.cats ?? {})) {
    db.run('INSERT INTO cats VALUES (?, ?)', [Number(id), buildCatBlob(name)]);
  }
  if (spec.adventureParty) {
    db.run('INSERT INTO files VALUES (?, ?)', [
      'adventure_state',
      buildAdventureBlob(spec.adventureParty),
    ]);
  }
  const bytes = db.export();
  db.close();
  return bytes;
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db.test.ts`
Expected: FAIL — `Cannot find module '../src/save/db'`

- [ ] **Step 3: Write src/save/db.ts**

```ts
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';

let sql: SqlJsStatic | null = null;

/**
 * Initialize sql.js once. In the browser pass a locateFile that returns the
 * bundled wasm URL; in Node (tests) omit it and sql.js finds the wasm itself.
 */
export async function initSql(
  locateFile?: (file: string) => string,
): Promise<void> {
  if (sql) return;
  sql = await initSqlJs(locateFile ? { locateFile } : undefined);
}

/** Open savegame bytes as an in-memory, read-only-by-convention database. */
export function openSave(bytes: Uint8Array): Database {
  if (!sql) throw new Error('initSql() must be called first');
  const db = new sql.Database(bytes);
  // Force parse now so corrupt files fail here, not on first query.
  db.exec("SELECT name FROM sqlite_master WHERE type='table' LIMIT 1");
  return db;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/db.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/save/db.ts tests/helpers/buildFixture.ts tests/db.test.ts
git commit -m "feat: open savegame bytes via sql.js with test fixture builder"
```

---

### Task 3: Properties parser

**Files:**
- Create: `src/save/properties.ts`
- Test: `tests/properties.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/properties.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { initSql, openSave } from '../src/save/db';
import { readProperties } from '../src/save/properties';
import { buildFixtureBytes } from './helpers/buildFixture';

beforeAll(() => initSql());

describe('readProperties', () => {
  it('reads known keys with correct types', async () => {
    const db = openSave(
      await buildFixtureBytes({
        properties: {
          house_gold: 590,
          house_food: 289,
          blank_collars: 3,
          current_day: 187,
          current_house_weather: 'Snow',
          on_adventure: 1,
          adventure_coins: 99,
          adventure_food: 118,
          save_file_percent: 70,
          house_boss_countdown: 4,
          next_house_boss: 'terminator_2',
          house_storage_upgrades: 4,
          version_string: '1.1',
        },
      }),
    );
    const p = readProperties(db);
    expect(p.gold).toBe(590);
    expect(p.food).toBe(289);
    expect(p.blankCollars).toBe(3);
    expect(p.currentDay).toBe(187);
    expect(p.weather).toBe('Snow');
    expect(p.onAdventure).toBe(true);
    expect(p.adventureCoins).toBe(99);
    expect(p.adventureFood).toBe(118);
    expect(p.savePercent).toBe(70);
    expect(p.houseBossCountdown).toBe(4);
    expect(p.nextHouseBoss).toBe('terminator_2');
    expect(p.storageUpgrades).toBe(4);
    expect(p.versionString).toBe('1.1');
  });

  it('falls back to defaults for missing keys', async () => {
    const db = openSave(await buildFixtureBytes({ properties: {} }));
    const p = readProperties(db);
    expect(p.gold).toBe(0);
    expect(p.weather).toBe('');
    expect(p.onAdventure).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/properties.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write src/save/properties.ts**

```ts
import type { Database } from 'sql.js';

export interface SaveProperties {
  gold: number;
  food: number;
  blankCollars: number;
  currentDay: number;
  weather: string;
  onAdventure: boolean;
  adventureCoins: number;
  adventureFood: number;
  savePercent: number;
  houseBossCountdown: number;
  nextHouseBoss: string;
  storageUpgrades: number;
  versionString: string;
}

function readAll(db: Database): Map<string, unknown> {
  const map = new Map<string, unknown>();
  const res = db.exec('SELECT key, data FROM properties');
  for (const row of res[0]?.values ?? []) {
    map.set(String(row[0]), row[1]);
  }
  return map;
}

const num = (m: Map<string, unknown>, k: string): number => {
  const v = m.get(k);
  return typeof v === 'number' ? v : Number(v ?? 0) || 0;
};
const str = (m: Map<string, unknown>, k: string): string => {
  const v = m.get(k);
  return v == null ? '' : String(v);
};

export function readProperties(db: Database): SaveProperties {
  const m = readAll(db);
  return {
    gold: num(m, 'house_gold'),
    food: num(m, 'house_food'),
    blankCollars: num(m, 'blank_collars'),
    currentDay: num(m, 'current_day'),
    weather: str(m, 'current_house_weather'),
    onAdventure: num(m, 'on_adventure') === 1,
    adventureCoins: num(m, 'adventure_coins'),
    adventureFood: num(m, 'adventure_food'),
    savePercent: num(m, 'save_file_percent'),
    houseBossCountdown: num(m, 'house_boss_countdown'),
    nextHouseBoss: str(m, 'next_house_boss'),
    storageUpgrades: num(m, 'house_storage_upgrades'),
    versionString: str(m, 'version_string'),
  };
}

/** All properties as displayable strings, for diffing. Excludes noisy keys. */
export function readRawProperties(db: Database): Map<string, string> {
  const EXCLUDE = new Set([
    'random_seed',
    'savefile_timer',
    'savefile_timer_adjusted',
  ]);
  const out = new Map<string, string>();
  for (const [k, v] of readAll(db)) {
    if (EXCLUDE.has(k)) continue;
    if (v instanceof Uint8Array) continue; // skip any other blobs
    out.set(k, String(v));
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/properties.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/save/properties.ts tests/properties.test.ts
git commit -m "feat: parse properties table into typed save stats"
```

---

### Task 4: Cats parser

**Files:**
- Create: `src/save/cats.ts`
- Test: `tests/cats.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/cats.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { initSql, openSave } from '../src/save/db';
import { parseCatName, readCats } from '../src/save/cats';
import { buildCatBlob, buildFixtureBytes } from './helpers/buildFixture';

beforeAll(() => initSql());

describe('parseCatName', () => {
  it('extracts a UTF-16LE name at offset 22', () => {
    expect(parseCatName(buildCatBlob('Blaze'))).toBe('Blaze');
  });

  it('returns empty string for blobs too short to hold a name', () => {
    expect(parseCatName(new Uint8Array(10))).toBe('');
  });

  it('stops at the first non-printable code unit', () => {
    const blob = buildCatBlob('Ren'); // followed by 0x65 0x0d junk
    expect(parseCatName(blob)).toBe('Ren');
  });
});

describe('readCats', () => {
  it('lists all cats with id and name, falling back for unparseable names', async () => {
    const db = openSave(
      await buildFixtureBytes({ cats: { 4: 'Ren', 683: 'Blaze' } }),
    );
    // add one cat with garbage blob
    db.run('INSERT INTO cats VALUES (999, ?)', [new Uint8Array(5)]);
    const cats = readCats(db);
    expect(cats).toEqual([
      { id: 4, name: 'Ren' },
      { id: 683, name: 'Blaze' },
      { id: 999, name: 'Cat #999' },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cats.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write src/save/cats.ts**

```ts
import type { Database } from 'sql.js';

export interface CatInfo {
  id: number;
  name: string;
}

const NAME_OFFSET = 22;

/**
 * Best-effort name extraction from the undocumented cat blob.
 * Format (reverse-engineered): UTF-16LE printable-ASCII name at offset 22,
 * terminated by the first code unit that is not printable ASCII.
 * Never throws.
 */
export function parseCatName(blob: Uint8Array): string {
  const chars: string[] = [];
  for (let i = NAME_OFFSET; i + 1 < blob.length; i += 2) {
    const lo = blob[i]!;
    const hi = blob[i + 1]!;
    if (hi !== 0 || lo < 0x20 || lo > 0x7e) break;
    chars.push(String.fromCharCode(lo));
  }
  return chars.join('');
}

export function readCats(db: Database): CatInfo[] {
  const res = db.exec('SELECT key, data FROM cats ORDER BY key');
  const cats: CatInfo[] = [];
  for (const row of res[0]?.values ?? []) {
    const id = Number(row[0]);
    const blob = row[1] instanceof Uint8Array ? row[1] : new Uint8Array(0);
    const name = parseCatName(blob);
    cats.push({ id, name: name || `Cat #${id}` });
  }
  return cats;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cats.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/save/cats.ts tests/cats.test.ts
git commit -m "feat: extract cat names from binary cat blobs"
```

---

### Task 5: Adventure party parser

**Files:**
- Create: `src/save/adventure.ts`
- Test: `tests/adventure.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/adventure.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { initSql, openSave } from '../src/save/db';
import { readAdventureParty } from '../src/save/adventure';
import { buildFixtureBytes } from './helpers/buildFixture';

beforeAll(() => initSql());

describe('readAdventureParty', () => {
  it('reads cat ids from adventure_state blob', async () => {
    const db = openSave(
      await buildFixtureBytes({ adventureParty: [4, 741, 683, 749, 747] }),
    );
    expect(readAdventureParty(db)).toEqual([4, 741, 683, 749, 747]);
  });

  it('returns empty array when adventure_state is missing', async () => {
    const db = openSave(await buildFixtureBytes({}));
    expect(readAdventureParty(db)).toEqual([]);
  });

  it('returns empty array for truncated blobs instead of throwing', async () => {
    const db = openSave(await buildFixtureBytes({}));
    db.run('INSERT INTO files VALUES (?, ?)', [
      'adventure_state',
      new Uint8Array([5, 0, 0, 0, 1, 2]), // claims 5 ids, has none
    ]);
    expect(readAdventureParty(db)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/adventure.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write src/save/adventure.ts**

```ts
import type { Database } from 'sql.js';

/**
 * adventure_state blob: int32 LE party size at offset 0, then
 * size * int64 LE cat ids starting at offset 4.
 * Returns [] for missing or malformed blobs — never throws.
 */
export function readAdventureParty(db: Database): number[] {
  const res = db.exec(
    "SELECT data FROM files WHERE key = 'adventure_state'",
  );
  const blob = res[0]?.values[0]?.[0];
  if (!(blob instanceof Uint8Array) || blob.length < 4) return [];
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const count = view.getInt32(0, true);
  if (count < 0 || blob.length < 4 + count * 8) return [];
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    ids.push(Number(view.getBigInt64(4 + i * 8, true)));
  }
  return ids;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/adventure.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/save/adventure.ts tests/adventure.test.ts
git commit -m "feat: parse adventure party cat ids from adventure_state"
```

---

### Task 6: Save summary

**Files:**
- Create: `src/save/summary.ts`
- Test: `tests/summary.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/summary.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { initSql, openSave } from '../src/save/db';
import { summarize } from '../src/save/summary';
import { buildFixtureBytes } from './helpers/buildFixture';

beforeAll(() => initSql());

describe('summarize', () => {
  it('produces quick stats from a save', async () => {
    const db = openSave(
      await buildFixtureBytes({
        properties: {
          house_gold: 590,
          house_food: 289,
          current_day: 187,
          on_adventure: 1,
          save_file_percent: 70,
        },
        cats: { 1: 'A', 2: 'B', 3: 'C' },
      }),
    );
    expect(summarize(db)).toEqual({
      day: 187,
      gold: 590,
      food: 289,
      catCount: 3,
      onAdventure: true,
      savePercent: 70,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/summary.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write src/save/summary.ts**

```ts
import type { Database } from 'sql.js';
import { readProperties } from './properties';

export interface SaveSummary {
  day: number;
  gold: number;
  food: number;
  catCount: number;
  onAdventure: boolean;
  savePercent: number;
}

export function summarize(db: Database): SaveSummary {
  const p = readProperties(db);
  const res = db.exec('SELECT COUNT(*) FROM cats');
  const catCount = Number(res[0]?.values[0]?.[0] ?? 0);
  return {
    day: p.currentDay,
    gold: p.gold,
    food: p.food,
    catCount,
    onAdventure: p.onAdventure,
    savePercent: p.savePercent,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/summary.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/save/summary.ts tests/summary.test.ts
git commit -m "feat: quick-stats summary for manifest and diff previews"
```

---

### Task 7: Save diff

**Files:**
- Create: `src/save/diff.ts`
- Test: `tests/diff.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/diff.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { initSql, openSave } from '../src/save/db';
import { diffSaves } from '../src/save/diff';
import { buildFixtureBytes } from './helpers/buildFixture';

beforeAll(() => initSql());

describe('diffSaves', () => {
  it('reports changed properties and added/removed/renamed cats', async () => {
    const a = openSave(
      await buildFixtureBytes({
        properties: { house_gold: 100, current_day: 5, version_string: '1.1' },
        cats: { 1: 'Ren', 2: 'Blaze' },
      }),
    );
    const b = openSave(
      await buildFixtureBytes({
        properties: { house_gold: 250, current_day: 5, version_string: '1.1' },
        cats: { 2: 'Blazey', 3: 'Poc' },
      }),
    );
    const diff = diffSaves(a, b);
    expect(diff.properties).toEqual([
      { key: 'house_gold', before: '100', after: '250' },
    ]);
    expect(diff.cats).toEqual([
      { id: 1, kind: 'removed', name: 'Ren' },
      { id: 2, kind: 'renamed', name: 'Blazey', previousName: 'Blaze' },
      { id: 3, kind: 'added', name: 'Poc' },
    ]);
  });

  it('ignores noisy keys like savefile_timer', async () => {
    const a = openSave(
      await buildFixtureBytes({ properties: { savefile_timer: 1 } }),
    );
    const b = openSave(
      await buildFixtureBytes({ properties: { savefile_timer: 2 } }),
    );
    expect(diffSaves(a, b).properties).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/diff.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write src/save/diff.ts**

```ts
import type { Database } from 'sql.js';
import { readRawProperties } from './properties';
import { readCats } from './cats';

export interface PropertyChange {
  key: string;
  before: string | null; // null = key absent
  after: string | null;
}

export interface CatChange {
  id: number;
  kind: 'added' | 'removed' | 'renamed';
  name: string;
  previousName?: string;
}

export interface SaveDiff {
  properties: PropertyChange[];
  cats: CatChange[];
}

export function diffSaves(a: Database, b: Database): SaveDiff {
  const pa = readRawProperties(a);
  const pb = readRawProperties(b);
  const properties: PropertyChange[] = [];
  const allKeys = [...new Set([...pa.keys(), ...pb.keys()])].sort();
  for (const key of allKeys) {
    const before = pa.has(key) ? pa.get(key)! : null;
    const after = pb.has(key) ? pb.get(key)! : null;
    if (before !== after) properties.push({ key, before, after });
  }

  const ca = new Map(readCats(a).map((c) => [c.id, c.name]));
  const cb = new Map(readCats(b).map((c) => [c.id, c.name]));
  const cats: CatChange[] = [];
  const allIds = [...new Set([...ca.keys(), ...cb.keys()])].sort((x, y) => x - y);
  for (const id of allIds) {
    const before = ca.get(id);
    const after = cb.get(id);
    if (before === undefined && after !== undefined) {
      cats.push({ id, kind: 'added', name: after });
    } else if (before !== undefined && after === undefined) {
      cats.push({ id, kind: 'removed', name: before });
    } else if (before !== after) {
      cats.push({ id, kind: 'renamed', name: after!, previousName: before });
    }
  }
  return { properties, cats };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/diff.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/save/diff.ts tests/diff.test.ts
git commit -m "feat: property- and cat-level diff between two saves"
```

---

### Task 8: Game backup filename parser

**Files:**
- Create: `src/backups/gameBackups.ts`
- Test: `tests/gameBackups.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/gameBackups.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseBackupFileName } from '../src/backups/gameBackups';

describe('parseBackupFileName', () => {
  it('parses save name and local timestamp', () => {
    const b = parseBackupFileName('steamcampaign01_2026-06-11_16-05.savbackup');
    expect(b).not.toBeNull();
    expect(b!.saveName).toBe('steamcampaign01');
    expect(b!.timestamp).toEqual(new Date(2026, 5, 11, 16, 5));
  });

  it('returns null for non-backup files', () => {
    expect(parseBackupFileName('steam_autocloud.vdf')).toBeNull();
    expect(parseBackupFileName('whatever.savbackup')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/gameBackups.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write src/backups/gameBackups.ts**

```ts
export interface GameBackup {
  fileName: string;
  saveName: string;
  timestamp: Date;
}

const PATTERN = /^(.+)_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})\.savbackup$/;

/** Parse `<save>_<YYYY-MM-DD>_<HH-MM>.savbackup`; null if not a backup. */
export function parseBackupFileName(fileName: string): GameBackup | null {
  const m = PATTERN.exec(fileName);
  if (!m) return null;
  const [, saveName, y, mo, d, h, mi] = m;
  return {
    fileName,
    saveName: saveName!,
    timestamp: new Date(+y!, +mo! - 1, +d!, +h!, +mi!),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/gameBackups.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/backups/gameBackups.ts tests/gameBackups.test.ts
git commit -m "feat: parse game backup filenames with timestamps"
```

---

### Task 9: Own-backup manifest model

**Files:**
- Create: `src/backups/ownBackups.ts`
- Test: `tests/ownBackups.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/ownBackups.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  makeBackupFileName,
  parseManifest,
  parseOwnBackupFileName,
  rebuildManifest,
} from '../src/backups/ownBackups';

describe('makeBackupFileName', () => {
  it('sanitizes the label and appends a timestamp', () => {
    const d = new Date(2026, 5, 11, 16, 5, 30);
    expect(makeBackupFileName('before risky run!', d)).toBe(
      'before-risky-run_2026-06-11_16-05-30.sav',
    );
  });
});

describe('parseOwnBackupFileName', () => {
  it('recovers label and timestamp', () => {
    const r = parseOwnBackupFileName('before-risky-run_2026-06-11_16-05-30.sav');
    expect(r).toEqual({
      fileName: 'before-risky-run_2026-06-11_16-05-30.sav',
      label: 'before-risky-run',
      createdAt: new Date(2026, 5, 11, 16, 5, 30).toISOString(),
    });
  });

  it('returns null for foreign files', () => {
    expect(parseOwnBackupFileName('manifest.json')).toBeNull();
  });
});

describe('parseManifest', () => {
  it('parses valid manifest JSON', () => {
    const m = parseManifest(
      '{"backups":[{"fileName":"a_2026-01-01_00-00-00.sav","label":"a","createdAt":"2026-01-01T00:00:00.000Z"}]}',
    );
    expect(m.backups).toHaveLength(1);
    expect(m.backups[0]!.label).toBe('a');
  });

  it('returns empty manifest for corrupt JSON', () => {
    expect(parseManifest('{oops')).toEqual({ backups: [] });
    expect(parseManifest('null')).toEqual({ backups: [] });
  });
});

describe('rebuildManifest', () => {
  it('reconstructs entries from filenames, ignoring foreign files', () => {
    const m = rebuildManifest([
      'before-risky-run_2026-06-11_16-05-30.sav',
      'manifest.json',
      'random.txt',
    ]);
    expect(m.backups).toHaveLength(1);
    expect(m.backups[0]!.label).toBe('before-risky-run');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ownBackups.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write src/backups/ownBackups.ts**

```ts
import type { SaveSummary } from '../save/summary';

export interface OwnBackupEntry {
  fileName: string;
  label: string;
  createdAt: string; // ISO date
  stats?: SaveSummary;
}

export interface Manifest {
  backups: OwnBackupEntry[];
}

export const MANIFEST_NAME = 'manifest.json';
export const BACKUP_DIR_NAME = 'manager_backups';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function timestampPart(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  );
}

export function makeBackupFileName(label: string, date: Date): string {
  const safe =
    label
      .trim()
      .replace(/[^a-zA-Z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'backup';
  return `${safe}_${timestampPart(date)}.sav`;
}

const FILE_PATTERN =
  /^(.+)_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.sav$/;

export function parseOwnBackupFileName(
  fileName: string,
): Omit<OwnBackupEntry, 'stats'> | null {
  const m = FILE_PATTERN.exec(fileName);
  if (!m) return null;
  const [, label, y, mo, d, h, mi, s] = m;
  return {
    fileName,
    label: label!,
    createdAt: new Date(+y!, +mo! - 1, +d!, +h!, +mi!, +s!).toISOString(),
  };
}

/** Tolerant parse: corrupt or shapeless JSON yields an empty manifest. */
export function parseManifest(json: string): Manifest {
  try {
    const data: unknown = JSON.parse(json);
    if (
      typeof data === 'object' &&
      data !== null &&
      Array.isArray((data as Manifest).backups)
    ) {
      return { backups: (data as Manifest).backups };
    }
  } catch {
    // fall through
  }
  return { backups: [] };
}

/** Rebuild manifest from directory listing when manifest.json is lost. */
export function rebuildManifest(fileNames: string[]): Manifest {
  const backups: OwnBackupEntry[] = [];
  for (const name of fileNames) {
    const entry = parseOwnBackupFileName(name);
    if (entry) backups.push(entry);
  }
  backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { backups };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ownBackups.test.ts`
Expected: PASS

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: all test files PASS

- [ ] **Step 6: Commit**

```bash
git add src/backups/ownBackups.ts tests/ownBackups.test.ts
git commit -m "feat: own-backup manifest model with rebuild-from-filenames"
```

---

### Task 10: Filesystem layer (browser-only, no unit tests)

**Files:**
- Create: `src/fs/directory.ts`
- Create: `src/fs/files.ts`

These wrap the File System Access API, which has no Node equivalent — they stay thin and are exercised manually in Task 14.

- [ ] **Step 1: Write src/fs/directory.ts**

```ts
import { get, set } from 'idb-keyval';

const HANDLE_KEY = 'savesDirHandle';

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/** Ask the user to pick the Mewgenics `saves` folder; persist the handle. */
export async function pickSavesDirectory(): Promise<FileSystemDirectoryHandle> {
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
  await set(HANDLE_KEY, handle);
  return handle;
}

/**
 * Restore the persisted handle. Returns null if none stored or permission
 * was not re-granted (queryPermission/requestPermission flow).
 */
export async function restoreSavesDirectory(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await get<FileSystemDirectoryHandle>(HANDLE_KEY);
  if (!handle) return null;
  const opts = { mode: 'readwrite' } as const;
  if ((await handle.queryPermission(opts)) === 'granted') return handle;
  if ((await handle.requestPermission(opts)) === 'granted') return handle;
  return null;
}
```

- [ ] **Step 2: Write src/fs/files.ts**

```ts
export async function readFileBytes(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<Uint8Array> {
  const fh = await dir.getFileHandle(name);
  const file = await fh.getFile();
  return new Uint8Array(await file.arrayBuffer());
}

/** Full-file atomic write: changes only become visible on close(). */
export async function writeFileBytes(
  dir: FileSystemDirectoryHandle,
  name: string,
  bytes: Uint8Array,
): Promise<void> {
  const fh = await dir.getFileHandle(name, { create: true });
  const writable = await fh.createWritable();
  await writable.write(bytes);
  await writable.close();
}

export async function writeFileText(
  dir: FileSystemDirectoryHandle,
  name: string,
  text: string,
): Promise<void> {
  await writeFileBytes(dir, name, new TextEncoder().encode(text));
}

export async function readFileText(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<string> {
  return new TextDecoder().decode(await readFileBytes(dir, name));
}

export async function listFileNames(
  dir: FileSystemDirectoryHandle,
): Promise<string[]> {
  const names: string[] = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'file') names.push(name);
  }
  return names;
}

export async function getOrCreateDir(
  parent: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemDirectoryHandle> {
  return parent.getDirectoryHandle(name, { create: true });
}

export async function getDirIfExists(
  parent: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await parent.getDirectoryHandle(name);
  } catch {
    return null;
  }
}

export async function fileLastModified(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<number> {
  const fh = await dir.getFileHandle(name);
  return (await fh.getFile()).lastModified;
}
```

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/fs
git commit -m "feat: File System Access wrappers with persisted dir handle"
```

---

### Task 11: App shell, state, and folder picker

**Files:**
- Create: `src/ui/state.ts`
- Modify: `src/main.ts` (replace placeholder entirely)
- Modify: `src/styles.css` (replace empty file)

- [ ] **Step 1: Write src/ui/state.ts**

```ts
export interface AppState {
  savesDir: FileSystemDirectoryHandle;
  /** Names of *.sav files in the saves folder root. */
  saveFiles: string[];
  /** Currently selected live save filename. */
  selectedSave: string;
}

let state: AppState | null = null;

export function setState(s: AppState): void {
  state = s;
}

export function getState(): AppState {
  if (!state) throw new Error('App state not initialized');
  return state;
}
```

- [ ] **Step 2: Replace src/main.ts**

```ts
import './styles.css';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { initSql } from './save/db';
import {
  isFileSystemAccessSupported,
  pickSavesDirectory,
  restoreSavesDirectory,
} from './fs/directory';
import { fileLastModified, listFileNames } from './fs/files';
import { getState, setState } from './ui/state';
import { renderDashboard } from './ui/dashboard';
import { renderCatsView } from './ui/catsView';
import { renderBackupsView } from './ui/backupsView';

const app = document.querySelector<HTMLDivElement>('#app')!;

type Tab = 'dashboard' | 'cats' | 'backups';
let currentTab: Tab = 'dashboard';

async function main(): Promise<void> {
  if (!isFileSystemAccessSupported()) {
    app.innerHTML = `<div class="notice error">
      <h1>Browser not supported</h1>
      <p>This tool needs the File System Access API.
      Please use Chrome or Edge.</p></div>`;
    return;
  }
  await initSql(() => wasmUrl);
  const restored = await restoreSavesDirectory();
  if (restored) {
    await enterApp(restored);
  } else {
    renderPicker();
  }
}

function renderPicker(): void {
  app.innerHTML = `<div class="notice">
    <h1>Mewgenics Savegame Manager</h1>
    <p>Select your Mewgenics <code>saves</code> folder. On Windows it is:</p>
    <p><code>%APPDATA%\\Glaiel Games\\Mewgenics\\&lt;steam-id&gt;\\saves</code></p>
    <button id="pick">Select saves folder</button>
    <p id="pick-error" class="error"></p></div>`;
  document.getElementById('pick')!.addEventListener('click', async () => {
    try {
      const dir = await pickSavesDirectory();
      await enterApp(dir);
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') {
        document.getElementById('pick-error')!.textContent = String(e);
      }
    }
  });
}

async function enterApp(dir: FileSystemDirectoryHandle): Promise<void> {
  const names = (await listFileNames(dir)).filter((n) => n.endsWith('.sav'));
  if (names.length === 0) {
    app.innerHTML = `<div class="notice error">
      <p>No .sav files found in the selected folder.</p>
      <button id="repick">Pick another folder</button></div>`;
    document
      .getElementById('repick')!
      .addEventListener('click', () => renderPicker());
    return;
  }
  // Default to the most recently modified save.
  const withTimes = await Promise.all(
    names.map(async (n) => [n, await fileLastModified(dir, n)] as const),
  );
  withTimes.sort((a, b) => b[1] - a[1]);
  setState({
    savesDir: dir,
    saveFiles: names.sort(),
    selectedSave: withTimes[0]![0],
  });
  renderShell();
}

function renderShell(): void {
  const { saveFiles, selectedSave } = getState();
  app.innerHTML = `
    <header>
      <h1>Mewgenics Savegame Manager</h1>
      <label>Save file:
        <select id="save-select">
          ${saveFiles
            .map(
              (n) =>
                `<option value="${n}" ${n === selectedSave ? 'selected' : ''}>${n}</option>`,
            )
            .join('')}
        </select>
      </label>
      <nav>
        <button data-tab="dashboard">Dashboard</button>
        <button data-tab="cats">Cats</button>
        <button data-tab="backups">Backups</button>
      </nav>
    </header>
    <main id="view"></main>`;
  document
    .getElementById('save-select')!
    .addEventListener('change', (e) => {
      getState().selectedSave = (e.target as HTMLSelectElement).value;
      void renderTab(currentTab);
    });
  for (const btn of app.querySelectorAll<HTMLButtonElement>('nav button')) {
    btn.addEventListener('click', () => {
      void renderTab(btn.dataset.tab as Tab);
    });
  }
  void renderTab(currentTab);
}

async function renderTab(tab: Tab): Promise<void> {
  currentTab = tab;
  for (const btn of app.querySelectorAll<HTMLButtonElement>('nav button')) {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  }
  const view = document.getElementById('view')!;
  view.innerHTML = '<p>Loading…</p>';
  try {
    if (tab === 'dashboard') await renderDashboard(view);
    else if (tab === 'cats') await renderCatsView(view);
    else await renderBackupsView(view, () => renderTab('backups'));
  } catch (e) {
    view.innerHTML = `<p class="error">Failed to read save: ${String(e)}</p>`;
  }
}

void main();
```

- [ ] **Step 3: Replace src/styles.css**

```css
:root {
  font-family: system-ui, sans-serif;
  color-scheme: dark;
}
body {
  margin: 0;
  background: #1a1a1f;
  color: #e8e8ee;
}
#app {
  max-width: 960px;
  margin: 0 auto;
  padding: 1rem;
}
header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem;
  border-bottom: 1px solid #333;
  padding-bottom: 0.75rem;
  margin-bottom: 1rem;
}
header h1 {
  font-size: 1.2rem;
  margin: 0;
  flex: 1 1 auto;
}
nav button {
  margin-left: 0.25rem;
}
nav button.active {
  background: #4a6;
  color: #fff;
}
button {
  background: #2d2d36;
  color: inherit;
  border: 1px solid #555;
  border-radius: 6px;
  padding: 0.4rem 0.8rem;
  cursor: pointer;
}
button:hover {
  border-color: #888;
}
button.danger {
  border-color: #a44;
}
.notice {
  text-align: center;
  margin-top: 4rem;
}
.error {
  color: #f88;
}
table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.5rem 0 1.5rem;
}
th,
td {
  text-align: left;
  padding: 0.35rem 0.6rem;
  border-bottom: 1px solid #333;
}
.badge {
  background: #265;
  border-radius: 4px;
  padding: 0.1rem 0.4rem;
  font-size: 0.8rem;
}
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}
.stat {
  background: #232329;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 0.7rem;
}
.stat .label {
  font-size: 0.75rem;
  color: #aab;
  text-transform: uppercase;
}
.stat .value {
  font-size: 1.3rem;
}
.row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
}
```

- [ ] **Step 4: Create stub views so the shell compiles**

`src/ui/dashboard.ts`:
```ts
export async function renderDashboard(view: HTMLElement): Promise<void> {
  view.innerHTML = '<p>Dashboard (Task 12)</p>';
}
```

`src/ui/catsView.ts`:
```ts
export async function renderCatsView(view: HTMLElement): Promise<void> {
  view.innerHTML = '<p>Cats (Task 13)</p>';
}
```

`src/ui/backupsView.ts`:
```ts
export async function renderBackupsView(
  view: HTMLElement,
  _refresh: () => void,
): Promise<void> {
  view.innerHTML = '<p>Backups (Task 14)</p>';
}
```

- [ ] **Step 5: Verify build and tests**

Run: `npm run build && npm test`
Expected: build succeeds, all tests pass

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat: app shell with folder picker, save selector, tab nav"
```

---

### Task 12: Dashboard view

**Files:**
- Modify: `src/ui/dashboard.ts` (replace stub entirely)

- [ ] **Step 1: Replace src/ui/dashboard.ts**

```ts
import { openSave } from '../save/db';
import { readProperties } from '../save/properties';
import { readAdventureParty } from '../save/adventure';
import { readCats } from '../save/cats';
import { readFileBytes } from '../fs/files';
import { getState } from './state';

function stat(label: string, value: string | number): string {
  return `<div class="stat"><div class="label">${label}</div>
    <div class="value">${value}</div></div>`;
}

export async function renderDashboard(view: HTMLElement): Promise<void> {
  const { savesDir, selectedSave } = getState();
  const bytes = await readFileBytes(savesDir, selectedSave);
  const db = openSave(bytes);
  try {
    const p = readProperties(db);
    const cats = readCats(db);
    const partyIds = readAdventureParty(db);
    const byId = new Map(cats.map((c) => [c.id, c.name]));
    const party = partyIds.map((id) => byId.get(id) ?? `Cat #${id}`);

    view.innerHTML = `
      <h2>House</h2>
      <div class="stat-grid">
        ${stat('Day', p.currentDay)}
        ${stat('Gold', p.gold)}
        ${stat('Food', p.food)}
        ${stat('Blank collars', p.blankCollars)}
        ${stat('Weather', p.weather || '—')}
        ${stat('Storage upgrades', p.storageUpgrades)}
        ${stat('House boss in', `${p.houseBossCountdown} days`)}
        ${stat('Next boss', p.nextHouseBoss || '—')}
      </div>
      <h2>Progress</h2>
      <div class="stat-grid">
        ${stat('Save completion', `${p.savePercent}%`)}
        ${stat('Total cats', cats.length)}
        ${stat('Game version', p.versionString || '—')}
      </div>
      <h2>Adventure</h2>
      <div class="stat-grid">
        ${stat('On adventure', p.onAdventure ? 'Yes' : 'No')}
        ${p.onAdventure ? stat('Adventure coins', p.adventureCoins) : ''}
        ${p.onAdventure ? stat('Adventure food', p.adventureFood) : ''}
      </div>
      ${
        p.onAdventure && party.length
          ? `<p>Party: ${party
              .map((n) => `<span class="badge">${n}</span>`)
              .join(' ')}</p>`
          : ''
      }`;
  } finally {
    db.close();
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success

- [ ] **Step 3: Manual check (optional but recommended)**

Run: `npm run dev`, open the shown URL in Chrome/Edge on Windows, pick the real saves folder, confirm dashboard numbers match the game (day, gold, party names).

- [ ] **Step 4: Commit**

```bash
git add src/ui/dashboard.ts
git commit -m "feat: dashboard with house, progress, adventure stats"
```

---

### Task 13: Cats view

**Files:**
- Modify: `src/ui/catsView.ts` (replace stub entirely)

- [ ] **Step 1: Replace src/ui/catsView.ts**

```ts
import { openSave } from '../save/db';
import { readCats } from '../save/cats';
import { readAdventureParty } from '../save/adventure';
import { readFileBytes } from '../fs/files';
import { getState } from './state';

export async function renderCatsView(view: HTMLElement): Promise<void> {
  const { savesDir, selectedSave } = getState();
  const bytes = await readFileBytes(savesDir, selectedSave);
  const db = openSave(bytes);
  try {
    const cats = readCats(db);
    const party = new Set(readAdventureParty(db));
    view.innerHTML = `
      <div class="row">
        <input id="cat-filter" type="search" placeholder="Filter by name…" />
        <span>${cats.length} cats, ${party.size} on adventure</span>
      </div>
      <table>
        <thead><tr><th>ID</th><th>Name</th><th>Status</th></tr></thead>
        <tbody id="cat-rows"></tbody>
      </table>`;
    const tbody = document.getElementById('cat-rows')!;
    const renderRows = (filter: string) => {
      const f = filter.toLowerCase();
      tbody.innerHTML = cats
        .filter((c) => c.name.toLowerCase().includes(f))
        .map(
          (c) => `<tr><td>${c.id}</td><td>${c.name}</td>
            <td>${party.has(c.id) ? '<span class="badge">on adventure</span>' : ''}</td></tr>`,
        )
        .join('');
    };
    renderRows('');
    document
      .getElementById('cat-filter')!
      .addEventListener('input', (e) =>
        renderRows((e.target as HTMLInputElement).value),
      );
  } finally {
    db.close();
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success

- [ ] **Step 3: Commit**

```bash
git add src/ui/catsView.ts
git commit -m "feat: cats list with name filter and adventure badges"
```

---

### Task 14: Backups view (list, snapshot, restore, diff)

**Files:**
- Modify: `src/ui/backupsView.ts` (replace stub entirely)

- [ ] **Step 1: Replace src/ui/backupsView.ts**

```ts
import { openSave } from '../save/db';
import { summarize } from '../save/summary';
import { diffSaves, type SaveDiff } from '../save/diff';
import { parseBackupFileName, type GameBackup } from '../backups/gameBackups';
import {
  BACKUP_DIR_NAME,
  MANIFEST_NAME,
  makeBackupFileName,
  parseManifest,
  rebuildManifest,
  type Manifest,
  type OwnBackupEntry,
} from '../backups/ownBackups';
import {
  getDirIfExists,
  getOrCreateDir,
  listFileNames,
  readFileBytes,
  readFileText,
  writeFileBytes,
  writeFileText,
} from '../fs/files';
import { getState } from './state';

interface SaveSource {
  id: string; // 'live:<name>' | 'game:<name>' | 'own:<name>'
  label: string;
  read: () => Promise<Uint8Array>;
}

async function loadManifest(
  backupDir: FileSystemDirectoryHandle,
): Promise<Manifest> {
  try {
    return parseManifest(await readFileText(backupDir, MANIFEST_NAME));
  } catch {
    // Missing manifest: rebuild from the files actually present.
    return rebuildManifest(await listFileNames(backupDir));
  }
}

async function saveManifest(
  backupDir: FileSystemDirectoryHandle,
  manifest: Manifest,
): Promise<void> {
  await writeFileText(backupDir, MANIFEST_NAME, JSON.stringify(manifest, null, 2));
}

async function snapshot(label: string): Promise<void> {
  const { savesDir, selectedSave } = getState();
  const bytes = await readFileBytes(savesDir, selectedSave);
  const db = openSave(bytes);
  const stats = summarize(db);
  db.close();
  const backupDir = await getOrCreateDir(savesDir, BACKUP_DIR_NAME);
  const fileName = makeBackupFileName(label, new Date());
  await writeFileBytes(backupDir, fileName, bytes);
  const manifest = await loadManifest(backupDir);
  const entry: OwnBackupEntry = {
    fileName,
    label,
    createdAt: new Date().toISOString(),
    stats,
  };
  manifest.backups = [entry, ...manifest.backups];
  await saveManifest(backupDir, manifest);
}

async function restore(read: () => Promise<Uint8Array>): Promise<void> {
  const { savesDir, selectedSave } = getState();
  // Safety snapshot of the current live save first.
  await snapshot('auto-pre-restore');
  const bytes = await read();
  openSave(bytes).close(); // validate before writing anything
  await writeFileBytes(savesDir, selectedSave, bytes);
}

function renderDiff(diff: SaveDiff): string {
  const props = diff.properties
    .map(
      (p) => `<tr><td>${p.key}</td><td>${p.before ?? '—'}</td>
        <td>${p.after ?? '—'}</td></tr>`,
    )
    .join('');
  const cats = diff.cats
    .map(
      (c) => `<tr><td>${c.id}</td><td>${c.kind}</td>
        <td>${c.kind === 'renamed' ? `${c.previousName} → ${c.name}` : c.name}</td></tr>`,
    )
    .join('');
  return `
    <h3>Properties (${diff.properties.length} changed)</h3>
    <table><thead><tr><th>Key</th><th>A</th><th>B</th></tr></thead>
    <tbody>${props || '<tr><td colspan="3">No changes</td></tr>'}</tbody></table>
    <h3>Cats (${diff.cats.length} changed)</h3>
    <table><thead><tr><th>ID</th><th>Change</th><th>Name</th></tr></thead>
    <tbody>${cats || '<tr><td colspan="3">No changes</td></tr>'}</tbody></table>`;
}

export async function renderBackupsView(
  view: HTMLElement,
  refresh: () => void,
): Promise<void> {
  const { savesDir, selectedSave } = getState();

  const gameBackupDir = await getDirIfExists(savesDir, 'backups');
  const gameBackups: GameBackup[] = [];
  if (gameBackupDir) {
    for (const name of await listFileNames(gameBackupDir)) {
      const parsed = parseBackupFileName(name);
      if (parsed) gameBackups.push(parsed);
    }
    gameBackups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  const ownDir = await getDirIfExists(savesDir, BACKUP_DIR_NAME);
  const manifest = ownDir ? await loadManifest(ownDir) : { backups: [] };

  const sources: SaveSource[] = [
    {
      id: `live:${selectedSave}`,
      label: `Live: ${selectedSave}`,
      read: () => readFileBytes(savesDir, selectedSave),
    },
    ...gameBackups.map((b) => ({
      id: `game:${b.fileName}`,
      label: `Game backup: ${b.fileName}`,
      read: () => readFileBytes(gameBackupDir!, b.fileName),
    })),
    ...manifest.backups.map((b) => ({
      id: `own:${b.fileName}`,
      label: `Own backup: ${b.fileName}`,
      read: async () => {
        const dir = await getOrCreateDir(savesDir, BACKUP_DIR_NAME);
        return readFileBytes(dir, b.fileName);
      },
    })),
  ];
  const sourceOptions = sources
    .map((s) => `<option value="${s.id}">${s.label}</option>`)
    .join('');

  view.innerHTML = `
    <h2>Create backup</h2>
    <div class="row">
      <input id="backup-label" placeholder="Label, e.g. before-risky-run" />
      <button id="backup-create">Snapshot now</button>
    </div>

    <h2>Own backups (${manifest.backups.length})</h2>
    <table>
      <thead><tr><th>Label</th><th>Created</th><th>Day</th><th>Gold</th>
      <th>Cats</th><th></th></tr></thead>
      <tbody>${
        manifest.backups
          .map(
            (b) => `<tr>
          <td>${b.label}</td>
          <td>${new Date(b.createdAt).toLocaleString()}</td>
          <td>${b.stats?.day ?? '?'}</td>
          <td>${b.stats?.gold ?? '?'}</td>
          <td>${b.stats?.catCount ?? '?'}</td>
          <td><button class="danger restore-own" data-file="${b.fileName}">Restore</button></td>
        </tr>`,
          )
          .join('') || '<tr><td colspan="6">None yet</td></tr>'
      }</tbody>
    </table>

    <h2>Game backups (${gameBackups.length})</h2>
    <table>
      <thead><tr><th>File</th><th>Time</th><th></th></tr></thead>
      <tbody>${
        gameBackups
          .map(
            (b) => `<tr>
          <td>${b.fileName}</td>
          <td>${b.timestamp.toLocaleString()}</td>
          <td><button class="danger restore-game" data-file="${b.fileName}">Restore</button></td>
        </tr>`,
          )
          .join('') || '<tr><td colspan="3">None found</td></tr>'
      }</tbody>
    </table>

    <h2>Diff two saves</h2>
    <div class="row">
      <select id="diff-a">${sourceOptions}</select>
      <span>vs</span>
      <select id="diff-b">${sourceOptions}</select>
      <button id="diff-run">Diff</button>
    </div>
    <div id="diff-result"></div>
    <p id="backups-error" class="error"></p>`;

  const errorEl = document.getElementById('backups-error')!;
  const fail = (e: unknown) => {
    errorEl.textContent = String(e);
  };

  document.getElementById('backup-create')!.addEventListener('click', () => {
    const label =
      (document.getElementById('backup-label') as HTMLInputElement).value ||
      'backup';
    snapshot(label).then(refresh).catch(fail);
  });

  const confirmRestore = (): boolean =>
    confirm(
      'Restore this backup over the live save?\n\n' +
        'A safety snapshot of the current save will be created first.\n\n' +
        'WARNING: If Mewgenics is running, it keeps its state in memory and ' +
        'will overwrite the restored file the next time it saves. Close the ' +
        'game first for a reliable restore.',
    );

  for (const btn of view.querySelectorAll<HTMLButtonElement>('.restore-own')) {
    btn.addEventListener('click', () => {
      if (!confirmRestore()) return;
      restore(async () => {
        const dir = await getOrCreateDir(savesDir, BACKUP_DIR_NAME);
        return readFileBytes(dir, btn.dataset.file!);
      })
        .then(refresh)
        .catch(fail);
    });
  }
  for (const btn of view.querySelectorAll<HTMLButtonElement>('.restore-game')) {
    btn.addEventListener('click', () => {
      if (!confirmRestore()) return;
      restore(() => readFileBytes(gameBackupDir!, btn.dataset.file!))
        .then(refresh)
        .catch(fail);
    });
  }

  document.getElementById('diff-run')!.addEventListener('click', async () => {
    try {
      const idA = (document.getElementById('diff-a') as HTMLSelectElement).value;
      const idB = (document.getElementById('diff-b') as HTMLSelectElement).value;
      const a = sources.find((s) => s.id === idA)!;
      const b = sources.find((s) => s.id === idB)!;
      const dbA = openSave(await a.read());
      const dbB = openSave(await b.read());
      try {
        document.getElementById('diff-result')!.innerHTML = renderDiff(
          diffSaves(dbA, dbB),
        );
      } finally {
        dbA.close();
        dbB.close();
      }
    } catch (e) {
      fail(e);
    }
  });
}
```

- [ ] **Step 2: Verify build and tests**

Run: `npm run build && npm test`
Expected: success, all tests pass

- [ ] **Step 3: Manual verification against real saves**

Run: `npm run dev`, open in Chrome/Edge on Windows. Check:
1. Game backups list shows the real `backups/*.savbackup` files, newest first
2. "Snapshot now" with a label creates `manager_backups/<label>_<ts>.sav` + `manifest.json` (verify in Explorer)
3. Diff live vs an old game backup shows plausible changes (day, gold, cats)
4. Restore an own backup → confirm dialog appears → live `.sav` replaced, `auto-pre-restore` snapshot created
5. All of the above with the game running (read paths must not error)

- [ ] **Step 4: Commit**

```bash
git add src/ui/backupsView.ts
git commit -m "feat: backups view with snapshot, restore, and diff"
```

---

### Task 15: GitHub Pages deploy + README

**Files:**
- Create: `.github/workflows/deploy.yml`
- Create: `README.md`

- [ ] **Step 1: Create .github/workflows/deploy.yml**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Create README.md**

````markdown
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
````

- [ ] **Step 3: Verify workflow syntax locally**

Run: `npx tsc --noEmit && npm test`
Expected: clean

- [ ] **Step 4: Commit**

```bash
git add .github README.md
git commit -m "ci: GitHub Pages deploy workflow and README"
```

- [ ] **Step 5: Enable GitHub Pages (Actions build type)**

Run:
```bash
gh api -X POST repos/xxlbug/mewgenics-savegame-manager/pages -f build_type=workflow
```
Expected: HTTP 201 (or 409 if already enabled — also fine).

---

### Task 16: Final verification + PR

- [ ] **Step 1: Run everything**

Run: `npm test && npm run build`
Expected: all tests pass, clean build

- [ ] **Step 2: Push branch and open PR**

```bash
git push -u origin feature/initial-implementation
gh pr create --title "Mewgenics savegame manager: initial implementation" --body "$(cat <<'EOF'
## Summary
- Pure-browser savegame manager (File System Access API + sql.js)
- Dashboard: house/progress/adventure stats incl. party names
- Cats list with filter and adventure badges
- Backups: list game + own backups, labeled snapshots, restore with safety
  snapshot, diff two saves
- Vitest coverage for all parser/model modules
- GitHub Pages deploy workflow

## Test plan
- [x] `npm test` (unit tests for db/properties/cats/adventure/summary/diff/backup models)
- [x] Manual: dashboard matches in-game values on real save
- [x] Manual: snapshot/restore/diff against real saves folder
- [ ] Pages deploy verified after merge

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: After merge, verify Pages deployment**

Once the PR is merged, the workflow runs on `main`. Check:
```bash
gh run watch
```
Then open `https://xxlbug.github.io/mewgenics-savegame-manager/` in Chrome/Edge and confirm the picker loads.
