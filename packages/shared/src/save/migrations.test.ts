import { describe, expect, it } from 'vitest';
import { migrateSave, validateSave } from './migrations.js';
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

describe('save v1 -> v2', () => {
  it('adds story progress to old saves', () => {
    const v1 = { schemaVersion: 1, nickname: 'Seje Ida', hat: 0, chapter: 1, dollars: 5, stars: 0 };
    expect(migrateSave(v1).progress).toEqual({ steps: { k1: 'intro' }, flags: [] });
  });

  it('rejects junk progress from clients', () => {
    const save = { ...newSave('Seje Ida'), progress: { steps: { k1: '<script>' }, flags: [] } };
    expect(() => validateSave(save)).toThrow(/Ugyldig/);
  });
});

describe('save v2 -> v3', () => {
  it('renames non-Danish nickname adjectives', () => {
    const v2 = { ...newSave('x'), schemaVersion: 2, nickname: 'Snilde Ida' };
    expect(migrateSave(v2).nickname).toBe('Flinke Ida');
  });
});

describe('save v3 -> v4', () => {
  it('moves the chapter step into steps.k1 and starts in St. Louis', () => {
    const v3 = {
      schemaVersion: 3,
      nickname: 'Seje Ida',
      hat: 0,
      chapter: 2,
      dollars: 15,
      stars: 2,
      progress: { step: 'done', flags: ['k1-klaret'] },
    };
    const save = migrateSave(v3);
    expect(save.progress).toEqual({ steps: { k1: 'done' }, flags: ['k1-klaret'] });
    expect(save.region).toBe('st-louis');
  });

  it('rejects unknown regions', () => {
    expect(() => validateSave({ ...newSave('Seje Ida'), region: 'mars' })).toThrow(/Ugyldig/);
  });
});
