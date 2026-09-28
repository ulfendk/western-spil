import { PHRASES, type Emote } from '@western/shared';
import { h } from './dom.js';

const EMOTE_BUTTONS: { emote: Emote; label: string }[] = [
  { emote: 'wave', label: '👋 Vink' },
  { emote: 'hat', label: '🤠 Løft hatten' },
  { emote: 'jump', label: '🤸 Hop' },
];

/**
 * The "💬" menu: preset phrases and emotes. There's deliberately no text box,
 * so kids can only say friendly, pre-approved things to each other.
 */
export class ChatMenu {
  private el: HTMLElement;
  private enabled = () => true;

  constructor(
    private onSay: (phrase: number) => void,
    private onEmote: (emote: Emote) => void,
  ) {
    const phrases = PHRASES.map((p, i) => {
      const b = h('button', { class: 'chat-phrase' }, `${i + 1}. ${p.text}`);
      b.onclick = () => this.pick(() => this.onSay(i));
      return b;
    });
    const emotes = EMOTE_BUTTONS.map(({ emote, label }) => {
      const b = h('button', { class: 'chat-emote' }, label);
      b.onclick = () => this.pick(() => this.onEmote(emote));
      return b;
    });
    this.el = h(
      'div',
      { class: 'chat-menu', hidden: true },
      h('div', { class: 'chat-title' }, 'Sig noget'),
      h('div', { class: 'chat-phrases' }, ...phrases),
      h('div', { class: 'chat-emotes' }, ...emotes),
    );
    document.body.append(this.el);

    window.addEventListener('keydown', (e) => {
      if (!this.enabled()) return;
      if (e.code === 'KeyT' && this.el.hidden) {
        this.toggle(true);
      } else if (!this.el.hidden) {
        const n = Number(e.key) - 1;
        if (PHRASES[n]) this.pick(() => this.onSay(n));
        else if (e.code === 'Escape' || e.code === 'KeyT') this.toggle(false);
      }
    });
  }

  /** Only allowed while freely playing (not in conversations or minigames). */
  setEnabled(fn: () => boolean) {
    this.enabled = fn;
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  toggle(open = this.el.hidden) {
    if (open && !this.enabled()) return;
    this.el.hidden = !open;
  }

  private pick(action: () => void) {
    action();
    this.toggle(false);
  }
}
