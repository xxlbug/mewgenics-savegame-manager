import type { SaveSummary } from '../save/summary';

export interface OwnBackupEntry {
  fileName: string;
  label: string;
  createdAt: string; // ISO date
  stats?: SaveSummary;
}

export interface Manifest {
  backups: OwnBackupEntry[];
}

export const MANIFEST_NAME = 'manifest.json';
export const BACKUP_DIR_NAME = 'manager_backups';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function timestampPart(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  );
}

export function makeBackupFileName(label: string, date: Date): string {
  const safe =
    label
      .trim()
      .replace(/[^a-zA-Z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'backup';
  return `${safe}_${timestampPart(date)}.sav`;
}

const FILE_PATTERN =
  /^(.+)_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.sav$/;

export function parseOwnBackupFileName(
  fileName: string,
): Omit<OwnBackupEntry, 'stats'> | null {
  const m = FILE_PATTERN.exec(fileName);
  if (!m) return null;
  const [, label, y, mo, d, h, mi, s] = m;
  return {
    fileName,
    label: label!,
    createdAt: new Date(+y!, +mo! - 1, +d!, +h!, +mi!, +s!).toISOString(),
  };
}

/** Tolerant parse: corrupt or shapeless JSON yields an empty manifest. */
export function parseManifest(json: string): Manifest {
  try {
    const data: unknown = JSON.parse(json);
    if (
      typeof data === 'object' &&
      data !== null &&
      Array.isArray((data as Manifest).backups)
    ) {
      return { backups: (data as Manifest).backups };
    }
  } catch {
    // fall through
  }
  return { backups: [] };
}

/** Rebuild manifest from directory listing when manifest.json is lost. */
export function rebuildManifest(fileNames: string[]): Manifest {
  const backups: OwnBackupEntry[] = [];
  for (const name of fileNames) {
    const entry = parseOwnBackupFileName(name);
    if (entry) backups.push(entry);
  }
  backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { backups };
}
