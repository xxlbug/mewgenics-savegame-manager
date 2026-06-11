import { openSave } from '../save/db';
import { readCats } from '../save/cats';
import { readAdventureParty } from '../save/adventure';
import { readFileBytes } from '../fs/files';
import { getState } from './state';
import { escapeHtml } from './escape';

export async function renderCatsView(view: HTMLElement): Promise<void> {
  const { savesDir, selectedSave } = getState();
  const bytes = await readFileBytes(savesDir, selectedSave);
  const db = openSave(bytes);
  try {
    const cats = readCats(db);
    const party = new Set(readAdventureParty(db));
    view.innerHTML = `
      <div class="row">
        <input id="cat-filter" type="search" placeholder="Filter by name…" />
        <span>${cats.length} cats, ${party.size} on adventure</span>
      </div>
      <table>
        <thead><tr><th>ID</th><th>Name</th><th>Status</th></tr></thead>
        <tbody id="cat-rows"></tbody>
      </table>`;
    const tbody = document.getElementById('cat-rows')!;
    const renderRows = (filter: string) => {
      const f = filter.toLowerCase();
      tbody.innerHTML = cats
        .filter((c) => c.name.toLowerCase().includes(f))
        .map(
          (c) => `<tr><td>${c.id}</td><td>${escapeHtml(c.name)}</td>
            <td>${party.has(c.id) ? '<span class="badge">on adventure</span>' : ''}</td></tr>`,
        )
        .join('');
    };
    renderRows('');
    document
      .getElementById('cat-filter')!
      .addEventListener('input', (e) =>
        renderRows((e.target as HTMLInputElement).value),
      );
  } finally {
    db.close();
  }
}
