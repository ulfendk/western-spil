import * as THREE from 'three';
import { Callbacks, Client, type Room } from '@colyseus/sdk';
import {
  ERR_OUTDATED_CLIENT,
  HORSESHOE,
  PROTOCOL_VERSION,
  ROOM_HORSESHOE,
  type ThrowLabel,
} from '@western/shared';
import type { Game } from '../game/game.js';
import { heightAt } from '../game/world/index.js';
import { outline, part } from '../game/toon.js';
import { colyseusEndpoint } from '../net/endpoint.js';
import { updater } from '../pwa/updater.js';
import { store } from '../save/store.js';
import { DialogueRunner } from '../story/dialogue.js';
import { script } from '../story/scripts.js';
import { narrator } from '../audio/narrator.js';
import { h } from '../ui/dom.js';
import { toast } from '../ui/toast.js';

interface HsPlayerView {
  nickname: string;
  score: number;
}
interface HsStateView {
  phase: 'lobby' | 'playing' | 'done';
  round: number;
  throwsLeft: number;
  turn: string;
  turnSecondsLeft: number;
  players: Map<string, HsPlayerView>;
  order: string[];
  last: { seq: number; by: string; x: number; z: number; points: number; label: ThrowLabel };
  winners: string[];
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HsRoom = Room<any, HsStateView>;

const LABELS: Record<ThrowLabel, string> = {
  ringer: 'Ringer! +3',
  taet: 'Tæt på! +2',
  naer: '+1',
  forbi: 'Forbi',
};

/** Power meter: sweeps 0 → 1 → 0 while the button is held. */
const METER_PERIOD = 1.8;
const PERFECT_POWER = (HORSESHOE.pitLength - 3) / 14;

export interface PitSpots {
  pitStart: THREE.Vector3;
  pitStake: THREE.Vector3;
  pitDir: THREE.Vector3;
}

/**
 * Client for the multiplayer horseshoe toss. The server decides every throw;
 * this shows the lobby/scoreboard, handles aiming + the power meter on your
 * turn, and animates everyone's horseshoes.
 */
export class HorseshoeClient {
  private room: HsRoom | null = null;
  private root = h('div', { class: 'hs' });
  private board = h('div', { class: 'hs-board' });
  private status = h('p', { class: 'hs-status' });
  private buttons = h('div', { class: 'hs-buttons' });
  private controls = h('div', { class: 'hs-controls', hidden: true });
  private meterFill = h('div', { class: 'hs-meter-fill' });
  private dialogue = new DialogueRunner();
  private landed: THREE.Object3D[] = [];
  private flying: {
    obj: THREE.Object3D;
    from: THREE.Vector3;
    to: THREE.Vector3;
    t: number;
    label: ThrowLabel;
    mine: boolean;
  } | null = null;
  private charging = false;
  /** performance.now() when the throw button was pressed. */
  private chargeStart = 0;
  private aim = 0;
  private aimInput = 0;
  private myTurnShown = false;
  private lastSeq = 0;
  private finished: (() => void) | null = null;
  private rewarded = false;
  private raf = 0;
  private lastFrame = 0;
  private onKeyDown = (e: KeyboardEvent) => this.key(e, true);
  private onKeyUp = (e: KeyboardEvent) => this.key(e, false);

  constructor(
    private game: Game,
    private spots: PitSpots,
    private townId: 'st-louis',
  ) {}

