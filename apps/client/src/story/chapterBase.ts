import * as THREE from 'three';
import type { SpeakerId } from '@western/shared';
import type { Game } from '../game/game.js';
import { updater } from '../pwa/updater.js';
import { store } from '../save/store.js';
import type { Hud } from '../ui/hud.js';
import { h } from '../ui/dom.js';
import { toast } from '../ui/toast.js';
import { DialogueRunner } from './dialogue.js';
import { script } from './scripts.js';

export interface StepInfo {
  objective: string;
  /** Where the "!" marker hovers (height above a named spot). */
  marker?: { spot: string; height: number };
  /** Walk up to this spot and press E / tap the prompt. */
  interact?: { spot: string; radius: number; label: string };
  /** Reaching this spot triggers `onReach` automatically. */
  reach?: { spot: string; radius: number };
}

export interface CardButton {
  label: string;
  primary?: boolean;
  action?: () => void;
}

/**
 * Shared machinery for a chapter: quest steps saved per chapter, the objective
 * line, the "!" marker, the "Tal med…" prompt, voiced conversations with the
 * camera turned to the speaker, and the chapter-complete card.
 */
export abstract class ChapterBase<S extends string> {
  protected dialogue = new DialogueRunner();
  protected busy = false;
  private prompt: HTMLButtonElement;
  private promptFor: S | null = null;
  private static lookHintShown = false;
  private onKey = (e: KeyboardEvent) => {
    if (e.code === 'KeyE' && !this.prompt.hidden && !this.dialogue.active) void this.runInteract();
  };

  constructor(
    protected game: Game,
    protected hud: Hud,
    /** Save key, e.g. "k1". */
    protected key: string,
    protected steps: Record<S, StepInfo>,
    /** Step order; the first one is the intro that plays automatically. */
    protected order: S[],
  ) {
    this.prompt = h('button', { class: 'interact-prompt', hidden: true });
    this.prompt.onclick = () => void this.runInteract();
    document.body.append(this.prompt);
    window.addEventListener('keydown', this.onKey);
  }

  /** Remove UI and listeners (when travelling to another region). */
  dispose() {
    this.prompt.remove();
    window.removeEventListener('keydown', this.onKey);
  }

  get isBusy(): boolean {
    return this.busy;
  }

  get step(): S {
    const s = store.save.progress.steps[this.key] as S | undefined;
    return s && s in this.steps ? s : this.order[0]!;
  }

  /** Called when play starts or resumes in this chapter's region. */
  start() {
    this.onStart();
    this.applyStep();
    if (this.step === this.order[0] && !this.busy) void this.runIntro();
  }

  /** Called every frame while playing. */
  update() {
    if (this.busy) return;
    const info = this.steps[this.step];
    const player = this.game.playerPosition;
    if (info.reach) {
      const spot = this.spot(info.reach.spot);
      if (spot && player.distanceTo(spot) < info.reach.radius)
        void this.guard(() => this.onReach(this.step));
    }
    let show = false;
    if (info.interact) {
      const spot = this.spot(info.interact.spot);
      show = !!spot && player.distanceTo(spot) < info.interact.radius;
    }
    if (show !== !this.prompt.hidden || this.promptFor !== this.step) {
      this.prompt.hidden = !show;
      this.promptFor = this.step;
      const touch = matchMedia('(pointer: coarse)').matches;
      this.prompt.textContent = `💬 ${info.interact?.label ?? ''}${touch ? '' : '  [E]'}`;
    }
    this.onUpdate();
  }

  /** Start the chapter over (keeps money, stars and earlier choices). */
  restart() {
    const progress = store.save.progress;
    store.update({
      progress: { ...progress, steps: { ...progress.steps, [this.key]: this.order[0]! } },
    });
  }

  // --- Hooks for concrete chapters -------------------------------------------------

  protected abstract introScript: string;
  protected abstract onInteract(step: S): Promise<void>;
  protected onReach(_step: S): Promise<void> {
    return Promise.resolve();
  }
  /** Sync the world with the saved progress (e.g. a repaired wheel). */
  protected onStart() {}
  protected onUpdate() {}
  /** Where each speaker is, so the camera can turn towards them. */
  protected abstract speakerPosition(speaker: SpeakerId): THREE.Vector3 | null;

  // --- Helpers ---------------------------------------------------------------------

  protected spot(name: string): THREE.Vector3 | undefined {
    return name === 'kanel' ? this.game.world.kanelPosition() : this.game.world.spots[name];
  }

  protected hasFlag(flag: string): boolean {
    return store.save.progress.flags.includes(flag);
  }

