import { Callbacks, Client, type Room } from '@colyseus/sdk';
import {
  contestReward,
  ERR_OUTDATED_CLIENT,
  PROTOCOL_VERSION,
  ROOM_CONTEST,
  type ContestEvent,
  type ContestKind,
  type TownId,
} from '@western/shared';
import { narrator } from '../audio/narrator.js';
import { beep } from '../audio/sfx.js';
import type { Game } from '../game/game.js';
import { colyseusEndpoint } from '../net/endpoint.js';
import { updater } from '../pwa/updater.js';
import { store } from '../save/store.js';
import { DialogueRunner } from '../story/dialogue.js';
import { script } from '../story/scripts.js';
import { h } from '../ui/dom.js';
import { toast } from '../ui/toast.js';

interface PlayerView {
  nickname: string;
  score: number;
  progress: number;
  place: number;
}
interface StateView {
  kind: string;
  phase: 'lobby' | 'countdown' | 'playing' | 'done';
  seed: number;
  secondsLeft: number;
  players: Map<string, PlayerView>;
  winners: string[];
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ContestRoomView = Room<any, StateView>;

export interface ContestPlayer extends PlayerView {
  id: string;
  me: boolean;
}

/** What a game module gets while it runs. */
export interface ContestContext {
  game: Game;
  kind: ContestKind;
  seed: number;
  /** Seconds since play began. */
  elapsed(): number;
  secondsLeft(): number;
  send(event: ContestEvent): void;
  players(): ContestPlayer[];
  /** True once time is up or everyone is done (the module should then stop). */
  ended(): boolean;
}

/** One game: resolves when it has cleaned up after `ctx.ended()`. */
export type ContestGame = (ctx: ContestContext) => Promise<void>;

const LABEL: Record<ContestKind, string> = {
  daaser: '🥫 Dåseskydning',
  loeb: '🐎 Hestevæddeløb',
  plakater: '📜 Efterlyst!',
};

/** How a score reads on the board. */
export function scoreText(kind: ContestKind, p: PlayerView): string {
  if (kind === 'loeb') return p.place ? `${p.place}. plads` : `${Math.round(p.progress)} m`;
  if (kind === 'plakater') return `${p.score} plakater`;
  return `${p.score} point`;
}

/**
 * Client for a town contest: lobby, countdown, a live scoreboard while playing,
 * then results and dollars. The game itself is a separate module.
 */
export class ContestClient {
  private room: ContestRoomView | null = null;
  private root = h('div', { class: 'hs' });
  private board = h('div', { class: 'hs-board' });
  private status = h('p', { class: 'hs-status' });
  private buttons = h('div', { class: 'hs-buttons' });
  private panel = h('div', { class: 'panel hs-panel' });
  private strip = h('div', { class: 'contest-strip', hidden: true });
  private countdown = h('div', { class: 'contest-countdown', hidden: true });
  private dialogue = new DialogueRunner();
  private finished: (() => void) | null = null;
  private running = false;
  private rewarded = false;
  private playStart = 0;
  private lastCount = -1;

  constructor(
    private game: Game,
    private kind: ContestKind,
    private townId: TownId,
    private run: ContestGame,
  ) {}

  /** Joins (or creates) the lobby and resolves when the player leaves. */
  async play(): Promise<void> {
    this.panel.replaceChildren(
      h('h2', {}, LABEL[this.kind]),
      this.board,
      this.status,
      this.buttons,
    );
    this.root.replaceChildren(this.panel);
    document.body.append(this.root, this.strip, this.countdown);
    this.game.lockInput(true);
    try {
      this.room = await new Client(colyseusEndpoint()).joinOrCreate<StateView>(ROOM_CONTEST, {
        protocol: PROTOCOL_VERSION,
        nickname: store.save.nickname,
        townId: this.townId,
        kind: this.kind,
      });
    } catch (err) {
      if ((err as { code?: number }).code === ERR_OUTDATED_CLIENT) void updater.forceUpdate();
      toast('Kan ikke nå serveren – prøv igen om lidt');
      this.cleanup();
      return;
    }
    const room = this.room;
    if (!room.state?.players)
      await new Promise<void>((resolve) => room.onStateChange.once(() => resolve()));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cb = Callbacks.get(room as Room<any, any>);
    cb.onChange(room.state as object, () => this.render());
    cb.onAdd('players', (p) => {
      cb.onChange(p as object, () => this.render());
      this.render();
    });
    cb.onRemove('players', () => this.render());
    room.onLeave(() => this.finished?.());
    await this.explainOnce();
    this.render();
    await new Promise<void>((resolve) => (this.finished = resolve));
    this.cleanup();
  }

  /** Kanel explains the rules the first time you play each game. */
  private async explainOnce() {
    const flag = `${this.kind}-regler`;
    if (store.save.progress.flags.includes(flag)) return;
    const rules = script('kappestrid');
    await this.dialogue.run({
      ...rules,
      lines: rules.lines.filter((l) => l.id.startsWith(`kappestrid.${this.kind}-`)),
    });
    store.update({
      progress: { ...store.save.progress, flags: [...store.save.progress.flags, flag] },
    });
  }

