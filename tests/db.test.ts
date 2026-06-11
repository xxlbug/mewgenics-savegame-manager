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