  protected addFlags(...flags: string[]) {
    const progress = store.save.progress;
    store.update({ progress: { ...progress, flags: [...new Set([...progress.flags, ...flags])] } });
  }

  protected reached(step: S): boolean {
    return this.order.indexOf(this.step) >= this.order.indexOf(step);
  }

  protected setStep(step: S, flags: string[] = []) {
    const progress = store.save.progress;
    store.update({
      progress: {
        steps: { ...progress.steps, [this.key]: step },
        flags: [...new Set([...progress.flags, ...flags])],
      },
    });
    this.applyStep();
  }

  protected applyStep() {
    const info = this.steps[this.step];
    this.hud.setObjective(this.objectiveText(info) || null);
    const marker = info.marker && this.spot(info.marker.spot);
    this.game.setMarker(
      marker ? new THREE.Vector3(marker.x, marker.y + info.marker!.height, marker.z) : null,
    );
    this.prompt.hidden = true;
    this.promptFor = null;
  }

  /** Objective text; chapters can add live details (e.g. "2/3 billeder"). */
  protected objectiveText(info: StepInfo): string {
    return info.objective;
  }

  private async runIntro() {
    await this.talk(this.introScript);
    this.setStep(this.order[1]!);
  }

  private async runInteract() {
    if (this.busy) return;
    await this.guard(() => this.onInteract(this.step));
  }

  /** Runs an activity with the prompt and marker hidden; only one at a time. */
  private async guard(fn: () => Promise<void>) {
    if (this.busy) return;
    await fn();
  }

  /** Plays a conversation with input frozen and the camera turned to whoever speaks. */
  protected async talk(id: string): Promise<string[]> {
    return this.busyWhile(() =>
      this.dialogue.run(script(id), { onSpeaker: (s) => this.lookAt(s) }),
    );
  }

  /** Plays only some lines of a script (e.g. the instructions, not the reactions). */
  protected async talkLines(id: string, lineIds: string[]): Promise<string[]> {
    const full = script(id);
    const wanted = new Set(lineIds.map((l) => `${id}.${l}`));
    return this.busyWhile(() =>
      this.dialogue.run(
        { ...full, lines: full.lines.filter((l) => wanted.has(l.id)) },
        { onSpeaker: (s) => this.lookAt(s) },
      ),
    );
  }

  /** Freeze the player, hide prompts and the marker while `fn` runs (talks, minigames). */
  protected async busyWhile<T>(fn: () => Promise<T>): Promise<T> {
    const nested = this.busy;
    this.busy = true;
    this.prompt.hidden = true;
    this.game.setMarker(null);
    this.game.lockInput(true);
    this.hud.setTalking(true);
    try {
      return await fn();
    } finally {
      if (!nested) {
        this.game.lockInput(false);
        this.hud.setTalking(false);
        this.busy = false;
        this.applyStep();
        if (!ChapterBase.lookHintShown && matchMedia('(pointer: fine)').matches) {
          ChapterBase.lookHintShown = true;
          toast('Klik for at se dig omkring igen');
        }
      }
    }
  }

  private lookAt(speaker: SpeakerId) {
    const at = this.speakerPosition(speaker);
    this.game.faceTowards(
      at ? new THREE.Vector3(at.x, at.y + (speaker === 'kanel' ? 2.1 : 1.7), at.z) : null,
    );
  }

  /** "Kapitel N klaret!" card: a natural pause, so it's also a safe point for updates. */
  protected showChapterCard(
    kicker: string,
    title: string,
    text: string,
    buttons: CardButton[],
  ): Promise<void> {
    return new Promise((resolve) => {
      this.game.lockInput(true);
      updater.setSafe(true);
      const card = h('div', { class: 'chapter-card' });
      const close = (action?: () => void) => {
        card.remove();
        updater.setSafe(false);
        this.game.lockInput(false);
        resolve();
        action?.();
      };
      const btns = buttons.map((b) => {
        const el = h('button', { class: b.primary ? 'btn btn-big' : 'btn' }, b.label);
        el.onclick = () => close(b.action);
        return el;
      });
      card.append(
        h(
          'div',
          { class: 'panel' },
          h('p', { class: 'chapter-kicker' }, kicker),
          h('h2', {}, title),
          h('p', { class: 'chapter-stats' }, `⭐ ${store.save.stars}   💲 ${store.save.dollars}`),
          h('p', {}, text),
          h('div', { class: 'menu' }, ...btns),
        ),
      );
      document.body.append(card);
    });
  }
}
