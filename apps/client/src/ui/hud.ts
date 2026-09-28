import type { Emote } from '@western/shared';
import { store } from '../save/store.js';
import { h } from './dom.js';

export class Hud {
  readonly el: HTMLElement;
  private stats = h('div', { class: 'hud-stats' });
  private players = h('div', { class: 'hud-players' }, 'Alene på prærien');

  constructor(onPause: () => void, onEmote: (e: Emote) => void) {
    const pause = h('button', { class: 'hud-btn', title: 'Pause', ariaLabel: 'Pause' }, '⏸');
    pause.onclick = onPause;
    const wave = h('button', { class: 'hud-btn', title: 'Vink', ariaLabel: 'Vink' }, '👋');
    wave.onclick = () => onEmote('wave');
    const hint = h(
      'div',
      { class: 'hud-hint' },
      'WASD/pile for at gå · Shift for at løbe · Esc for pause',
    );
    this.el = h(
      'div',
      { class: 'hud', hidden: true },
      h('div', { class: 'hud-top' }, this.stats, this.players),
      h('div', { class: 'hud-actions' }, wave, pause),
      hint,
    );
    document.body.append(this.el);
    store.onChange(() => this.render());
    this.render();
  }

  setPlayers(count: number, online: boolean) {
    this.players.textContent = online
      ? count > 1
        ? `🤠 ${count} cowboys i nærheden`
        : '🤠 Du er den eneste her lige nu'
      : 'Alene på prærien';
  }

  show(visible: boolean) {
    this.el.hidden = !visible;
  }

  private render() {
    const s = store.save;
    this.stats.textContent = `${s.nickname} · 💲${s.dollars} · ⭐${s.stars}`;
  }
}
