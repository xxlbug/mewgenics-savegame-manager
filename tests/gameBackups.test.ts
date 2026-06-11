import { describe, it, expect } from 'vitest';
import { parseBackupFileName } from '../src/backups/gameBackups';

describe('parseBackupFileName', () => {
  it('parses save name and local timestamp', () => {
    const b = parseBackupFileName('steamcampaign01_2026-06-11_16-05.savbackup');
    expect(b).not.toBeNull();
    expect(b!.saveName).toBe('steamcampaign01');
    expect(b!.timestamp).toEqual(new Date(2026, 5, 11, 16, 5));
  });

  it('returns null for non-backup files', () => {
    expect(parseBackupFileName('steam_autocloud.vdf')).toBeNull();
    expect(parseBackupFileName('whatever.savbackup')).toBeNull();
  });
});
