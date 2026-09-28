import { describe, expect, it } from 'vitest';
import { createBackup, readBackup } from './backup.js';
import { newSave } from './types.js';

describe('backup files', () => {
  it('round-trips', () => {
    const backup = createBackup(newSave('Seje Ida'), 'hest-hest-hest-hest-hest-hest');
    expect(readBackup(JSON.stringify(backup))).toEqual(backup);
  });

  it('rejects other files with a Danish message', () => {
    expect(() => readBackup('{"foo":1}')).toThrow(/sikkerhedskopi/);
    expect(() => readBackup('not json')).toThrow(/gyldig/);
  });
});
