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