  private players(): ContestPlayer[] {
    const s = this.room?.state;
    if (!s) return [];
    return [...s.players.entries()].map(([id, p]) => ({
      id,
      me: id === this.room!.sessionId,
      nickname: p.nickname,
      score: p.score,
      progress: p.progress,
      place: p.place,
    }));
  }

  private render() {
    const s = this.room?.state;
    if (!s) return;
    const players = this.players().sort((a, b) =>
      this.kind === 'loeb'
        ? (a.place || 99) - (b.place || 99) || b.progress - a.progress
        : b.score - a.score,
    );
    const rows = (withScore: boolean) =>
      players.map((p) =>
        h(
          'div',
          { class: `hs-player${p.me ? ' me' : ''}${s.winners.includes(p.id) ? ' turn' : ''}` },
          h(
            'span',
            {},
            `${s.winners.includes(p.id) ? '🏆 ' : ''}${p.nickname}${p.me ? ' (dig)' : ''}`,
          ),
          h('span', { class: 'hs-score' }, withScore ? scoreText(this.kind, p) : ''),
        ),
      );

    // The countdown: big numbers, a beep each second.
    this.countdown.hidden = s.phase !== 'countdown';
    if (s.phase === 'countdown') {
      this.countdown.textContent = String(s.secondsLeft || '');
      if (s.secondsLeft !== this.lastCount) beep(600, 0.12, 0.12);
    }
    this.lastCount = s.secondsLeft;

    // While playing, only a thin live scoreboard stays on screen.
    const playing = s.phase === 'playing';
    this.root.hidden = playing || s.phase === 'countdown';
    this.strip.hidden = !playing;
    if (playing) {
      const leave = h('button', { class: 'btn btn-small' }, 'Forlad');
      leave.onclick = () => void this.room?.leave();
      this.strip.replaceChildren(
        h('span', { class: 'contest-time' }, `⏱ ${s.secondsLeft}`),
        ...players.map((p) =>
          h('span', { class: p.me ? 'me' : '' }, `${p.nickname}: ${scoreText(this.kind, p)}`),
        ),
        leave,
      );
      if (!this.running) void this.startGame();
      return;
    }

    this.board.replaceChildren(...rows(s.phase === 'done'));
    const buttons: HTMLElement[] = [];
    if (s.phase === 'lobby') {
      this.rewarded = false;
      this.status.textContent =
        s.players.size > 1
          ? `${s.players.size} spillere klar. Alle spiller på samme tid!`
          : 'Venter på flere spillere – eller start alene.';
      const start = h('button', { class: 'btn btn-big' }, 'Start spillet');
      start.onclick = () => this.room?.send('start');
      buttons.push(start);
    } else if (s.phase === 'done') {
      const names = s.winners.map((w) => s.players.get(w)?.nickname).filter(Boolean);
      this.status.textContent = names.length ? `🏆 ${names.join(' og ')} vandt!` : 'Tiden er gået!';
      const again = h('button', { class: 'btn btn-big' }, 'Spil igen');
      again.onclick = () => this.room?.send('again');
      buttons.push(again);
      this.reward();
    }
    const leave = h('button', { class: 'btn' }, 'Gå videre');
    leave.onclick = () => void this.room?.leave();
    buttons.push(leave);
    this.buttons.replaceChildren(...buttons);
  }

  private async startGame() {
    const room = this.room!;
    this.running = true;
    this.playStart = performance.now();
    const ctx: ContestContext = {
      game: this.game,
      kind: this.kind,
      seed: room.state.seed,
      elapsed: () => (performance.now() - this.playStart) / 1000,
      secondsLeft: () => room.state.secondsLeft,
      send: (event) => room.send('event', event),
      players: () => this.players(),
      ended: () => room.state.phase !== 'playing' || !this.finished,
    };
    try {
      await this.run(ctx);
    } finally {
      this.running = false;
      this.game.lockInput(true);
      this.render();
    }
  }

  /** Dollars once per game: more for winning (or a good solo score). */
  private reward() {
    const s = this.room!.state;
    if (this.rewarded) return;
    this.rewarded = true;
    const me = s.players.get(this.room!.sessionId);
    const won = s.winners.includes(this.room!.sessionId);
    const dollars = contestReward(this.kind, me?.score ?? 0, won, s.players.size);
    store.update({ dollars: store.save.dollars + dollars });
    const great = dollars > 2;
    toast(great ? `🏆 Flot klaret! 💲${dollars}` : `Godt kæmpet! 💲${dollars}`);
    const line = script('kappestrid').lines.find(
      (l) => l.id === `kappestrid.${great ? 'vandt' : 'slut'}`,
    );
    if (line) void narrator.play(line);
  }

  private cleanup() {
    this.finished = null;
    this.root.remove();
    this.strip.remove();
    this.countdown.remove();
    this.game.lockInput(false);
  }
}
