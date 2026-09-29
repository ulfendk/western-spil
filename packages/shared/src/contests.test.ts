import { describe, expect, it } from 'vitest';
import {
  CANS,
  CONTESTS,
  canHitPoints,
  canSchedule,
  contestReward,
  isContestEvent,
  pickPosters,
  plausibleProgress,
  POSTERS,
  RACE,
  raceBarrels,
} from './contests.js';

describe('tin cans', () => {
  it('is the same schedule for everyone with the same seed', () => {
    expect(canSchedule(42)).toEqual(canSchedule(42));
    expect(canSchedule(42)).not.toEqual(canSchedule(43));
  });

  it('gives a busy but fair game: cans spread over the time, never two in one slot', () => {
    const cans = canSchedule(7);
    expect(cans.length).toBeGreaterThan(30);
    expect(cans.length).toBeLessThan(70);
    expect(cans.at(-1)!.appear).toBeLessThan(CONTESTS.daaser.seconds);
    for (const a of cans) {
      expect(a.slot).toBeGreaterThanOrEqual(0);
      expect(a.slot).toBeLessThan(CANS.slots);
      for (const b of cans) {
        if (a === b || a.slot !== b.slot) continue;
        const overlap = a.appear < b.appear + b.stay && b.appear < a.appear + a.stay;
        expect(overlap).toBe(false);
      }
    }
  });

  it('only scores a can while it is up', () => {
    const cans = canSchedule(1);
    const can = cans[3]!;
    const worth = can.gold ? CANS.goldPoints : 1;
    expect(canHitPoints(cans, 3, can.appear + 0.1)).toBe(worth);
    expect(canHitPoints(cans, 3, can.appear - 1)).toBe(0);
    expect(canHitPoints(cans, 3, can.appear + can.stay + 1)).toBe(0);
    expect(canHitPoints(cans, 999, 1)).toBe(0);
    expect(canHitPoints(cans, 3, Number.NaN)).toBe(0);
  });
});

describe('horse race', () => {
  it('places the barrels on the track, in order', () => {
    const barrels = raceBarrels(5);
    expect(barrels).toHaveLength(RACE.barrels);
    expect(barrels[0]!).toBeGreaterThan(20);
    expect(barrels.at(-1)!).toBeLessThan(RACE.length);
    expect([...barrels].sort((a, b) => a - b)).toEqual(barrels);
  });

  it('rejects progress faster than a horse can gallop', () => {
    expect(plausibleProgress(0, 10, 1)).toBe(true);
    expect(plausibleProgress(0, RACE.maxSpeed * 2 + RACE.slack + 1, 2)).toBe(false);
    expect(plausibleProgress(50, 40, 1)).toBe(false);
    expect(plausibleProgress(0, Number.POSITIVE_INFINITY, 100)).toBe(false);
  });
});

describe('wanted posters', () => {
  it('picks distinct poster places, the same for everyone', () => {
    const picked = pickPosters(9, 14);
    expect(picked).toHaveLength(POSTERS.count);
    expect(new Set(picked).size).toBe(POSTERS.count);
    expect(picked.every((i) => i >= 0 && i < 14)).toBe(true);
    expect(pickPosters(9, 14)).toEqual(picked);
    expect(pickPosters(9, 4)).toHaveLength(4);
  });
});

describe('events and rewards', () => {
  it('only accepts well-formed events', () => {
    expect(isContestEvent({ type: 'hit', id: 1, t: 2.5 })).toBe(true);
    expect(isContestEvent({ type: 'progress', d: 12 })).toBe(true);
    expect(isContestEvent({ type: 'found', poster: 2 })).toBe(true);
    expect(isContestEvent({ type: 'found', poster: 2.5 })).toBe(false);
    expect(isContestEvent({ type: 'hit', id: '1', t: 2 })).toBe(false);
    expect(isContestEvent({ type: 'cheat' })).toBe(false);
    expect(isContestEvent(null)).toBe(false);
  });

  it('pays the multiplayer winner most, and a good solo score a bit more', () => {
    expect(contestReward('daaser', 3, true, 3)).toBe(5);
    expect(contestReward('daaser', 30, false, 3)).toBe(2);
    expect(contestReward('daaser', 25, true, 1)).toBe(4);
    expect(contestReward('daaser', 5, true, 1)).toBe(2);
  });
});
