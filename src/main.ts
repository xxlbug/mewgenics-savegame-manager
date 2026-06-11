import './styles.css';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { initSql } from './save/db';
import {
  detectSavesDirs,
  forgetSavesDirectory,
  pickSavesDirectory,
  rememberSavesDirectory,
  restoreSavesDirectory,
} from './fs/directory';
import { fileLastModified, listFileNames } from './fs/files';
import { getState, setState, setSelectedSave } from './ui/state';
import { escapeHtml } from './ui/escape';
import { renderCatsView } from './ui/catsView';
import { renderBackupsView } from './ui/backupsView';

const app = document.querySelector<HTMLDivElement>('#app')!;

type Tab = 'backups' | 'cats';
let currentTab: Tab = 'backups';

async function main(): Promise<void> {
  await initSql(() => wasmUrl);
  const remembered = await restoreSavesDirectory();
  if (remembered) {
    await enterApp(remembered);
    return;
  }
  const detected = await detectSavesDirs();
  if (detected.length === 1) {
    await enterApp(detected[0]!);
  } else if (detected.length > 1) {
    renderChooser(detected);
  } else {
    renderPicker(
      'No Mewgenics saves folder found automatically. Select it manually:',
    );
  }
}

function renderChooser(dirs: string[]): void {
  app.innerHTML = `<div class="notice">
    <h1>Mewgenics Savegame Manager</h1>
    <p>Multiple save locations found — pick one:</p>
    <div id="dir-list"></div></div>`;
  const list = document.getElementById('dir-list')!;
  for (const dir of dirs) {
    const btn = document.createElement('button');
    btn.textContent = dir;
    btn.style.display = 'block';
    btn.style.margin = '0.5rem auto';
    btn.addEventListener('click', () => void enterApp(dir));
    list.appendChild(btn);
  }
}

function renderPicker(message: string): void {
  app.innerHTML = `<div class="notice">
    <h1>Mewgenics Savegame Manager</h1>
    <p>${escapeHtml(message)}</p>
    <p><code>%APPDATA%\\Glaiel Games\\Mewgenics\\&lt;steam-id&gt;\\saves</code></p>
    <button id="pick">Select saves folder</button>
    <p id="pick-error" class="error"></p></div>`;
  document.getElementById('pick')!.addEventListener('click', async () => {
    try {
      const dir = await pickSavesDirectory();
      if (dir) await enterApp(dir);
    } catch (e) {
      document.getElementById('pick-error')!.textContent = String(e);
    }
  });
}

async function enterApp(dir: string): Promise<void> {
  let names: string[];
  try {
    names = (await listFileNames(dir)).filter((n) => n.endsWith('.sav'));
  } catch (e) {
    forgetSavesDirectory();
    renderPicker(`Could not read folder (${String(e)}). Select it manually:`);
    return;
  }
  if (names.length === 0) {
    forgetSavesDirectory();
    renderPicker('No .sav files found in that folder. Select the saves folder:');
    return;
  }
  rememberSavesDirectory(dir);
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
        <button data-tab="backups">Backups</button>
        <button data-tab="cats">Cats</button>
        <button id="change-folder" title="Change saves folder">📁</button>
      </nav>
    </header>
    <main id="view"></main>`;
  document
    .getElementById('save-select')!
    .addEventListener('change', (e) => {
      setSelectedSave((e.target as HTMLSelectElement).value);
      void renderTab(currentTab);
    });
  for (const btn of app.querySelectorAll<HTMLButtonElement>('nav button[data-tab]')) {
    btn.addEventListener('click', () => {
      void renderTab(btn.dataset.tab as Tab);
    });
  }
  document.getElementById('change-folder')!.addEventListener('click', () => {
    forgetSavesDirectory();
    void main();
  });
  void renderTab(currentTab);
}

async function renderTab(tab: Tab): Promise<void> {
  currentTab = tab;
  for (const btn of app.querySelectorAll<HTMLButtonElement>('nav button[data-tab]')) {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  }
  const view = document.getElementById('view')!;
  view.innerHTML = '<p>Loading…</p>';
  try {
    if (tab === 'cats') await renderCatsView(view);
    else await renderBackupsView(view, () => renderTab('backups'));
  } catch (e) {
    view.innerHTML = `<p class="error">Failed to read save: ${String(e)}</p>`;
  }
}

void main();
