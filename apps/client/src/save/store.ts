import {
  createBackup,
  migrateSave,
  newSave,
  normalizeRejsekode,
  randomNickname,
  readBackup,
  type SaveGame,
} from '@western/shared';

const SAVE_KEY = 'kanel.save';
const CODE_KEY = 'kanel.rejsekode';

/**
 * Progress lives in three places so kids don't lose it:
 *  1. localStorage (instant, offline)
 *  2. the server, keyed by a 6-word "rejsekode" (survives cleared browsers / new devices)
 *  3. a downloadable backup file (sikkerhedskopi)
 */
class SaveStore {
  save: SaveGame;
  rejsekode: string | null;
  private syncTimer: number | undefined;
  private listeners = new Set<() => void>();

  constructor() {
    this.save = loadLocal() ?? newSave(randomNickname());
    this.rejsekode = safeGet(CODE_KEY);
    this.persistLocal();
    void navigator.storage?.persist?.().catch(() => undefined);
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  update(patch: Partial<SaveGame>) {
    this.save = { ...this.save, ...patch };
    this.persistLocal();
    this.scheduleSync();
    this.emit();
  }

  /** Pushes the save to the server, allocating a rejsekode the first time. */
  async sync(): Promise<void> {
    try {
      if (!this.rejsekode) {
        const res = await fetch('/api/saves', jsonInit('POST', this.save));
        if (!res.ok) return;
        const { rejsekode } = (await res.json()) as { rejsekode: string };
        this.rejsekode = rejsekode;
        safeSet(CODE_KEY, rejsekode);
        this.emit();
      } else {
        const res = await fetch(
          `/api/saves/${encodeURIComponent(this.rejsekode)}`,
          jsonInit('PUT', this.save),
        );
        // The server lost this code (e.g. fresh volume): re-register the save.
        if (res.status === 404) {
          this.rejsekode = null;
          safeRemove(CODE_KEY);
          await this.sync();
        }
      }
    } catch {
      // Offline: localStorage still has everything; we'll retry on the next change.
    }
  }

  /** Restores progress from a rejsekode typed in by the player. Throws a Danish message. */
  async restoreFromCode(input: string): Promise<void> {
    const code = normalizeRejsekode(input);
    if (!code) throw new Error('En rejsekode er 6 ord, fx "hest kaktus sadel lasso vogn tog"');
    const res = await fetch(`/api/saves/${encodeURIComponent(code)}`).catch(() => null);
    if (!res) throw new Error('Kan ikke nå serveren – er du på nettet?');
    const body = (await res.json().catch(() => ({}))) as { save?: unknown; error?: string };
    if (!res.ok || !body.save) throw new Error(body.error ?? 'Rejsekoden findes ikke');
    this.replace(migrateSave(body.save), code);
  }

  downloadBackup() {
    const backup = createBackup(this.save, this.rejsekode);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const safeName = this.save.nickname.toLowerCase().replace(/[^a-zæøå0-9]+/g, '-');
    a.download = `kanel-sikkerhedskopi-${safeName}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async restoreFromFile(file: File): Promise<void> {
    const backup = readBackup(await file.text());
    this.replace(backup.save, backup.rejsekode);
    await this.sync();
  }

  private replace(save: SaveGame, code: string | null) {
    this.save = save;
    this.rejsekode = code;
    if (code) safeSet(CODE_KEY, code);
    else safeRemove(CODE_KEY);
    this.persistLocal();
    this.emit();
  }

  private scheduleSync() {
    clearTimeout(this.syncTimer);
    this.syncTimer = window.setTimeout(() => void this.sync(), 2000);
  }

  private persistLocal() {
    safeSet(SAVE_KEY, JSON.stringify(this.save));
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }
}

function loadLocal(): SaveGame | null {
  const raw = safeGet(SAVE_KEY);
  if (!raw) return null;
  try {
    return migrateSave(JSON.parse(raw));
  } catch {
    return null;
  }
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode) */
  }
}
function safeRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const store = new SaveStore();
