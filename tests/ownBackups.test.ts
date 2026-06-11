import { describe, it, expect } from 'vitest';
import {
  makeBackupFileName,
  parseManifest,
  parseOwnBackupFileName,
  rebuildManifest,
} from '../src/backups/ownBackups';

describe('makeBackupFileName', () => {
  it('sanitizes the label and appends a timestamp', () => {
    const d = new Date(2026, 5, 11, 16, 5, 30);
    expect(makeBackupFileName('before risky run!', d)).toBe(
      'before-risky-run_2026-06-11_16-05-30.sav',
    );
  });
});

describe('parseOwnBackupFileName', () => {
  it('recovers label and timestamp', () => {
    const r = parseOwnBackupFileName('before-risky-run_2026-06-11_16-05-30.sav');
    expect(r).toEqual({
      fileName: 'before-risky-run_2026-06-11_16-05-30.sav',
      label: 'before-risky-run',
      createdAt: new Date(2026, 5, 11, 16, 5, 30).toISOString(),
    });
  });

  it('returns null for foreign files', () => {
    expect(parseOwnBackupFileName('manifest.json')).toBeNull();
  });
});

describe('parseManifest', () => {
  it('parses valid manifest JSON', () => {
    const m = parseManifest(
      '{"backups":[{"fileName":"a_2026-01-01_00-00-00.sav","label":"a","createdAt":"2026-01-01T00:00:00.000Z"}]}',
    );
    expect(m.backups).toHaveLength(1);
    expect(m.backups[0]!.label).toBe('a');
  });

  it('returns empty manifest for corrupt JSON', () => {
    expect(parseManifest('{oops')).toEqual({ backups: [] });
    expect(parseManifest('null')).toEqual({ backups: [] });
  });
});

describe('rebuildManifest', () => {
  it('reconstructs entries from filenames, ignoring foreign files', () => {
    const m = rebuildManifest([
      'before-risky-run_2026-06-11_16-05-30.sav',
      'manifest.json',
      'random.txt',
    ]);
    expect(m.backups).toHaveLength(1);
    expect(m.backups[0]!.label).toBe('before-risky-run');
  });
});