  /** Joins (or creates) the pit's lobby and resolves when the player leaves. */
  async play(): Promise<void> {
    this.buildUi();
    this.game.lockInput(true);
    this.spectate();
    try {
      this.room = await new Client(colyseusEndpoint()).joinOrCreate<HsStateView>(ROOM_HORSESHOE, {
        protocol: PROTOCOL_VERSION,
        nickname: store.save.nickname,
        townId: this.townId,
      });
    } catch (err) {
      if ((err as { code?: number }).code === ERR_OUTDATED_CLIENT) void updater.forceUpdate();
      toast('Kan ikke nå serveren – prøv igen om lidt');
      this.cleanup();
      return;
    }
    // The first full state can arrive just after joining; wait for it before listening.
    const room = this.room;
    if (!room.state?.last)
      await new Promise<void>((resolve) => room.onStateChange.once(() => resolve()));
    this.lastSeq = this.room.state.last?.seq ?? 0;
    // The state is decoded by reflection, so the callbacks API only sees an untyped schema.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cb = Callbacks.get(this.room as Room<any, any>);
    cb.onChange(this.room.state as object, () => this.render());
    cb.onAdd('players', (p) => {
      cb.onChange(p as object, () => this.render());
      this.render();
    });
    cb.onRemove('players', () => this.render());
    // Fields inside `last` change on every throw (the object itself is never replaced).
    cb.onChange(this.room.state.last as object, () => this.watchThrows());
    this.room.onLeave(() => this.finished?.());
    // Explain the rules the first time.
    if (!store.save.progress.flags.includes('hestesko-regler')) {
      const rules = script('hestesko');
      await this.dialogue.run({
        ...rules,
        lines: rules.lines.filter((l) => ['hestesko.regler', 'hestesko.sigt'].includes(l.id)),
      });
      store.update({
        progress: {
          ...store.save.progress,
          flags: [...store.save.progress.flags, 'hestesko-regler'],
        },
      });
    }
    this.render();
    this.startLoop();
    await new Promise<void>((resolve) => (this.finished = resolve));
    this.cleanup();
  }

