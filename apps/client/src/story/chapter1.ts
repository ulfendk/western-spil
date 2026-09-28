import type * as THREE from 'three';
import type { SpeakerId } from '@western/shared';
import type { Game } from '../game/game.js';
import { drawWantedPoster } from '../game/world/camp.js';
import { playPacking } from '../minigames/packing.js';
import { store } from '../save/store.js';
import type { Hud } from '../ui/hud.js';
import { h } from '../ui/dom.js';
import { toast } from '../ui/toast.js';
import { ChapterBase, type StepInfo } from './chapterBase.js';

/** Quest steps in chapter 1, in order. */
type Step = 'intro' | 'find-pind' | 'find-kanel' | 'pack' | 'poster' | 'depart' | 'done';

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
  done: { objective: 'Rejs videre mod vest via rejsekortet i pausemenuen' },
};

/** Chapter 1 – "Afsked ved St. Louis". */
export class Chapter1 extends ChapterBase<Step> {
  protected introScript = 'k1-intro';

  constructor(
    game: Game,
    hud: Hud,
    private travelOn: () => void,
  ) {
    super(game, hud, 'k1', STEPS, [
      'intro',
      'find-pind',
      'find-kanel',
      'pack',
      'poster',
      'depart',
      'done',
    ]);
  }

  protected override onStart() {
    this.game.world.setPosterVisible?.(this.reached('poster'));
  }

  protected speakerPosition(speaker: SpeakerId): THREE.Vector3 | null {
    if (speaker === 'pind') return this.game.world.spots.pind ?? null;
    if (speaker === 'kanel') return this.game.world.kanelPosition();
    return null;
  }

  protected async onInteract(step: Step) {
    switch (step) {
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

  protected override async onReach(step: Step) {
    if (step === 'depart') await this.finishChapter();
  }

  private async pack() {
    await this.busyWhile(async () => {
      await this.talk('k1-pak');
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
      await this.talk('k1-pakket');
      this.game.world.setPosterVisible?.(true);
      this.setStep('poster', fast ? ['k1-pakket', 'pakket-hurtigt'] : ['k1-pakket']);
    });
  }

  private async finishChapter() {
    await this.talk('k1-slut');
    const first = !this.hasFlag('k1-klaret');
    store.update({
      chapter: Math.max(store.save.chapter, 2),
      stars: store.save.stars + (first ? 1 : 0),
    });
    this.setStep('done', ['k1-klaret']);
    await this.showChapterCard('Kapitel 1', 'Afsked ved St. Louis', 'Godt klaret, grønskolling!', [
      { label: 'Rejs videre til prærien 🐴', primary: true, action: this.travelOn },
      { label: 'Bliv lidt i St. Louis' },
    ]);
  }
}
