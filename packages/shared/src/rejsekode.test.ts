import { describe, expect, it } from 'vitest';
import { generateRejsekode, normalizeRejsekode, REJSEKODE_WORDS } from './rejsekode.js';

describe('rejsekode', () => {
  it('has 64 unique words', () => {
    expect(new Set(REJSEKODE_WORDS).size).toBe(64);
  });

  it('round-trips generated codes and tolerates sloppy input', () => {
    const code = generateRejsekode((max) => Math.floor(Math.random() * max));
    expect(normalizeRejsekode(code)).toBe(code);
    expect(normalizeRejsekode('  Hest KAKTUS, sadel lasso vogn tog ')).toBe(
      'hest-kaktus-sadel-lasso-vogn-tog',
    );
  });

  it('rejects wrong length or unknown words', () => {
    expect(normalizeRejsekode('hest kaktus')).toBeNull();
    expect(normalizeRejsekode('hest kaktus sadel lasso vogn pizza')).toBeNull();
  });
});
