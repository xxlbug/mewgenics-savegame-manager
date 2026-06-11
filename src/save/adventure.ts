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
