import type * as THREE from 'three';
import type { SpeakerId } from '@western/shared';
import type { Game } from '../game/game.js';
import { playStars } from '../minigames/stars.js';
import { playTracks } from '../minigames/tracks.js';
import { store } from '../save/store.js';
import type { Hud } from '../ui/hud.js';
import { toast } from '../ui/toast.js';
import { ChapterBase, type StepInfo } from './chapterBase.js';

type Step = 'intro' | 'storm' | 'mato' | 'tracks' | 'water' | 'bring' | 'stars' | 'done';

const STEPS: Record<Step, StepInfo> = {
  intro: { objective: '' },
  storm: {
    objective: 'Gå mod lyset langt fremme',
    marker: { spot: 'storm', height: 3 },
    reach: { spot: 'storm', radius: 7 },
  },
  mato: {
    objective: 'Hils på Wanblis bedstefar, Mato',
    marker: { spot: 'mato', height: 2.8 },
    interact: { spot: 'mato', radius: 3.4, label: 'Hils på Mato' },
  },
  tracks: {
    objective: 'Følg Wanbli ned til sporene ved floden',
    marker: { spot: 'tracks', height: 2.5 },
    interact: { spot: 'tracks', radius: 4.5, label: 'Læs sporene' },
  },
  water: {
    objective: 'Hent vand i floden',
    marker: { spot: 'water', height: 2.5 },
    interact: { spot: 'water', radius: 4, label: 'Fyld spanden' },
  },
  bring: {
    objective: 'Bring vandet til Wanbli',
    marker: { spot: 'wanbli', height: 2.3 },
    interact: { spot: 'wanbli', radius: 3.4, label: 'Giv Wanbli vandet' },
  },
  stars: {
    objective: 'Sæt dig ved bålet',
    marker: { spot: 'fire', height: 2.5 },
    interact: { spot: 'fire', radius: 5, label: 'Sæt dig ved bålet' },
  },
  done: { objective: 'Rejs videre mod vest, når du er klar. Kapitel 5 er på vej!' },
};

/** Chapter 4 – "Lejren": lost in a storm, welcomed in a Lakota camp. */
export class Chapter4 extends ChapterBase<Step> {
  protected introScript = 'k4-intro';

  constructor(game: Game, hud: Hud) {
    super(game, hud, 'k4', STEPS, [
      'intro',
      'storm',
      'mato',
      'tracks',
      'water',
      'bring',
      'stars',
      'done',
    ]);
  }

  protected override onStart() {
    const early = this.step === 'intro' || this.step === 'storm';
    this.game.world.setMood(early ? 'storm' : this.step === 'stars' ? 'night' : 'day');
    this.game.world.setWanbli?.(early ? 'storm' : 'camp');
  }

  protected speakerPosition(speaker: SpeakerId): THREE.Vector3 | null {
    const spots = this.game.world.spots;
    if (speaker === 'wanbli') return spots.wanbli ?? null;
    if (speaker === 'mato') return spots.mato ?? null;
    if (speaker === 'kanel') return this.game.world.kanelPosition();
    return null;
  }

  protected override async onReach(step: Step) {
    if (step !== 'storm') return;
    await this.talk('k4-wanbli');
    await this.fade('Næste morgen …', () => {
      this.game.world.setMood('day');
      this.game.world.setWanbli?.('camp');
      const camp = this.game.world.spots.camp!;
      const fire = this.game.world.spots.fire!;
      this.game.setView(camp.x, camp.z, Math.atan2(-(fire.x - camp.x), -(fire.z - camp.z)));
    });
    await this.talk('k4-morgen');
    this.setStep('mato');
  }

  protected async onInteract(step: Step) {
    switch (step) {
      case 'mato':
        this.setStep('tracks', await this.talk('k4-mato'));
        break;
      case 'tracks':
        await this.busyWhile(async () => {
          await this.talkLines('k4-spor', ['start']);
          const { mistakes } = await playTracks();
          if (!this.hasFlag('k4-spor')) {
            const star = mistakes <= 2;
            store.update({
              dollars: store.save.dollars + 10,
              stars: store.save.stars + (star ? 1 : 0),
            });
            toast(star ? 'Skarpe øjne! 💲10 og ⭐' : `Du kender sporene! 💲10`);
          }
          await this.talk('k4-spor-klar');
          this.setStep('water', ['k4-spor']);
        });
        break;
      case 'water':
        toast('🪣 Spanden er fyldt med koldt vand');
        this.setStep('bring');
        break;
      case 'bring':
        await this.talk('k4-vand');
        await this.fade('Om aftenen …', () => this.game.world.setMood('night'));
        this.setStep('stars');
        break;
      case 'stars':
        await this.stars();
        break;
    }
  }

  private async stars() {
    await this.busyWhile(async () => {
      await this.talk('k4-stjerner');
      const { mistakes } = await playStars();
      if (!this.hasFlag('k4-stjerner')) {
        const star = mistakes <= 2;
        store.update({ dollars: store.save.dollars + 5, stars: store.save.stars + (star ? 1 : 0) });
        toast(star ? 'Du kan stjernerne! 💲5 og ⭐' : 'Karlsvognen fundet! 💲5');
      }
      await this.talk('k4-stjerner-klar');
      await this.fade('Næste morgen …', () => this.game.world.setMood('day'));
      await this.talk('k4-slut');
      toast('📿 Du fik et armbånd med perler af Wanbli');
      const first = !this.hasFlag('k4-klaret');
      store.update({
        chapter: Math.max(store.save.chapter, 5),
        stars: store.save.stars + (first ? 1 : 0),
      });
      this.setStep('done', ['k4-stjerner', 'k4-klaret', 'armbaand']);
    });
    await this.showChapterCard(
      'Kapitel 4',
      'Lejren',
      'Tak, fordi du hjalp til i lejren. Kapitel 5 – Klippebjergene – er på vej.',
      [{ label: 'Fortsæt', primary: true }],
    );
  }
}
