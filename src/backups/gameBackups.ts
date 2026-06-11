export interface GameBackup {
  fileName: string;
  saveName: string;
  timestamp: Date;
}

const PATTERN = /^(.+)_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})\.savbackup$/;

/** Parse `<save>_<YYYY-MM-DD>_<HH-MM>.savbackup`; null if not a backup. */
export function parseBackupFileName(fileName: string): GameBackup | null {
  const m = PATTERN.exec(fileName);
  if (!m) return null;
  const [, saveName, y, mo, d, h, mi] = m;
  return {
    fileName,
    saveName: saveName!,
    timestamp: new Date(+y!, +mo! - 1, +d!, +h!, +mi!),
  };
}
