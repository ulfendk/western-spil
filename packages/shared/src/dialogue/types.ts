export type SpeakerId = 'fortaeller' | 'kanel' | 'pind' | 'spiller';

export interface Speaker {
  name: string;
  /** Piper speaker settings; lets characters sound slightly different. */
  lengthScale?: number;
}

export interface DialogueLine {
  id: string;
  speaker: SpeakerId;
  text: string;
}

export interface DialogueScript {
  id: string;
  lines: DialogueLine[];
}

export const SPEAKERS: Record<SpeakerId, Speaker> = {
  fortaeller: { name: 'Fortæller', lengthScale: 1.05 },
  kanel: { name: 'Kanel', lengthScale: 0.95 },
  pind: { name: 'Postmester Pind', lengthScale: 1.15 },
  spiller: { name: 'Dig' },
};

/** Narration manifest written by tools/tts: line id -> audio file (relative to /narration/). */
export type NarrationManifest = Record<string, string>;
