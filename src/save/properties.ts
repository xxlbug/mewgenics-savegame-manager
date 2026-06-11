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
