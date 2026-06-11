import { openSave } from '../save/db';
import { readProperties } from '../save/properties';
import { readAdventureParty } from '../save/adventure';
import { readCats } from '../save/cats';
import { readFileBytes } from '../fs/files';
import { getState } from './state';
import { escapeHtml } from './escape';

function stat(label: string, value: string | number): string {
  return `<div class="stat"><div class="label">${label}</div>
    <div class="value">${value}</div></div>`;
}

export async function renderDashboard(view: HTMLElement): Promise<void> {
  const { savesDir, selectedSave } = getState();
  const bytes = await readFileBytes(savesDir, selectedSave);
  const db = openSave(bytes);
  try {
    const p = readProperties(db);
    const cats = readCats(db);
    const partyIds = readAdventureParty(db);
    const byId = new Map(cats.map((c) => [c.id, c.name]));
    const party = partyIds.map((id) => byId.get(id) ?? `Cat #${id}`);

    view.innerHTML = `
      <h2>House</h2>
      <div class="stat-grid">
        ${stat('Day', p.currentDay)}
        ${stat('Gold', p.gold)}
        ${stat('Food', p.food)}
        ${stat('Blank collars', p.blankCollars)}
        ${stat('Weather', p.weather ? escapeHtml(p.weather) : '—')}
        ${stat('Storage upgrades', p.storageUpgrades)}
        ${stat('House boss in', `${p.houseBossCountdown} days`)}
        ${stat('Next boss', p.nextHouseBoss ? escapeHtml(p.nextHouseBoss) : '—')}
      </div>
      <h2>Progress</h2>
      <div class="stat-grid">
        ${stat('Save completion', `${p.savePercent}%`)}
        ${stat('Total cats', cats.length)}
        ${stat('Game version', p.versionString ? escapeHtml(p.versionString) : '—')}
      </div>
      <h2>Adventure</h2>
      <div class="stat-grid">
        ${stat('On adventure', p.onAdventure ? 'Yes' : 'No')}
        ${p.onAdventure ? stat('Adventure coins', p.adventureCoins) : ''}
        ${p.onAdventure ? stat('Adventure food', p.adventureFood) : ''}
      </div>
      ${
        p.onAdventure && party.length
          ? `<p>Party: ${party
              .map((n) => `<span class="badge">${escapeHtml(n)}</span>`)
              .join(' ')}</p>`
          : ''
      }`;
  } finally {
    db.close();
  }
}
