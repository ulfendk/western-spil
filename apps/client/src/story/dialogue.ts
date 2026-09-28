import { SPEAKERS, type DialogueLine, type DialogueScript, type SpeakerId } from '@western/shared';
import { narrator } from '../audio/narrator.js';
import { h } from '../ui/dom.js';

const AUTO_ADVANCE_MS = 900;

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
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        finishTyping();
        narrator.stop();
        resolve();
      };
      // Tap anywhere on the bubble, the Next button or the keyboard to continue.
      this.advance = () => {
        if (typed < line.text.length) finishTyping();
        else finish();
      };
      bubble.onclick = (e) => {
        if (e.target === bubble || e.target === text) this.advance?.();
      };
      next.onclick = finish;
      skip.onclick = () => {
        this.skipping = true;
        finish();
      };
      replay.onclick = () => void narrator.play(line);
      // Lines with answers wait for the answer instead of auto-advancing.
      if (line.choices) {
        next.hidden = true;
        skip.hidden = true;
        void narrator.play(line).then(() => {
          finishTyping();
          finish();
        });
        return;
      }
      void narrator.play(line).then((played) => {
        // Voiced lines move on by themselves; silent ones wait for the reader.
        if (played && !done) timer = window.setTimeout(finish, AUTO_ADVANCE_MS);
      });
    });
  }

  private ask(line: DialogueLine): Promise<NonNullable<DialogueLine['choices']>[number]> {
    return new Promise((resolve) => {
      const buttons = line.choices!.map((choice, i) => {
        const b = h('button', { class: 'btn dialogue-choice' }, `${i + 1}. ${choice.text}`);
        b.onclick = () => resolve(choice);
        return b;
      });
      const box = h('div', { class: 'dialogue-choices' }, ...buttons);
      this.root.append(box);
      this.advance = null;
      const onKey = (e: KeyboardEvent) => {
        const n = Number(e.key) - 1;
        if (line.choices![n]) {
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
