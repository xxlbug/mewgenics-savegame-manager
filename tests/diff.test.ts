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
