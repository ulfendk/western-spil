import type { RegionId } from '../regions.js';

export const SAVE_SCHEMA_VERSION = 4;

/** Where the player is in the story. */
export interface StoryProgress {
  /** Current quest step per chapter, e.g. { k1: "done", k2: "repair" }. */
  steps: Record<string, string>;
  /** Choices made and things done ("spurgte-om-broedrene", "pakket-hurtigt"). */
  flags: string[];
}

export interface SaveGame {
  schemaVersion: number;
  nickname: string;
  hat: number;
  chapter: number;
  dollars: number;
  stars: number;
  progress: StoryProgress;
  /** The region the player is currently in. */
  region: RegionId;
}

export function newSave(nickname: string): SaveGame {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    nickname,
    hat: 0,
    chapter: 1,
    dollars: 0,
    stars: 0,
    progress: { steps: {}, flags: [] },
    region: 'st-louis',
  };
}
