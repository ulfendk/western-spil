import { describe, expect, it } from 'vitest';
import { HORSESHOE, isValidThrow, resolveThrow, throwDistance } from './horseshoe.js';

const noWobble = () => 0.5;

describe('horseshoe', () => {
  it('scores a ringer for a perfect throw', () => {
    const perfect = (HORSESHOE.pitLength - 3) / 14;
    expect(throwDistance(perfect)).toBeCloseTo(HORSESHOE.pitLength);
    expect(resolveThrow({ power: perfect, aim: 0 }, noWobble)).toMatchObject({
      points: 3,
      label: 'ringer',
    });
  });

  it('scores less the further from the stake it lands', () => {
    expect(resolveThrow({ power: 0.7, aim: 0 }, noWobble).points).toBe(2); // ~0.8 m long
    expect(resolveThrow({ power: 0.74, aim: 0 }, noWobble).points).toBe(1); // ~1.4 m long
    expect(resolveThrow({ power: 0.2, aim: 0 }, noWobble)).toMatchObject({
      points: 0,
      label: 'forbi',
    });
    expect(resolveThrow({ power: 0.643, aim: 0.3 }, noWobble).points).toBe(0);
  });

  it('rejects impossible input from tampered clients', () => {
    expect(isValidThrow({ power: 0.5, aim: 0 })).toBe(true);
    expect(isValidThrow({ power: 2, aim: 0 })).toBe(false);
    expect(isValidThrow({ power: 0.5, aim: 1 })).toBe(false);
    expect(isValidThrow({ power: Number.NaN, aim: 0 })).toBe(false);
    expect(isValidThrow(null)).toBe(false);
  });
});
