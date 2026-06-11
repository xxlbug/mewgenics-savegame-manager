import { get, set } from 'idb-keyval';

const HANDLE_KEY = 'savesDirHandle';

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/** Ask the user to pick the Mewgenics `saves` folder; persist the handle. */
export async function pickSavesDirectory(): Promise<FileSystemDirectoryHandle> {
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
  await set(HANDLE_KEY, handle);
  return handle;
}

/**
 * Restore the persisted handle. Returns null if none stored or permission
 * was not re-granted (queryPermission/requestPermission flow).
 */
export async function restoreSavesDirectory(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await get<FileSystemDirectoryHandle>(HANDLE_KEY);
  if (!handle) return null;
  const opts = { mode: 'readwrite' } as const;
  if ((await handle.queryPermission(opts)) === 'granted') return handle;
  if ((await handle.requestPermission(opts)) === 'granted') return handle;
  return null;
}
