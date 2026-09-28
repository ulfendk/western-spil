export const SAVE_SCHEMA_VERSION = 3;

/** Where the player is in the story. */
export interface StoryProgress {
  /** Current quest step within the chapter, e.g. "find-pind". */
  step: string;
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
}

export function newSave(nickname: string): SaveGame {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    nickname,
    hat: 0,
    chapter: 1,
    dollars: 0,
    stars: 0,
    progress: { step: 'intro', flags: [] },
  };
}
