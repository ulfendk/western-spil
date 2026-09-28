import { backup, DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomInt } from 'node:crypto';
import { generateRejsekode, type SaveGame } from '@western/shared';
import { config } from './config.js';

const BACKUP_KEEP = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

mkdirSync(config.dataDir, { recursive: true });
const dbPath = join(config.dataDir, 'western.db');
export const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS saves (
    code TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const insertStmt = db.prepare('INSERT INTO saves (code, data) VALUES (?, ?)');
const getStmt = db.prepare('SELECT data FROM saves WHERE code = ?');
const updateStmt = db.prepare(
  "UPDATE saves SET data = ?, updated_at = datetime('now') WHERE code = ?",
);

/** Stores a new save and returns its freshly generated rejsekode. */
export function createSave(save: SaveGame): string {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateRejsekode(randomInt);
    try {
      insertStmt.run(code, JSON.stringify(save));
      return code;
    } catch {
      // Extremely unlikely collision: try another code.
    }
  }
  throw new Error('Could not allocate rejsekode');
}

export function getSave(code: string): unknown {
  const row = getStmt.get(code) as { data: string } | undefined;
  return row ? JSON.parse(row.data) : undefined;
}

export function updateSave(code: string, save: SaveGame): boolean {
  return updateStmt.run(JSON.stringify(save), code).changes > 0;
}

/**
 * Online SQLite backup into <data>/backups, one file per day, keeping the newest 14.
 * The whole /data volume can additionally be backed up by the host (see docs/deploy.md).
 */
export async function backupDatabase(now = new Date()): Promise<string> {
  const dir = join(config.dataDir, 'backups');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `western-${now.toISOString().slice(0, 10)}.db`);
  await backup(db, file);
  const old = readdirSync(dir)
    .filter((f) => /^western-\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .sort()
    .slice(0, -BACKUP_KEEP);
  for (const f of old) rmSync(join(dir, f), { force: true });
  return file;
}

export function scheduleBackups() {
  const run = () =>
    backupDatabase()
      .then((file) => console.log(`[db] backup written: ${file}`))
      .catch((err) => console.error('[db] backup failed', err));
  void run();
  setInterval(run, DAY_MS).unref();
}
