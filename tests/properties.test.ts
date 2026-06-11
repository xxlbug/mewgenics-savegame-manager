import { describe, it, expect, beforeAll } from 'vitest';
import { initSql, openSave } from '../src/save/db';
import { readProperties } from '../src/save/properties';
import { buildFixtureBytes } from './helpers/buildFixture';

beforeAll(() => initSql());

describe('readProperties', () => {
  it('reads known keys with correct types', async () => {
    const db = openSave(
      await buildFixtureBytes({
        properties: {
          house_gold: 590,
          house_food: 289,
          blank_collars: 3,
          current_day: 187,
          current_house_weather: 'Snow',
          on_adventure: 1,
          adventure_coins: 99,
          adventure_food: 118,
          save_file_percent: 70,
          house_boss_countdown: 4,
          next_house_boss: 'terminator_2',
          house_storage_upgrades: 4,
          version_string: '1.1',
        },
      }),
    );
    const p = readProperties(db);
    expect(p.gold).toBe(590);
    expect(p.food).toBe(289);
    expect(p.blankCollars).toBe(3);
    expect(p.currentDay).toBe(187);
    expect(p.weather).toBe('Snow');
    expect(p.onAdventure).toBe(true);
    expect(p.adventureCoins).toBe(99);
    expect(p.adventureFood).toBe(118);
    expect(p.savePercent).toBe(70);
    expect(p.houseBossCountdown).toBe(4);
    expect(p.nextHouseBoss).toBe('terminator_2');
    expect(p.storageUpgrades).toBe(4);
    expect(p.versionString).toBe('1.1');
  });

  it('falls back to defaults for missing keys', async () => {
    const db = openSave(await buildFixtureBytes({ properties: {} }));
    const p = readProperties(db);
    expect(p.gold).toBe(0);
    expect(p.weather).toBe('');
    expect(p.onAdventure).toBe(false);
  });
});
