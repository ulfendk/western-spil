import { SPEAKERS, type DialogueLine } from '@western/shared';
import { narrator } from '../audio/narrator.js';
import { h } from './dom.js';

/** Comic speech bubble: types the text out while the narration plays. */
export async function speak(parent: HTMLElement, line: DialogueLine): Promise<void> {
  const text = h('p', { class: 'bubble-text' });
  const bubble = h(
    'div',
    { class: `bubble speaker-${line.speaker}` },
    h('div', { class: 'bubble-name' }, SPEAKERS[line.speaker].name),
    text,
  );
  parent.append(bubble);

  let i = 0;
  const reveal = window.setInterval(() => {
    i = Math.min(line.text.length, i + 2);
    text.textContent = line.text.slice(0, i);
    if (i >= line.text.length) clearInterval(reveal);
  }, 30);

  const replay = h(
    'button',
    { class: 'bubble-replay', title: 'Hør igen', ariaLabel: 'Hør igen' },
    '🔊',
  );
  replay.onclick = () => void narrator.play(line);
  bubble.append(replay);

  await narrator.play(line);
}
