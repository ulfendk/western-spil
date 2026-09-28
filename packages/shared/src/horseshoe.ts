/**
 * Horseshoe toss ("hestesko"): rules and throw physics, shared by the server
 * (which decides every result) and the client (which animates it).
 *
 * Pit-local coordinates: the throw line is at z = 0, the stake at z = PIT_LENGTH,
 * x is sideways (positive to the thrower's right).
 */
export const HORSESHOE = {
  pitLength: 12,
  rounds: 3,
  throwsPerTurn: 2,
  maxPlayers: 4,
  /** Seconds a player may take before their turn is skipped. */
  turnTimeout: 45,
  /** Aim limits in radians left/right of the stake. */
  maxAim: 0.35,
} as const;

export interface ThrowInput {
  /** 0..1 from the power meter. */
  power: number;
  /** Radians, negative = left. */
  aim: number;
}

export type ThrowLabel = 'ringer' | 'taet' | 'naer' | 'forbi';

export interface ThrowResult {
  x: number;
  z: number;
  points: number;
  label: ThrowLabel;
}

export function isValidThrow(input: unknown): input is ThrowInput {
  const t = input as Partial<ThrowInput> | null;
  return (
    typeof t?.power === 'number' &&
    typeof t.aim === 'number' &&
    Number.isFinite(t.power) &&
    Number.isFinite(t.aim) &&
    t.power >= 0 &&
    t.power <= 1 &&
    Math.abs(t.aim) <= HORSESHOE.maxAim
  );
}

/** How far a throw with this much power flies (before wobble). */
export function throwDistance(power: number): number {
  return 3 + power * 14;
}

/**
 * Where the horseshoe lands and how many points it scores. `rand` returns 0..1;
 * the server uses Math.random, tests pass a fixed sequence.
 */
export function resolveThrow(input: ThrowInput, rand: () => number): ThrowResult {
  const distance = throwDistance(input.power);
  // A little wobble so even a perfect meter isn't a guaranteed ringer.
  const wobbleForward = (rand() + rand() - 1) * 0.45;
  const wobbleSide = (rand() + rand() - 1) * 0.3;
  const x = Math.sin(input.aim) * distance + wobbleSide;
  const z = Math.cos(input.aim) * distance + wobbleForward;
  const d = Math.hypot(x, z - HORSESHOE.pitLength);
  if (d < 0.35) return { x, z, points: 3, label: 'ringer' };
  if (d < 1) return { x, z, points: 2, label: 'taet' };
  if (d < 2) return { x, z, points: 1, label: 'naer' };
  return { x, z, points: 0, label: 'forbi' };
}
