import { migrateSave } from './migrations.js';
import type { SaveGame } from './types.js';

/** Downloadable backup file ("sikkerhedskopi") a kid or parent can keep. */
export interface BackupFile {
  kind: 'kanel-og-groenskollingen-backup';
  exportedAt: string;
  rejsekode: string | null;
  save: SaveGame;
}

export function createBackup(
  save: SaveGame,
  rejsekode: string | null,
  now = new Date(),
): BackupFile {
  return {
    kind: 'kanel-og-groenskollingen-backup',
    exportedAt: now.toISOString(),
    rejsekode,
    save,
  };
}

/** Parses a backup file's text, migrating old saves. Throws a Danish message on bad input. */
export function readBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Filen er ikke en gyldig sikkerhedskopi');
  }
  const d = data as Partial<BackupFile>;
  if (d?.kind !== 'kanel-og-groenskollingen-backup' || !d.save) {
    throw new Error('Filen er ikke en sikkerhedskopi fra Kanel og Grønskollingen');
  }
  return {
    kind: d.kind,
    exportedAt: String(d.exportedAt ?? ''),
    rejsekode: typeof d.rejsekode === 'string' ? d.rejsekode : null,
    save: migrateSave(d.save),
  };
}
