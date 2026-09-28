import * as THREE from 'three';
import type { SpeakerId } from '@western/shared';
import type { Game } from '../game/game.js';
import { drawWantedPoster } from '../game/world/camp.js';
import { playPacking } from '../minigames/packing.js';
import { updater } from '../pwa/updater.js';
import { store } from '../save/store.js';
import type { Hud } from '../ui/hud.js';
import { h } from '../ui/dom.js';
import { toast } from '../ui/toast.js';
import { DialogueRunner } from './dialogue.js';
import { script } from './scripts.js';

/** Quest steps in chapter 1, in order. Stored in the save as progress.step. */
type Step = 'intro' | 'find-pind' | 'find-kanel' | 'pack' | 'poster' | 'depart' | 'done';

interface StepInfo {
  objective: string;
  /** Where the "!" marker hovers (height above the ground spot). */
  marker?: { spot: keyof Game['world']['spots']; height: number };
  /** Walk up to this spot and press E / tap the prompt. */
  interact?: { spot: keyof Game['world']['spots']; radius: number; label: string };
  /** Reaching this spot triggers the step automatically. */
  reach?: { spot: keyof Game['world']['spots']; radius: number };
}

const STEPS: Record<Step, StepInfo> = {
  intro: { objective: '' },
  'find-pind': {
    objective: 'Tal med Postmester Pind ved lejrbålet',
    marker: { spot: 'pind', height: 2.9 },
    interact: { spot: 'pind', radius: 3.2, label: 'Tal med Pind' },
  },
  'find-kanel': {
    objective: 'Hils på Kanel ved vognen',
    marker: { spot: 'kanel', height: 3.1 },
    interact: { spot: 'kanel', radius: 3.4, label: 'Hils på Kanel' },
  },
  pack: {
    objective: 'Pak vognen',
    marker: { spot: 'wagon', height: 4.2 },
    interact: { spot: 'wagon', radius: 4.5, label: 'Pak vognen' },
  },
  poster: {
    objective: 'Læs plakaten ved skiltet',
    marker: { spot: 'sign', height: 3.4 },
    interact: { spot: 'sign', radius: 3, label: 'Læs plakaten' },
  },
  depart: {
    objective: 'Følg sporet mod vest',
    marker: { spot: 'trailWest', height: 3 },
    reach: { spot: 'trailWest', radius: 8 },
  },
  done: { objective: 'Kapitel 2 kommer snart. Udforsk prærien imens!' },
};

/** Chapter 1 – "Afsked ved St. Louis". Drives objectives, conversations and rewards. */
export class Chapter1 {
  private dialogue = new DialogueRunner();
  private busy = false;
  private lookHintShown = false;
  private prompt: HTMLButtonElement;
  private promptFor: Step | null = null;

