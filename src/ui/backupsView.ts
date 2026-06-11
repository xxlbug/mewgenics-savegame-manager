import { openSave } from '../save/db';
import { readProperties } from '../save/properties';
import { readCats } from '../save/cats';
import { readAdventureParty } from '../save/adventure';
import { summarize } from '../save/summary';
import { diffSaves, type SaveDiff } from '../save/diff';
import { parseBackupFileName, type GameBackup } from '../backups/gameBackups';
import {
  BACKUP_DIR_NAME,
  MANIFEST_NAME,
  makeBackupFileName,
  parseManifest,
  rebuildManifest,
  type Manifest,
  type OwnBackupEntry,
} from '../backups/ownBackups';
import {
  getDirIfExists,
  getOrCreateDir,
  listFileNames,
  readFileBytes,
  readFileText,
  writeFileBytes,
  writeFileText,
} from '../fs/files';
import { getState } from './state';
import { escapeHtml } from './escape';

interface SaveSource {
  id: string; // 'live:<name>' | 'game:<name>' | 'own:<name>'
  label: string;
  read: () => Promise<Uint8Array>;
}

async function loadManifest(backupDir: string): Promise<Manifest> {
  try {
    return parseManifest(await readFileText(backupDir, MANIFEST_NAME));
  } catch {
    // Missing manifest: rebuild from the files actually present.
    return rebuildManifest(await listFileNames(backupDir));
  }
}

async function saveManifest(backupDir: string, manifest: Manifest): Promise<void> {
  await writeFileText(backupDir, MANIFEST_NAME, JSON.stringify(manifest, null, 2));
}

async function snapshot(label: string): Promise<void> {
  const { savesDir, selectedSave } = getState();
  const bytes = await readFileBytes(savesDir, selectedSave);
  const db = openSave(bytes);
  const stats = summarize(db);
  db.close();
  const backupDir = await getOrCreateDir(savesDir, BACKUP_DIR_NAME);
  const fileName = makeBackupFileName(label, new Date());
  await writeFileBytes(backupDir, fileName, bytes);
  const manifest = await loadManifest(backupDir);
  const entry: OwnBackupEntry = {
    fileName,
    label,
    createdAt: new Date().toISOString(),
    stats,
  };
  manifest.backups = [entry, ...manifest.backups];
  await saveManifest(backupDir, manifest);
}

async function restore(read: () => Promise<Uint8Array>): Promise<void> {
  const { savesDir, selectedSave } = getState();
  // Safety snapshot of the current live save first.
  await snapshot('auto-pre-restore');
  const bytes = await read();
  openSave(bytes).close(); // validate before writing anything
  await writeFileBytes(savesDir, selectedSave, bytes);
  const written = await readFileBytes(savesDir, selectedSave);
  try {
    openSave(written).close();
  } catch (e) {
    throw new Error(
      `Restore wrote a file that failed to parse — your previous save is safe in ${BACKUP_DIR_NAME}/ (auto-pre-restore). ${String(e)}`,
    );
  }
}

function renderDiff(diff: SaveDiff): string {
  const props = diff.properties
    .map(
      (p) => `<tr><td>${escapeHtml(p.key)}</td><td>${p.before != null ? escapeHtml(String(p.before)) : '—'}</td>
        <td>${p.after != null ? escapeHtml(String(p.after)) : '—'}</td></tr>`,
    )
    .join('');
  const cats = diff.cats
    .map(
      (c) => `<tr><td>${c.id}</td><td>${c.kind}</td>
        <td>${c.kind === 'renamed' ? `${escapeHtml(c.previousName ?? '')} → ${escapeHtml(c.name)}` : escapeHtml(c.name)}</td></tr>`,
    )
    .join('');
  return `
    <h3>Properties (${diff.properties.length} changed)</h3>
    <table><thead><tr><th>Key</th><th>A</th><th>B</th></tr></thead>
    <tbody>${props || '<tr><td colspan="3">No changes</td></tr>'}</tbody></table>
    <h3>Cats (${diff.cats.length} changed)</h3>
    <table><thead><tr><th>ID</th><th>Change</th><th>Name</th></tr></thead>
    <tbody>${cats || '<tr><td colspan="3">No changes</td></tr>'}</tbody></table>`;
}

