import { RENAMED_ADJECTIVES } from '../nicknames.js';
import { SAVE_SCHEMA_VERSION, type SaveGame } from './types.js';

type AnySave = Record<string, unknown> & { schemaVersion?: number };

/**
 * Forward migrations: MIGRATIONS[n] upgrades a save from version n to n+1.
 * Add an entry here whenever SaveGame changes and bump SAVE_SCHEMA_VERSION.
 */
const MIGRATIONS: Record<number, (save: AnySave) => AnySave> = {
  // v2: story progress within the chapter.
  1: (save) => ({ ...save, progress: { step: 'intro', flags: [] } }),
  // v3: nicknames with a non-Danish adjective get the Danish replacement.
  2: (save) => {
    const [adj, ...rest] = String(save.nickname ?? '').split(' ');
    const renamed = adj && RENAMED_ADJECTIVES[adj];
    return renamed ? { ...save, nickname: [renamed, ...rest].join(' ') } : save;
  },
};

export function migrateSave(raw: unknown): SaveGame {
  if (typeof raw !== 'object' || raw === null) throw new Error('Invalid save');
  let save = { ...(raw as AnySave) };
  let version = typeof save.schemaVersion === 'number' ? save.schemaVersion : 1;
  if (version > SAVE_SCHEMA_VERSION) throw new Error('Save is from a newer game version');
  while (version < SAVE_SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new Error(`No migration from save version ${version}`);
    save = step(save);
    version += 1;
  }
  return { ...save, schemaVersion: SAVE_SCHEMA_VERSION } as unknown as SaveGame;
}

/** Migrates and sanity-checks a save received from an untrusted client. */
export function validateSave(raw: unknown): SaveGame {
  const save = migrateSave(raw);
  const int = (v: unknown, max: number) =>
    typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;
  if (
    typeof save.nickname !== 'string' ||
    save.nickname.length > 40 ||
    !int(save.hat, 255) ||
    !int(save.chapter, 99) ||
    !int(save.dollars, 1_000_000) ||
    !int(save.stars, 10_000) ||
    !validProgress(save.progress)
  ) {
    throw new Error('Ugyldig spilfil');
  }
  return {
    schemaVersion: save.schemaVersion,
    nickname: save.nickname,
    hat: save.hat,
    chapter: save.chapter,
    dollars: save.dollars,
    stars: save.stars,
    progress: { step: save.progress.step, flags: [...new Set(save.progress.flags)] },
  };
}

const TOKEN = /^[a-z0-9-]{1,40}$/;

function validProgress(p: unknown): p is SaveGame['progress'] {
  if (typeof p !== 'object' || p === null) return false;
  const { step, flags } = p as Record<string, unknown>;
  return (
    typeof step === 'string' &&
    TOKEN.test(step) &&
    Array.isArray(flags) &&
    flags.length <= 100 &&
    flags.every((f) => typeof f === 'string' && TOKEN.test(f))
  );
}