  private buildUi() {
    const hold = h('button', { class: 'btn btn-big hs-throw' }, 'Hold for at kaste');
    hold.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.startCharge();
    });
    hold.addEventListener('pointerup', () => this.release());
    hold.addEventListener('pointerleave', () => this.charging && this.release());
    const left = h('button', { class: 'btn hs-aim' }, '◀');
    const right = h('button', { class: 'btn hs-aim' }, '▶');
    for (const [btn, dir] of [
      [left, -1],
      [right, 1],
    ] as const) {
      btn.addEventListener('pointerdown', () => (this.aimInput = dir));
      btn.addEventListener('pointerup', () => (this.aimInput = 0));
      btn.addEventListener('pointerleave', () => (this.aimInput = 0));
    }
    const meter = h(
      'div',
      { class: 'hs-meter' },
      this.meterFill,
      h('div', { class: 'hs-meter-target' }),
    );
    (meter.lastChild as HTMLElement).style.left = `${PERFECT_POWER * 100}%`;
    this.controls.replaceChildren(meter, h('div', { class: 'hs-row' }, left, hold, right));
    this.root.replaceChildren(
      h(
        'div',
        { class: 'panel hs-panel' },
        h('h2', {}, 'Hestesko'),
        this.board,
        this.status,
        this.buttons,
      ),
      this.controls,
    );
    document.body.append(this.root);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  private key(e: KeyboardEvent, down: boolean) {
    if (this.dialogue.active) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (down && !e.repeat) this.startCharge();
      else if (!down) this.release();
    } else if (['ArrowLeft', 'KeyA'].includes(e.code)) {
      this.aimInput = down ? -1 : 0;
    } else if (['ArrowRight', 'KeyD'].includes(e.code)) {
      this.aimInput = down ? 1 : 0;
    }
  }

  private get myTurn(): boolean {
    const s = this.room?.state;
    return !!s && s.phase === 'playing' && s.turn === this.room!.sessionId && !this.flying;
  }

  private render() {
    const s = this.room?.state;
    if (!s) return;
    const me = this.room!.sessionId;
    const ids = s.phase === 'lobby' ? [...s.players.keys()] : [...s.order];
    this.board.replaceChildren(
      ...ids.map((id) => {
        const p = s.players.get(id);
        if (!p) return h('div');
        const row = h(
          'div',
          { class: `hs-player${id === s.turn ? ' turn' : ''}${id === me ? ' me' : ''}` },
          h('span', {}, `${id === s.turn ? '🎯 ' : ''}${p.nickname}${id === me ? ' (dig)' : ''}`),
          h('span', { class: 'hs-score' }, s.phase === 'lobby' ? '' : `${p.score}`),
        );
        return row;
      }),
    );
    const buttons: HTMLElement[] = [];
    if (s.phase === 'lobby') {
      this.status.textContent =
        s.players.size > 1
          ? `${s.players.size} spillere klar. Flere kan nå at komme med!`
          : 'Venter på flere spillere – eller start alene.';
      const start = h('button', { class: 'btn btn-big' }, 'Start spillet');
      start.onclick = () => this.room?.send('start');
      buttons.push(start);
    } else if (s.phase === 'playing') {
      const who = s.players.get(s.turn)?.nickname;
      this.status.textContent = !s.turn
        ? `Runde ${s.round} af ${HORSESHOE.rounds}`
        : s.turn === me
          ? `Din tur! ${s.throwsLeft} ${s.throwsLeft === 1 ? 'kast' : 'kast'} tilbage · ${s.turnSecondsLeft} sek.`
          : `${who} kaster… (runde ${s.round} af ${HORSESHOE.rounds})`;
    } else {
      const names = s.winners.map((w) => s.players.get(w)?.nickname).filter(Boolean);
      this.status.textContent = names.length
        ? `🏆 ${names.join(' og ')} vandt!`
        : 'Spillet er slut';
      const again = h('button', { class: 'btn btn-big' }, 'Spil igen');
      again.onclick = () => {
        this.rewarded = false;
        this.room?.send('again');
      };
      buttons.push(again);
      this.reward();
    }
    const leave = h('button', { class: 'btn' }, 'Forlad banen');
    leave.onclick = () => void this.room?.leave();
    buttons.push(leave);
    this.buttons.replaceChildren(...buttons);

    // Camera and throw controls follow whose turn it is.
    const mine = this.myTurn;
    this.controls.hidden = !mine;
    if (mine && !this.myTurnShown) {
      this.myTurnShown = true;
      this.aim = 0;
      this.standAtLine();
      void narrator.play(line('din-tur'));
    } else if (!mine && this.myTurnShown && !this.flying) {
      this.myTurnShown = false;
      this.spectate();
    }
    if (s.phase === 'lobby') this.clearLanded();
  }

  /** Winner gets 💲5, everyone else 💲2, once per game. */
  private reward() {
    const s = this.room!.state;
    if (this.rewarded || s.phase !== 'done') return;
    this.rewarded = true;
    const won = s.winners.includes(this.room!.sessionId);
    store.update({ dollars: store.save.dollars + (won ? 5 : 2) });
    toast(won ? '🏆 Du vandt! 💲5' : 'Godt kæmpet! 💲2');
    void narrator.play(line(won ? 'vandt' : 'slut'));
  }

  /** Called when the room's `last` throw changes: animate the new horseshoe. */
  private watchThrows() {
    const s = this.room?.state;
    if (!s || s.last.seq === this.lastSeq) return;
    this.lastSeq = s.last.seq;
    const from = this.toWorld(0, 0.3);
    from.y += 1.4;
    const to = this.toWorld(s.last.x, s.last.z);
    to.y += 0.06;
    const shoe = horseshoeMesh();
    shoe.position.copy(from);
    this.game.addToScene(shoe);
    this.flying = {
      obj: shoe,
      from,
      to,
      t: 0,
      label: s.last.label,
      mine: s.last.by === this.room!.sessionId,
    };
    this.render();
  }

  private startLoop() {
    this.lastFrame = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - this.lastFrame) / 1000, 0.1);
      this.lastFrame = now;
      this.update(dt);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private update(dt: number) {
    // Aiming turns the camera within the allowed arc.
    if (this.myTurn && this.aimInput) {
      this.aim = THREE.MathUtils.clamp(
        this.aim + this.aimInput * dt * 0.5,
        -HORSESHOE.maxAim,
        HORSESHOE.maxAim,
      );
      this.game.setYaw(this.baseYaw() - this.aim);
    }
    if (this.charging) this.meterFill.style.width = `${this.power() * 100}%`;
    const f = this.flying;
    if (f) {
      f.t = Math.min(1, f.t + dt / 1.1);
      f.obj.position.lerpVectors(f.from, f.to, f.t);
      f.obj.position.y += Math.sin(f.t * Math.PI) * 3.2;
      f.obj.rotation.y += dt * 9;
      f.obj.rotation.x = f.t < 1 ? 0.4 : -Math.PI / 2;
      if (f.t >= 1) {
        f.obj.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI);
        this.landed.push(f.obj);
        this.flying = null;
        toast(
          `${this.room?.state.players.get(this.room.state.last.by)?.nickname ?? ''}: ${LABELS[f.label]}`,
          2200,
        );
        void narrator.play(line(f.label));
        this.render();
      }
    }
  }

  /** Follows wall-clock time, so the meter feels the same on slow and fast devices. */
  private power(): number {
    const held = (performance.now() - this.chargeStart) / 1000;
    return (1 - Math.cos((held / METER_PERIOD) * Math.PI * 2)) / 2;
  }

  private startCharge() {
    if (!this.myTurn || this.charging) return;
    this.charging = true;
    this.chargeStart = performance.now();
  }

  private release() {
    if (!this.charging) return;
    this.charging = false;
    if (!this.myTurn) return;
    this.room?.send('throw', { power: this.power(), aim: this.aim });
    this.meterFill.style.width = '0%';
  }

  private baseYaw(): number {
    const d = this.spots.pitDir;
    return Math.atan2(-d.x, -d.z);
  }

  /** Pit-local (x sideways, z along the pit) to world coordinates. */
  private toWorld(x: number, z: number): THREE.Vector3 {
    const d = this.spots.pitDir;
    const right = new THREE.Vector3(-d.z, 0, d.x);
    const p = this.spots.pitStart.clone().addScaledVector(d, z).addScaledVector(right, x);
    p.y = heightAt(p.x, p.z);
    return p;
  }

  private standAtLine() {
    const p = this.toWorld(0, -0.6);
    this.game.setView(p.x, p.z, this.baseYaw() - this.aim, -0.08);
  }

  /** Watch from beside the throw line while others throw. */
  private spectate() {
    // Behind and to the side, so both the thrower and the stake are in view.
    const p = this.toWorld(2.6, -5);
    const stake = this.spots.pitStake;
    this.game.setView(p.x, p.z, Math.atan2(-(stake.x - p.x), -(stake.z - p.z)), -0.12);
  }

  private clearLanded() {
    for (const o of this.landed) o.removeFromParent();
    this.landed = [];
  }

  private cleanup() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.flying?.obj.removeFromParent();
    this.clearLanded();
    this.root.remove();
    narrator.stop();
    // Step back off the pit so the prompt doesn't pop up again straight away.
    const p = this.toWorld(4.5, -2.5);
    this.game.setView(p.x, p.z, this.baseYaw() + Math.PI / 2);
    this.game.lockInput(false);
    this.room = null;
  }
}

function line(id: string) {
  const l = script('hestesko').lines.find((x) => x.id === `hestesko.${id}`);
  if (!l) throw new Error(`Missing line hestesko.${id}`);
  return l;
}

function horseshoeMesh(): THREE.Object3D {
  const g = new THREE.Group();
  g.add(
    part(
      new THREE.TorusGeometry(0.22, 0.045, 8, 20, Math.PI * 1.6),
      '#8d8d94',
      [0, 0, 0],
      [0, 0, Math.PI * 0.7],
    ),
  );
  return outline(g, 0.015);
}
