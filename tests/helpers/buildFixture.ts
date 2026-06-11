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
