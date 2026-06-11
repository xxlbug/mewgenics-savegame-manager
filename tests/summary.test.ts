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
