import { describe, expect, it } from 'vitest';
import { isValidNickname, randomNickname } from './nicknames.js';

describe('nicknames', () => {
  it('generates names the server accepts', () => {
    for (let i = 0; i < 50; i++) expect(isValidNickname(randomNickname())).toBe(true);
  });

  it('rejects free text', () => {
    expect(isValidNickname('Anders Andersen')).toBe(false);
  });
});