export async function renderBackupsView(
  view: HTMLElement,
  refresh: () => void,
): Promise<void> {
  const { savesDir, selectedSave } = getState();

  // Identification header for the currently selected save
  const liveBytes = await readFileBytes(savesDir, selectedSave);
  const liveDb = openSave(liveBytes);
  let headerHtml: string;
  try {
    const p = readProperties(liveDb);
    const cats = readCats(liveDb);
    const partyIds = readAdventureParty(liveDb);
    const byId = new Map(cats.map((c) => [c.id, c.name]));
    const party = partyIds.map((id) => byId.get(id) ?? `Cat #${id}`);
    headerHtml = `
    <section class="current-save">
      <h2>${escapeHtml(selectedSave)}</h2>
      <div class="summary-row">
        <span class="chip">Day ${p.currentDay}</span>
        <span class="chip">${p.gold} gold</span>
        <span class="chip">${p.food} food</span>
        <span class="chip">${cats.length} cats</span>
        <span class="chip">${p.savePercent}% complete</span>
        <span class="chip">${escapeHtml(p.weather || '—')}</span>
        ${
          p.onAdventure
            ? `<span class="chip adventure">On adventure: ${party
                .map((n) => escapeHtml(n))
                .join(', ')}</span>`
            : '<span class="chip">At home</span>'
        }
      </div>
    </section>`;
  } finally {
    liveDb.close();
  }

  const gameBackupDir = await getDirIfExists(savesDir, 'backups');
  const gameBackups: GameBackup[] = [];
  if (gameBackupDir) {
    for (const name of await listFileNames(gameBackupDir)) {
      const parsed = parseBackupFileName(name);
      if (parsed) gameBackups.push(parsed);
    }
    gameBackups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  const ownDir = await getDirIfExists(savesDir, BACKUP_DIR_NAME);
  const manifest = ownDir ? await loadManifest(ownDir) : { backups: [] };

  const sources: SaveSource[] = [
    {
      id: `live:${selectedSave}`,
      label: `Live: ${selectedSave}`,
      read: () => readFileBytes(savesDir, selectedSave),
    },
    ...gameBackups.map((b) => ({
      id: `game:${b.fileName}`,
      label: `Game backup: ${b.fileName}`,
      read: () => readFileBytes(gameBackupDir!, b.fileName),
    })),
    ...manifest.backups.map((b) => ({
      id: `own:${b.fileName}`,
      label: `Own backup: ${b.fileName}`,
      read: async () => {
        const dir = await getOrCreateDir(savesDir, BACKUP_DIR_NAME);
        return readFileBytes(dir, b.fileName);
      },
    })),
  ];
  const sourceOptions = sources
    .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.label)}</option>`)
    .join('');

  view.innerHTML = headerHtml + `
    <h2>Create backup</h2>
    <div class="row">
      <input id="backup-label" placeholder="Label, e.g. before-risky-run" />
      <button id="backup-create">Snapshot now</button>
    </div>

    <h2>Own backups (${manifest.backups.length})</h2>
    <table>
      <thead><tr><th>Label</th><th>Created</th><th>Day</th><th>Gold</th>
      <th>Cats</th><th></th></tr></thead>
      <tbody>${
        manifest.backups
          .map(
            (b) => `<tr>
          <td>${escapeHtml(b.label)}</td>
          <td>${new Date(b.createdAt).toLocaleString()}</td>
          <td>${b.stats?.day ?? '?'}</td>
          <td>${b.stats?.gold ?? '?'}</td>
          <td>${b.stats?.catCount ?? '?'}</td>
          <td><button class="danger restore-own" data-file="${escapeHtml(b.fileName)}">Restore</button></td>
        </tr>`,
          )
          .join('') || '<tr><td colspan="6">None yet</td></tr>'
      }</tbody>
    </table>

    <h2>Game backups (${gameBackups.length})</h2>
    <table>
      <thead><tr><th>File</th><th>Time</th><th></th></tr></thead>
      <tbody>${
        gameBackups
          .map(
            (b) => `<tr>
          <td>${escapeHtml(b.fileName)}</td>
          <td>${b.timestamp.toLocaleString()}</td>
          <td><button class="danger restore-game" data-file="${escapeHtml(b.fileName)}">Restore</button></td>
        </tr>`,
          )
          .join('') || '<tr><td colspan="3">None found</td></tr>'
      }</tbody>
    </table>

    <h2>Diff two saves</h2>
    <div class="row">
      <select id="diff-a">${sourceOptions}</select>
      <span>vs</span>
      <select id="diff-b">${sourceOptions}</select>
      <button id="diff-run">Diff</button>
    </div>
    <div id="diff-result"></div>
    <p id="backups-error" class="error"></p>`;

  const errorEl = document.getElementById('backups-error')!;
  const fail = (e: unknown) => {
    errorEl.textContent = String(e);
  };

  document.getElementById('backup-create')!.addEventListener('click', () => {
    const label =
      (document.getElementById('backup-label') as HTMLInputElement).value ||
      'backup';
    snapshot(label).then(refresh).catch(fail);
  });

  const confirmRestore = (): boolean =>
    confirm(
      'Restore this backup over the live save?\n\n' +
        'A safety snapshot of the current save will be created first.\n\n' +
        'WARNING: If Mewgenics is running, it keeps its state in memory and ' +
        'will overwrite the restored file the next time it saves. Close the ' +
        'game first for a reliable restore.',
    );

  for (const btn of view.querySelectorAll<HTMLButtonElement>('.restore-own')) {
    btn.addEventListener('click', () => {
      if (!confirmRestore()) return;
      restore(async () => {
        const dir = await getOrCreateDir(savesDir, BACKUP_DIR_NAME);
        return readFileBytes(dir, btn.dataset.file!);
      })
        .then(refresh)
        .catch(fail);
    });
  }
  for (const btn of view.querySelectorAll<HTMLButtonElement>('.restore-game')) {
    btn.addEventListener('click', () => {
      if (!confirmRestore()) return;
      restore(() => readFileBytes(gameBackupDir!, btn.dataset.file!))
        .then(refresh)
        .catch(fail);
    });
  }

  document.getElementById('diff-run')!.addEventListener('click', async () => {
    try {
      const idA = (document.getElementById('diff-a') as HTMLSelectElement).value;
      const idB = (document.getElementById('diff-b') as HTMLSelectElement).value;
      const a = sources.find((s) => s.id === idA)!;
      const b = sources.find((s) => s.id === idB)!;
      const dbA = openSave(await a.read());
      const dbB = openSave(await b.read());
      try {
        document.getElementById('diff-result')!.innerHTML = renderDiff(
          diffSaves(dbA, dbB),
        );
      } finally {
        dbA.close();
        dbB.close();
      }
    } catch (e) {
      fail(e);
    }
  });
}
