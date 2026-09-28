import type * as THREE from 'three';
import type { SpeakerId } from '@western/shared';
import { SUNSET_TUNE, tune } from '../audio/sfx.js';
import type { Game } from '../game/game.js';
import { playLasso } from '../minigames/lasso.js';
import { playMorse } from '../minigames/morse.js';
import { playTrackLaying } from '../minigames/tracklay.js';
import { store } from '../save/store.js';
import type { Hud } from '../ui/hud.js';
import { toast } from '../ui/toast.js';
import { ChapterBase, type StepInfo } from './chapterBase.js';

type Step = 'intro' | 'meet-li' | 'track' | 'ceremony' | 'nagle' | 'done';

const STEPS: Record<Step, StepInfo> = {
  intro: { objective: '' },
  'meet-li': {
    objective: 'Find Formand Li ved enden af sporet',
    marker: { spot: 'li', height: 2.9 },
    interact: { spot: 'li', radius: 3.6, label: 'Tal med Formand Li' },
  },
  track: {
    objective: 'Hjælp Lis sjak med at lægge de sidste skinner',
    marker: { spot: 'li', height: 2.9 },
    interact: { spot: 'li', radius: 3.6, label: 'Læg skinner' },
  },
  ceremony: {
    objective: 'Gå op til de to lokomotiver. Ceremonien begynder!',
    marker: { spot: 'ceremony', height: 2.6 },
    interact: { spot: 'ceremony', radius: 5, label: 'Se ceremonien' },
  },
  nagle: {
    objective: 'Slå den gyldne nagle i den sidste svelle',
    marker: { spot: 'tie', height: 1.6 },
    interact: { spot: 'tie', radius: 3.5, label: 'Slå naglen i' },
  },
  done: { objective: 'Du har klaret hele rejsen! Besøg byerne, og spil med dine venner.' },
};

/** Chapter 6 – "Promontory": the last track, the brothers' final try, the golden nail. */
export class Chapter6 extends ChapterBase<Step> {
  protected introScript = 'k6-intro';

  constructor(game: Game, hud: Hud) {
    super(game, hud, 'k6', STEPS, ['intro', 'meet-li', 'track', 'ceremony', 'nagle', 'done']);
  }

  protected override onStart() {
    const w = this.game.world;
    w.setKanelFollow?.(true);
    const after = this.step === 'done';
    w.setMood(after ? 'sunset' : 'day');
    w.setBrothers?.(this.hasFlag('k6-lasso') ? 'caught' : 'hidden');
    w.setNail?.(this.hasFlag('k6-nagle'));
  }

  protected speakerPosition(speaker: SpeakerId): THREE.Vector3 | null {
    const spots = this.game.world.spots;
    if (speaker === 'li') return spots.li ?? null;
    if (speaker === 'pind') return spots.pind ?? null;
    if (speaker === 'telegrafist') return spots.ruth ?? null;
    if (speaker === 'lilleboevl' || speaker === 'storeboevl') return spots.tie ?? null;
    if (speaker === 'kanel') return this.game.world.kanelPosition();
    return null;
  }

  protected async onInteract(step: Step) {
    switch (step) {
      case 'meet-li':
        this.setStep('track', await this.talk('k6-li'));
        break;
      case 'track':
        await this.layTrack();
        break;
      case 'ceremony':
        await this.ceremony();
        break;
      case 'nagle':
        await this.goldenNail();
        break;
    }
  }

  private async layTrack() {
    await this.busyWhile(async () => {
      await this.talk('k6-skinner');
      const { seconds, mistakes } = await playTrackLaying();
      if (!this.hasFlag('k6-skinner')) {
        const star = mistakes <= 1 && seconds < 60;
        store.update({
          dollars: store.save.dollars + 10,
          stars: store.save.stars + (star ? 1 : 0),
        });
        toast(star ? 'Lynhurtig banearbejder! 💲10 og ⭐' : 'Sporet er lagt! 💲10');
      }
      await this.talk('k6-skinner-klar');
      this.setStep('ceremony', ['k6-skinner']);
    });
  }

  private async ceremony() {
    const w = this.game.world;
    await this.busyWhile(async () => {
      w.setBrothers?.('ceremony');
      await this.talk('k6-ceremoni');
      await this.talk('k6-lasso');
      const { throws } = await playLasso();
      await this.fade('Fanget!', () => w.setBrothers?.('caught'));
      if (!this.hasFlag('k6-lasso')) {
        const star = throws <= 6;
        store.update({
          dollars: store.save.dollars + 10,
          stars: store.save.stars + (star ? 1 : 0),
        });
        toast(star ? 'Sikker lassokaster! 💲10 og ⭐' : 'Alle fire fanget! 💲10');
      }
      await this.talk('k6-lasso-klar');
      toast('🪙 Pind giver dig den gyldne nagle');
      this.setStep('nagle', ['k6-lasso']);
    });
  }

  private async goldenNail() {
    const w = this.game.world;
    await this.busyWhile(async () => {
      await this.talkLines('k6-nagle', ['dig']);
      w.setNail?.(true);
      await this.talkLines('k6-nagle', ['slag', 'done']);
      const { mistakes } = await playMorse('DONE', 'Send DONE til hele Amerika');
      if (!this.hasFlag('k6-nagle')) {
        const star = mistakes === 0;
        store.update({
          dollars: store.save.dollars + 15,
          stars: store.save.stars + (star ? 1 : 0),
        });
        toast(star ? 'Perfekt telegram! 💲15 og ⭐' : 'Telegrammet er sendt! 💲15');
      }
      await this.talk('k6-done-klar');
      // The epilogue: ride west into the sunset.
      await this.fade('Samme aften …', () => {
        w.setMood('sunset');
        const s = w.spots.sunset;
        if (s) this.game.setView(s.x, s.z, 0);
      });
      tune(SUNSET_TUNE, 84);
      await this.talk('k6-slut');
      await new Promise((r) => setTimeout(r, 800));
      const first = !this.hasFlag('k6-klaret');
      store.update({
        chapter: Math.max(store.save.chapter, 7),
        stars: store.save.stars + (first ? 1 : 0),
      });
      this.setStep('done', ['k6-nagle', 'k6-klaret']);
    });
    await this.showChapterCard(
      'Slut',
      'Kanel og Grønskollingen',
      'Tak fordi du red med! Du kan altid rejse tilbage til byerne og spille med dine venner.',
      [{ label: 'Fortsæt', primary: true }],
    );
  }
}
