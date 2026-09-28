import { startTone } from '../audio/sfx.js';
import { h } from '../ui/dom.js';

/** International Morse code for the letters we use. */
const MORSE: Record<string, string> = {
  A: '.-',
  E: '.',
  F: '..-.',
  H: '....',
  I: '..',
  O: '---',
  R: '.-.',
  S: '...',
  T: '-',
};

/** Presses shorter than this are dots; longer ones are dashes. Generous for kids. */
const DASH_MS = 260;

export interface MorseResult {
  mistakes: number;
}

const symbolsHtml = (code: string) => [...code].map((c) => (c === '.' ? '●' : '▬')).join(' ');

/**
 * Send a word on the telegraph key: short press = dot, long press = dash.
 * The card shows the current letter's code; a wrong symbol restarts that letter.
 */
export function playMorse(word: string, title: string): Promise<MorseResult> {
  return new Promise((resolve) => {
    const letters = [...word.toUpperCase()].filter((c) => c !== ' ');
    let index = 0;
    let typed = '';
    let mistakes = 0;
    let pressedAt = 0;
    let stopTone: (() => void) | null = null;
    let done = false;

    const wordEl = h('div', { class: 'morse-word' });
    const letterEl = h('div', { class: 'morse-letter' });
    const codeEl = h('div', { class: 'morse-code' });
    const typedEl = h('div', { class: 'morse-typed' });
    const key = h('button', { class: 'morse-key' }, h('span', {}, 'TRYK'));
    const legend = h(
      'div',
      { class: 'morse-legend' },
      ...[...new Set(letters)].map((l) => h('span', {}, `${l} ${symbolsHtml(MORSE[l]!)}`)),
    );
    const root = h(
      'div',
      { class: 'pack morse' },
      h('h2', {}, title),
      h('p', { class: 'pack-help' }, 'Kort tryk = ● prik. Langt tryk = ▬ streg.'),
      wordEl,
      h('div', { class: 'morse-card' }, letterEl, codeEl, typedEl),
      key,
      legend,
    );
    document.body.append(root);

    const render = () => {
      wordEl.replaceChildren(
        ...letters.map((l, i) =>
          h('span', { class: i < index ? 'sent' : i === index ? 'now' : '' }, l),
        ),
      );
      const l = letters[index];
      letterEl.textContent = l ?? '✔';
      codeEl.textContent = l ? symbolsHtml(MORSE[l]!) : '';
      typedEl.textContent = typed ? symbolsHtml(typed) : ' ';
    };

    const down = () => {
      if (done || stopTone) return;
      pressedAt = performance.now();
      stopTone = startTone();
      key.classList.add('down');
    };
    const up = () => {
      if (!stopTone) return;
      stopTone();
      stopTone = null;
      key.classList.remove('down');
      const symbol = performance.now() - pressedAt < DASH_MS ? '.' : '-';
      const expected = MORSE[letters[index]!]!;
      typed += symbol;
      if (!expected.startsWith(typed)) {
        mistakes++;
        root.classList.remove('shake');
        void root.offsetWidth;
        root.classList.add('shake');
        typed = '';
      } else if (typed === expected) {
        typed = '';
        index++;
        if (index >= letters.length) {
          done = true;
          render();
          setTimeout(() => {
            cleanup();
            resolve({ mistakes });
          }, 1100);
          return;
        }
      }
      render();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (!e.repeat) down();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') up();
    };
    key.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      down();
    });
    key.addEventListener('pointerup', up);
    key.addEventListener('pointerleave', up);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    render();

    function cleanup() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      root.remove();
    }
  });
}
