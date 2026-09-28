import type { Emote } from '@western/shared';
import { store } from '../save/store.js';
import { h } from './dom.js';

export class Hud {
  readonly el: HTMLElement;
  private stats = h('div', { class: 'hud-stats' });
  private players = h('div', { class: 'hud-players' }, 'Alene på prærien');
  private objective = h('div', { class: 'hud-objective', hidden: true });
  private actions: HTMLElement;
  private hint: HTMLElement;

  constructor(onPause: () => void, onEmote: (e: Emote) => void) {
    const pause = h('button', { class: 'hud-btn', title: 'Pause', ariaLabel: 'Pause' }, '⏸');
    pause.onclick = onPause;
    const wave = h('button', { class: 'hud-btn', title: 'Vink', ariaLabel: 'Vink' }, '👋');
    wave.onclick = () => onEmote('wave');
    this.hint = h(
      'div',
      { class: 'hud-hint' },
      'WASD/pile for at gå · Shift for at løbe · E for at tale · Esc for pause',
    );
    this.actions = h('div', { class: 'hud-actions' }, wave, pause);
    this.el = h(
      'div',
      { class: 'hud', hidden: true },
      h(
        'div',
        { class: 'hud-top' },
        h('div', { class: 'hud-left' }, this.stats, this.objective),
        this.players,
      ),
      this.actions,
      this.hint,
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

  /** Current goal shown under the stats, or null to hide it. */
  setObjective(text: string | null) {
    this.objective.hidden = !text;
    this.objective.textContent = text ? `🎯 ${text}` : '';
  }

  /** Hide buttons and hints while a conversation or minigame is on screen. */
  setTalking(talking: boolean) {
    this.actions.hidden = talking;
    this.hint.hidden = talking;
  }

  show(visible: boolean) {
    this.el.hidden = !visible;
  }

  private render() {
    const s = store.save;
    this.stats.textContent = `${s.nickname} · 💲${s.dollars} · ⭐${s.stars}`;
  }
}
