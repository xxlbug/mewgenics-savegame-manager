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
