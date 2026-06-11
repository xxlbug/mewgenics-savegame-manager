import type { Database } from 'sql.js';
import { readProperties } from './properties';

export interface SaveSummary {
  day: number;
  gold: number;
  food: number;
  catCount: number;
  onAdventure: boolean;
  savePercent: number;
}

export function summarize(db: Database): SaveSummary {
  const p = readProperties(db);
  const res = db.exec('SELECT COUNT(*) FROM cats');
  const catCount = Number(res[0]?.values[0]?.[0] ?? 0);
  return {
    day: p.currentDay,
    gold: p.gold,
    food: p.food,
    catCount,
    onAdventure: p.onAdventure,
    savePercent: p.savePercent,
  };
}
