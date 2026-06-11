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
