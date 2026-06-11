import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

const STORAGE_KEY = 'savesDirPath';

/** Saves dirs auto-detected under %APPDATA%/Glaiel Games/Mewgenics. */
export async function detectSavesDirs(): Promise<string[]> {
  return invoke<string[]>('detect_saves_dirs');
}

/** Folder picker dialog; null if cancelled. */
export async function pickSavesDirectory(): Promise<string | null> {
  const dir = await open({ directory: true, title: 'Select Mewgenics saves folder' });
  return typeof dir === 'string' ? dir : null;
}

export function rememberSavesDirectory(path: string): void {
  localStorage.setItem(STORAGE_KEY, path);
}

export function forgetSavesDirectory(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export async function restoreSavesDirectory(): Promise<string | null> {
  const path = localStorage.getItem(STORAGE_KEY);
  if (!path) return null;
  const exists = await invoke<boolean>('path_exists', { path });
  return exists ? path : null;
}
