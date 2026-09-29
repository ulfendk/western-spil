import { describe, expect, it } from 'vitest';
import { doneness } from './doneness.js';

describe('frying', () => {
  it('rewards a perfect egg or strip, and punishes raw and burnt', () => {
    expect(doneness(0.3)).toEqual({ points: 1, label: 'Rå!' });
    expect(doneness(0.75).points).toBe(2);
    expect(doneness(1).points).toBe(3);
    expect(doneness(1.25).points).toBe(3);
    expect(doneness(1.4).points).toBe(2);
    expect(doneness(2)).toEqual({ points: 1, label: 'Brændt!' });
  });
});
