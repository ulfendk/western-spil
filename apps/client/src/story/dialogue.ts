import {
  allLines,
  SPEAKERS,
  type DialogueLine,
  type DialogueScript,
  type SpeakerId,
} from '@western/shared';
import { settings } from '../settings.js';
import { narrator } from '../audio/narrator.js';
import { h } from '../ui/dom.js';

const AUTO_ADVANCE_MS = 900;

/** If a line can't be voiced, give time to read it before moving on. */
function readingTimeMs(text: string): number {
  return 2500 + text.length * 70;
}

export interface DialogueOptions {
  /** Called when a new line starts, e.g. to turn the camera towards the speaker. */
  onSpeaker?(speaker: SpeakerId): void;
}

/**
 * Plays a conversation: comic speech bubble at the bottom of the screen, text typed out
 * while the narration plays, then auto-advance (or tap/Space/E/Enter to continue).
 * Answer buttons appear for lines with choices. Resolves with the flags that were picked.
 */
export class DialogueRunner {
  private root = h('div', { class: 'dialogue', hidden: true });
  private advance: (() => void) | null = null;
  private skipping = false;

  constructor() {
    document.body.append(this.root);
    window.addEventListener('keydown', (e) => {
      if (this.root.hidden || !this.advance) return;
      if (['Space', 'Enter', 'KeyE', 'NumpadEnter'].includes(e.code)) {
        e.preventDefault();
        this.advance();
      }
    });
  }

  get active(): boolean {
    return !this.root.hidden;
  }

  async run(script: DialogueScript, opts: DialogueOptions = {}): Promise<string[]> {
    const flags: string[] = [];
    this.skipping = false;
    this.root.hidden = false;
    narrator.preload(allLines(script));
    try {
      await this.playLines(script.lines, flags, opts);
    } finally {
      narrator.stop();
      this.root.hidden = true;
      this.root.replaceChildren();
      this.advance = null;
    }
    return flags;
  }

  private async playLines(lines: DialogueLine[], flags: string[], opts: DialogueOptions) {
    for (const line of lines) {
      opts.onSpeaker?.(line.speaker);
      await this.playLine(line);
      if (line.choices) {
        this.skipping = false;
        const choice = await this.ask(line);
        if (choice.flag) flags.push(choice.flag);
        await this.playLines(choice.lines, flags, opts);
      }
    }
  }

  private async playLine(line: DialogueLine) {
    const text = h('p', { class: 'dialogue-text' });
    const next = h('button', { class: 'dialogue-btn', title: 'Næste (mellemrum)' }, 'Næste ▶');
    const skip = h(
      'button',
      { class: 'dialogue-btn dialogue-skip', title: 'Spring samtalen over' },
      'Spring over ⏭',
    );
    const replay = h(
      'button',
      { class: 'dialogue-btn', title: 'Hør igen', ariaLabel: 'Hør igen' },
      '🔊',
    );
    const bubble = h(
      'div',
      { class: `dialogue-bubble speaker-${line.speaker}` },
      h('div', { class: 'dialogue-name' }, SPEAKERS[line.speaker].name),
      text,
      h('div', { class: 'dialogue-controls' }, replay, skip, next),
    );
    this.root.replaceChildren(bubble);

    let typed = 0;
    const typer = window.setInterval(() => {
      typed = Math.min(line.text.length, typed + 2);
      text.textContent = line.text.slice(0, typed);
      if (typed >= line.text.length) clearInterval(typer);
    }, 28);
    const finishTyping = () => {
      clearInterval(typer);
      typed = line.text.length;
      text.textContent = line.text;
    };

    if (this.skipping && !line.choices) {
      finishTyping();
      return;
    }

    await new Promise<void>((resolve) => {
      let done = false;
      let timer = 0;
      /** Bumped on each (re)play so an interrupted playback can't schedule the next line. */
      let attempt = 0;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        finishTyping();
        narrator.stop();
        resolve();
      };
      const speak = () => {
        const mine = ++attempt;
        clearTimeout(timer);
        void narrator.play(line).then((played) => {
          if (done || mine !== attempt) return;
          if (line.choices) {
            // Answers appear once the question has been asked.
            finishTyping();
            finish();
          } else if (played) {
            // Voiced lines move on by themselves.
            timer = window.setTimeout(finish, AUTO_ADVANCE_MS);
          } else if (settings.narration) {
            // Voice unavailable (offline, blocked audio): move on after reading time.
            timer = window.setTimeout(finish, readingTimeMs(line.text));
          }
          // With narration turned off, the reader taps Next themselves.
        });
      };
      // Tap the bubble, the Next button or press Space/E/Enter to continue.
      this.advance = () => {
        if (typed < line.text.length) finishTyping();
        else finish();
      };
      bubble.onclick = (e) => {
        if (!(e.target as HTMLElement).closest('button')) this.advance?.();
      };
      next.onclick = finish;
      skip.onclick = () => {
        this.skipping = true;
        finish();
      };
      replay.onclick = speak;
      if (line.choices) {
        next.hidden = true;
        skip.hidden = true;
      }
      speak();
    });
  }

  private ask(line: DialogueLine): Promise<NonNullable<DialogueLine['choices']>[number]> {
    return new Promise((resolve) => {
      const buttons = line.choices!.map((choice, i) => {
        const b = h('button', { class: 'btn dialogue-choice' }, `${i + 1}. ${choice.text}`);
        b.onclick = () => {
          narrator.stop();
          resolve(choice);
        };
        return b;
      });
      const box = h('div', { class: 'dialogue-choices' }, ...buttons);
      this.root.append(box);
      this.advance = null;
      // Read the options aloud ("Tryk på nummer et for at …"); answering stops it.
      void (async () => {
        for (const choice of line.choices!) {
          if (!choice.prompt || !box.isConnected) break;
          await narrator.play(choice.prompt);
        }
      })();
      const onKey = (e: KeyboardEvent) => {
        const n = Number(e.key) - 1;
        if (line.choices![n]) {
          narrator.stop();
          window.removeEventListener('keydown', onKey);
          resolve(line.choices![n]!);
        }
      };
      window.addEventListener('keydown', onKey);
      buttons.forEach((b) =>
        b.addEventListener('click', () => window.removeEventListener('keydown', onKey)),
      );
    });
  }
}
