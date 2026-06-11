export interface AppState {
  savesDir: FileSystemDirectoryHandle;
  /** Names of *.sav files in the saves folder root. */
  saveFiles: string[];
  /** Currently selected live save filename. */
  selectedSave: string;
}

let state: AppState | null = null;

export function setState(s: AppState): void {
  state = s;
}

export function getState(): AppState {
  if (!state) throw new Error('App state not initialized');
  return state;
}

export function setSelectedSave(name: string): void {
  if (!state) throw new Error('App state not initialized');
  state.selectedSave = name;
}
