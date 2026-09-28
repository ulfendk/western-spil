export type SpeakerId = 'fortaeller' | 'kanel' | 'pind' | 'spiller';

export interface Speaker {
  name: string;
  /** Piper speaker settings; lets characters sound slightly different. */
  lengthScale?: number;
}

export interface DialogueChoice {
  /** Button text (the player's answer). */
  text: string;
  /**
   * Voiced hint read by the narrator while the answers are shown, e.g.
   * "Tryk på nummer et for at spørge hvem de er". Id: "<line id>-valg<n>".
   */
  prompt?: DialogueLine;
  /** Flag recorded in the save when this answer is picked. */
  flag?: string;
  /** Lines that follow this answer before the conversation continues. */
  lines: DialogueLine[];
}

export interface DialogueLine {
  id: string;
  speaker: SpeakerId;
  /** What's shown on screen (correct punctuation). */
  text: string;
  /** Optional wording for the voice only, e.g. without a comma the TTS pauses too long on. */
  say?: string;
  /** Answers offered after this line. */
  choices?: DialogueChoice[];
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

/** Every line in a script, including the ones inside choices (for rendering audio). */
export function allLines(script: DialogueScript): DialogueLine[] {
  const out: DialogueLine[] = [];
  const walk = (lines: DialogueLine[]) => {
    for (const line of lines) {
      out.push(line);
      for (const choice of line.choices ?? []) {
        if (choice.prompt) out.push(choice.prompt);
        walk(choice.lines);
      }
    }
  };
  walk(script.lines);
  return out;
}

/** Narration manifest written by tools/tts: line id -> audio file (relative to /narration/). */
export type NarrationManifest = Record<string, string>;
