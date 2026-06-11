import './styles.css';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { initSql } from './save/db';
import {
  isFileSystemAccessSupported,
  pickSavesDirectory,
  restoreSavesDirectory,
} from './fs/directory';
import { fileLastModified, listFileNames } from './fs/files';
import { getState, setState } from './ui/state';
import { renderDashboard } from './ui/dashboard';
import { renderCatsView } from './ui/catsView';
import { renderBackupsView } from './ui/backupsView';

const app = document.querySelector<HTMLDivElement>('#app')!;

type Tab = 'dashboard' | 'cats' | 'backups';
let currentTab: Tab = 'dashboard';

async function main(): Promise<void> {
  if (!isFileSystemAccessSupported()) {
    app.innerHTML = `<div class="notice error">
      <h1>Browser not supported</h1>
      <p>This tool needs the File System Access API.
      Please use Chrome or Edge.</p></div>`;
    return;
  }
  await initSql(() => wasmUrl);
  const restored = await restoreSavesDirectory();
  if (restored) {
    await enterApp(restored);
  } else {
    renderPicker();
  }
}

function renderPicker(): void {
  app.innerHTML = `<div class="notice">
    <h1>Mewgenics Savegame Manager</h1>
    <p>Select your Mewgenics <code>saves</code> folder. On Windows it is:</p>
    <p><code>%APPDATA%\\Glaiel Games\\Mewgenics\\&lt;steam-id&gt;\\saves</code></p>
    <button id="pick">Select saves folder</button>
    <p id="pick-error" class="error"></p></div>`;
  document.getElementById('pick')!.addEventListener('click', async () => {
    try {
      const dir = await pickSavesDirectory();
      await enterApp(dir);
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') {
        document.getElementById('pick-error')!.textContent = String(e);
      }
    }
  });
}

async function enterApp(dir: FileSystemDirectoryHandle): Promise<void> {
  const names = (await listFileNames(dir)).filter((n) => n.endsWith('.sav'));
  if (names.length === 0) {
    app.innerHTML = `<div class="notice error">
      <p>No .sav files found in the selected folder.</p>
      <button id="repick">Pick another folder</button></div>`;
    document
      .getElementById('repick')!
      .addEventListener('click', () => renderPicker());
    return;
  }
  // Default to the most recently modified save.
  const withTimes = await Promise.all(
    names.map(async (n) => [n, await fileLastModified(dir, n)] as const),
  );
  withTimes.sort((a, b) => b[1] - a[1]);
  setState({
    savesDir: dir,
    saveFiles: names.sort(),
    selectedSave: withTimes[0]![0],
  });
  renderShell();
}

function renderShell(): void {
  const { saveFiles, selectedSave } = getState();
  app.innerHTML = `
    <header>
      <h1>Mewgenics Savegame Manager</h1>
      <label>Save file:
        <select id="save-select">
          ${saveFiles
            .map(
              (n) =>
                `<option value="${n}" ${n === selectedSave ? 'selected' : ''}>${n}</option>`,
            )
            .join('')}
        </select>
      </label>
      <nav>
        <button data-tab="dashboard">Dashboard</button>
        <button data-tab="cats">Cats</button>
        <button data-tab="backups">Backups</button>
      </nav>
    </header>
    <main id="view"></main>`;
  document
    .getElementById('save-select')!
    .addEventListener('change', (e) => {
      getState().selectedSave = (e.target as HTMLSelectElement).value;
      void renderTab(currentTab);
    });
  for (const btn of app.querySelectorAll<HTMLButtonElement>('nav button')) {
    btn.addEventListener('click', () => {
      void renderTab(btn.dataset.tab as Tab);
    });
  }
  void renderTab(currentTab);
}

async function renderTab(tab: Tab): Promise<void> {
  currentTab = tab;
  for (const btn of app.querySelectorAll<HTMLButtonElement>('nav button')) {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  }
  const view = document.getElementById('view')!;
  view.innerHTML = '<p>Loading…</p>';
  try {
    if (tab === 'dashboard') await renderDashboard(view);
    else if (tab === 'cats') await renderCatsView(view);
    else await renderBackupsView(view, () => renderTab('backups'));
  } catch (e) {
    view.innerHTML = `<p class="error">Failed to read save: ${String(e)}</p>`;
  }
}

void main();
