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
