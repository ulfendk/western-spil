import { describe, expect, it } from 'vitest';
import { migrateSave } from './migrations.js';
import { newSave, SAVE_SCHEMA_VERSION } from './types.js';

describe('migrateSave', () => {
  it('passes current saves through', () => {
    const save = newSave('Modige Maja');
    expect(migrateSave(save)).toEqual(save);
  });

  it('rejects saves from the future', () => {
    expect(() => migrateSave({ schemaVersion: SAVE_SCHEMA_VERSION + 1 })).toThrow(/newer/);
  });
});
