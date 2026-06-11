import { invoke } from '@tauri-apps/api/core';

export interface FileInfo {
  name: string;
  modifiedMs: number;
}

function joinPath(dir: string, name: string): string {
  return `${dir.replace(/[\\/]+$/, '')}/${name}`;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function readFileBytes(dir: string, name: string): Promise<Uint8Array> {
  return base64ToBytes(await invoke<string>('read_file', { path: joinPath(dir, name) }));
}

export async function writeFileBytes(dir: string, name: string, bytes: Uint8Array): Promise<void> {
  await invoke('write_file', { path: joinPath(dir, name), dataB64: bytesToBase64(bytes) });
}

export async function writeFileText(dir: string, name: string, text: string): Promise<void> {
  await writeFileBytes(dir, name, new TextEncoder().encode(text));
}

export async function readFileText(dir: string, name: string): Promise<string> {
  return new TextDecoder().decode(await readFileBytes(dir, name));
}

export async function listFiles(dir: string): Promise<FileInfo[]> {
  return invoke<FileInfo[]>('list_files', { dir });
}

export async function listFileNames(dir: string): Promise<string[]> {
  return (await listFiles(dir)).map((f) => f.name);
}

export async function getOrCreateDir(parent: string, name: string): Promise<string> {
  const path = joinPath(parent, name);
  await invoke('create_dir', { path });
  return path;
}

export async function getDirIfExists(parent: string, name: string): Promise<string | null> {
  const path = joinPath(parent, name);
  return (await invoke<boolean>('path_exists', { path })) ? path : null;
}

export async function fileLastModified(dir: string, name: string): Promise<number> {
  const files = await listFiles(dir);
  const f = files.find((x) => x.name === name);
  return f?.modifiedMs ?? 0;
}
