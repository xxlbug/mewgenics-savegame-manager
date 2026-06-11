export async function readFileBytes(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<Uint8Array> {
  const fh = await dir.getFileHandle(name);
  const file = await fh.getFile();
  return new Uint8Array(await file.arrayBuffer());
}

/** Full-file atomic write: changes only become visible on close(). */
export async function writeFileBytes(
  dir: FileSystemDirectoryHandle,
  name: string,
  bytes: Uint8Array,
): Promise<void> {
  const fh = await dir.getFileHandle(name, { create: true });
  const writable = await fh.createWritable();
  // Uint8Array.buffer is typed as ArrayBufferLike (may be SharedArrayBuffer),
  // but FileSystemWritableFileStream.write() only accepts ArrayBuffer.
  // In practice this is always a plain ArrayBuffer; the cast is safe.
  await writable.write(bytes.buffer as ArrayBuffer);
  await writable.close();
}

export async function writeFileText(
  dir: FileSystemDirectoryHandle,
  name: string,
  text: string,
): Promise<void> {
  await writeFileBytes(dir, name, new TextEncoder().encode(text));
}

export async function readFileText(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<string> {
  return new TextDecoder().decode(await readFileBytes(dir, name));
}

export async function listFileNames(
  dir: FileSystemDirectoryHandle,
): Promise<string[]> {
  const names: string[] = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'file') names.push(name);
  }
  return names;
}

export async function getOrCreateDir(
  parent: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemDirectoryHandle> {
  return parent.getDirectoryHandle(name, { create: true });
}

export async function getDirIfExists(
  parent: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await parent.getDirectoryHandle(name);
  } catch {
    return null;
  }
}

export async function fileLastModified(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<number> {
  const fh = await dir.getFileHandle(name);
  return (await fh.getFile()).lastModified;
}
