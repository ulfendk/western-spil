export const SAVE_SCHEMA_VERSION = 1;

export interface SaveGame {
  schemaVersion: number;
  nickname: string;
  hat: number;
  chapter: number;
  dollars: number;
  stars: number;
}

export function newSave(nickname: string): SaveGame {
  return { schemaVersion: SAVE_SCHEMA_VERSION, nickname, hat: 0, chapter: 1, dollars: 0, stars: 0 };
}
