/**
 * Town contests ("kappestrid"): 1–4 players play the same challenge at the same
 * time. These rules are shared by the server (which checks every event and keeps
 * the score) and the client (which draws the game). Everything random comes from
 * the room's seed, so all players get the same cans, barrels and posters.
 */
export const ROOM_CONTEST = 'kappestrid';

export const CONTEST_KINDS = ['daaser', 'loeb', 'plakater'] as const;
export type ContestKind = (typeof CONTEST_KINDS)[number];

export const CONTESTS: Record<ContestKind, { name: string; seconds: number }> = {
  daaser: { name: 'Dåseskydning', seconds: 30 },
  loeb: { name: 'Hestevæddeløb', seconds: 60 },
  plakater: { name: 'Efterlyst!', seconds: 90 },
};

export const CONTEST_MAX_PLAYERS = 4;
/** "3, 2, 1 …" before the game begins. */
export const CONTEST_COUNTDOWN = 3;
/** How far a client's clock may be from the server's (network delay), in seconds. */
export const CLOCK_SLACK = 1.5;

export function isContestKind(kind: unknown): kind is ContestKind {
  return typeof kind === 'string' && (CONTEST_KINDS as readonly string[]).includes(kind);
}

/** Small seeded random numbers (mulberry32), identical on server and client. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Dåseskydning: cans pop up on a fence; hit them while they're up.

export const CANS = {
  /** Places on the fence, left to right. */
  slots: 8,
  /** A gold can is worth this much; a normal one 1. */
  goldPoints: 3,
  /** Accepted this long before/after a can is up (the throw is in the air). */
  tolerance: 0.25,
} as const;

export interface CanTarget {
  id: number;
  slot: number;
  /** Seconds after the start when the can pops up, and how long it stays. */
  appear: number;
  stay: number;
  gold: boolean;
}

/** The cans of one game: faster and shorter-lived as time goes on. */
export function canSchedule(seed: number): CanTarget[] {
  const rand = seededRandom(seed);
  const cans: CanTarget[] = [];
  const busyUntil = new Array<number>(CANS.slots).fill(0);
  const end = CONTESTS.daaser.seconds - 0.5;
  for (let t = 0.8, id = 0; t < end; id++) {
    const progress = t / end;
    const stay = 2.2 - progress * 1.1 + rand() * 0.4;
    // A free slot (never two cans in the same place at once).
    let slot = Math.floor(rand() * CANS.slots);
    for (let k = 0; k < CANS.slots && busyUntil[slot]! > t; k++) slot = (slot + 1) % CANS.slots;
    if (busyUntil[slot]! <= t) {
      busyUntil[slot] = t + stay + 0.3;
      cans.push({ id, slot, appear: t, stay, gold: rand() < 0.12 });
    }
    t += 0.75 - progress * 0.35 + rand() * 0.3;
  }
  return cans;
}

/** Points for hitting can `id` at time `t` (0 if it wasn't up then). */
export function canHitPoints(cans: readonly CanTarget[], id: number, t: number): number {
  const can = cans[id];
  if (!can || !Number.isFinite(t)) return 0;
  if (t < can.appear - CANS.tolerance || t > can.appear + can.stay + CANS.tolerance) return 0;
  return can.gold ? CANS.goldPoints : 1;
}

// ---------------------------------------------------------------------------
// Hestevæddeløb: gallop down the track, jump the barrels.

export const RACE = {
  /** Metres to the finish line. */
  length: 400,
  /** Top speed in m/s (a perfect gallop). */
  maxSpeed: 12,
  /** Extra metres the server allows per progress report (rounding, delay). */
  slack: 3,
  barrels: 9,
} as const;

/** Where the barrels stand (the same in every lane). */
export function raceBarrels(seed: number): number[] {
  const rand = seededRandom(seed ^ 0x5eed);
  const gap = (RACE.length - 80) / RACE.barrels;
  return Array.from({ length: RACE.barrels }, (_, i) => 50 + i * gap + rand() * gap * 0.5);
}

/** Could a horse have got from `prev` to `next` metres in `seconds`? */
export function plausibleProgress(prev: number, next: number, seconds: number): boolean {
  if (!Number.isFinite(next) || next < prev) return false;
  return next - prev <= RACE.maxSpeed * Math.max(0, seconds) + RACE.slack;
}

// ---------------------------------------------------------------------------
// Efterlyst!: wanted posters hidden around the town.

export const POSTERS = {
  count: 6,
  /** Quicker than this between two finds is not a real walk. */
  minGap: 1,
} as const;

/**
 * Which of the town's poster places are used this game: `count` distinct indices
 * into the client's list of `candidates` places (fewer if the town is small).
 */
export function pickPosters(seed: number, candidates: number): number[] {
  const rand = seededRandom(seed ^ 0x9057e4);
  const all = Array.from({ length: candidates }, (_, i) => i);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [all[i], all[j]] = [all[j]!, all[i]!];
  }
  return all.slice(0, Math.min(POSTERS.count, candidates));
}

// ---------------------------------------------------------------------------
// Messages from the client during a game.

export type ContestEvent =
  | { type: 'hit'; id: number; t: number }
  | { type: 'progress'; d: number }
  | { type: 'found'; poster: number };

export function isContestEvent(e: unknown): e is ContestEvent {
  const ev = e as Record<string, unknown> | null;
  if (!ev || typeof ev !== 'object') return false;
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  switch (ev.type) {
    case 'hit':
      return num(ev.id) && num(ev.t);
    case 'progress':
      return num(ev.d);
    case 'found':
      return num(ev.poster) && Number.isInteger(ev.poster);
    default:
      return false;
  }
}

/** Reward in dollars: the winner of a multiplayer game, or a good solo score, earns more. */
export function contestReward(
  kind: ContestKind,
  score: number,
  won: boolean,
  players: number,
): number {
  if (players > 1) return won ? 5 : 2;
  const par = kind === 'daaser' ? 20 : kind === 'loeb' ? 1 : 5;
  return score >= par ? 4 : 2;
}