  constructor(
    private game: Game,
    private hud: Hud,
  ) {
    this.prompt = h('button', { class: 'interact-prompt', hidden: true });
    this.prompt.onclick = () => void this.interact();
    document.body.append(this.prompt);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE' && !this.prompt.hidden && !this.dialogue.active) void this.interact();
    });
  }

  private get step(): Step {
    const s = store.save.progress.step as Step;
    return s in STEPS ? s : 'intro';
  }

  /** Called when play starts or resumes. */
  start() {
    this.game.world.setPosterVisible(this.reached('poster'));
    this.applyStep();
    if (this.step === 'intro' && !this.busy) void this.runIntro();
  }

  /** Called every frame while playing. */
  update() {
    if (this.busy) return;
    const info = STEPS[this.step];
    const player = this.game.playerPosition;
    if (info.reach) {
      const spot = this.game.world.spots[info.reach.spot];
      if (player.distanceTo(spot) < info.reach.radius) void this.finishChapter();
    }
    let show = false;
    if (info.interact) {
      const spot = this.game.world.spots[info.interact.spot];
      show = player.distanceTo(spot) < info.interact.radius;
    }
    if (show !== !this.prompt.hidden || this.promptFor !== this.step) {
      this.prompt.hidden = !show;
      this.promptFor = this.step;
      const touch = matchMedia('(pointer: coarse)').matches;
      this.prompt.textContent = `💬 ${info.interact?.label ?? ''}${touch ? '' : '  [E]'}`;
    }
  }

  private hasFlag(flag: string): boolean {
    return store.save.progress.flags.includes(flag);
  }

  /** Start the chapter over (keeps money, stars and earlier choices). */
  restart() {
    store.update({ progress: { ...store.save.progress, step: 'intro' } });
  }

  private reached(step: Step): boolean {
    const order = Object.keys(STEPS) as Step[];
    return order.indexOf(this.step) >= order.indexOf(step);
  }

  private setStep(step: Step, flags: string[] = []) {
    const progress = store.save.progress;
    store.update({ progress: { step, flags: [...new Set([...progress.flags, ...flags])] } });
    this.applyStep();
  }

  private applyStep() {
    const info = STEPS[this.step];
    this.hud.setObjective(info.objective || null);
    const marker = info.marker;
    if (marker) {
      const spot = this.game.world.spots[marker.spot];
      this.game.setMarker(new THREE.Vector3(spot.x, spot.y + marker.height, spot.z));
    } else {
      this.game.setMarker(null);
    }
    this.prompt.hidden = true;
    this.promptFor = null;
  }

  private async interact() {
    if (this.busy) return;
    switch (this.step) {
      case 'find-pind': {
        const flags = await this.talk('k1-pind');
        toast('📦 Du fik kassen med den gyldne nagle');
        this.setStep('find-kanel', flags);
        break;
      }
      case 'find-kanel':
        this.setStep('pack', await this.talk('k1-kanel'));
        break;
      case 'pack':
        await this.pack();
        break;
      case 'poster': {
        // Show the poster up close while it's being read.
        const closeUp = h('div', { class: 'poster-closeup' }, drawWantedPoster());
        document.body.append(closeUp);
        try {
          this.setStep('depart', await this.talk('k1-plakat'));
        } finally {
          closeUp.remove();
        }
        break;
      }
    }
  }

  private async runIntro() {
    await this.talk('k1-intro');
    this.setStep('find-pind');
  }

  /** Plays a conversation with input frozen and the camera turned to whoever speaks. */
  private async talk(id: string): Promise<string[]> {
    this.busy = true;
    this.prompt.hidden = true;
    this.game.setMarker(null);
    this.game.lockInput(true);
    this.hud.setTalking(true);
    try {
      return await this.dialogue.run(script(id), { onSpeaker: (s) => this.lookAt(s) });
    } finally {
      this.game.lockInput(false);
      this.hud.setTalking(false);
      this.busy = false;
      this.applyStep();
      if (!this.lookHintShown && matchMedia('(pointer: fine)').matches) {
        this.lookHintShown = true;
        toast('Klik for at se dig omkring igen');
      }
    }
  }

  private lookAt(speaker: SpeakerId) {
    const spots = this.game.world.spots;
    const at = speaker === 'pind' ? spots.pind : speaker === 'kanel' ? spots.kanel : null;
    this.game.faceTowards(
      at ? new THREE.Vector3(at.x, at.y + (speaker === 'kanel' ? 2.1 : 1.8), at.z) : null,
    );
  }

  private async pack() {
    this.busy = true;
    this.prompt.hidden = true;
    this.game.setMarker(null);
    this.game.lockInput(true);
    this.hud.setTalking(true);
    try {
      await this.dialogue.run(script('k1-pak'), { onSpeaker: (s) => this.lookAt(s) });
      const { seconds } = await playPacking();
      const fast = seconds < 90;
      // Rewards only the first time; replaying the chapter is just for fun.
      if (!this.hasFlag('k1-pakket')) {
        store.update({
          dollars: store.save.dollars + 10 + (fast ? 5 : 0),
          stars: store.save.stars + (fast ? 1 : 0),
        });
        toast(
          fast ? `Hurtigt pakket! 💲15 og ⭐ (${Math.round(seconds)} sek.)` : '💲10 til rejsen',
        );
      } else {
        toast(`Pakket på ${Math.round(seconds)} sekunder!`);
      }
      await this.dialogue.run(script('k1-pakket'), { onSpeaker: (s) => this.lookAt(s) });
      this.game.world.setPosterVisible(true);
      this.setStep('poster', fast ? ['k1-pakket', 'pakket-hurtigt'] : ['k1-pakket']);
    } finally {
      this.game.lockInput(false);
      this.hud.setTalking(false);
      this.busy = false;
    }
  }

  private async finishChapter() {
    await this.talk('k1-slut');
    const first = !this.hasFlag('k1-klaret');
    store.update({
      chapter: Math.max(store.save.chapter, 2),
      stars: store.save.stars + (first ? 1 : 0),
    });
    this.setStep('done', ['k1-klaret']);
    await this.showChapterCard();
  }

  /** "Kapitel 1 klaret!" card: a natural pause, so it's also a safe point for updates. */
  private showChapterCard(): Promise<void> {
    return new Promise((resolve) => {
      this.game.lockInput(true);
      updater.setSafe(true);
      const ok = h('button', { class: 'btn btn-big' }, 'Fortsæt');
      const card = h(
        'div',
        { class: 'chapter-card' },
        h(
          'div',
          { class: 'panel' },
          h('p', { class: 'chapter-kicker' }, 'Kapitel 1'),
          h('h2', {}, 'Afsked ved St. Louis'),
          h('p', { class: 'chapter-stats' }, `⭐ ${store.save.stars}   💲 ${store.save.dollars}`),
          h('p', {}, 'Godt klaret, grønskolling! Kapitel 2 – Prærien – er på vej.'),
          ok,
        ),
      );
      document.body.append(card);
      ok.onclick = () => {
        card.remove();
        updater.setSafe(false);
        this.game.lockInput(false);
        resolve();
      };
    });
  }
}
