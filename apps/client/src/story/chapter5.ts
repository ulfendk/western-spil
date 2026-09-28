import type * as THREE from 'three';
import type { SpeakerId } from '@western/shared';
import type { Game } from '../game/game.js';
import { playBridge } from '../minigames/bridge.js';
import { playGoldPan } from '../minigames/goldpan.js';
import { playMineRide } from '../minigames/minecart.js';
import { store } from '../save/store.js';
import type { Hud } from '../ui/hud.js';
import { toast } from '../ui/toast.js';
import { ChapterBase, type StepInfo } from './chapterBase.js';

type Step = 'intro' | 'find-morten' | 'gold' | 'bridge' | 'mine' | 'done';

const STEPS: Record<Step, StepInfo> = {
  intro: { objective: '' },
  'find-morten': {
    objective: 'Find Formand Morten på torvet i Sølvkløften',
    marker: { spot: 'morten', height: 2.9 },
    interact: { spot: 'morten', radius: 3.4, label: 'Tal med Morten' },
  },
  gold: {
    objective: 'Vask guld i åen nord for byen',
    marker: { spot: 'creek', height: 2.5 },
    interact: { spot: 'creek', radius: 4.5, label: 'Vask guld' },
  },
  bridge: {
    objective: 'Gå over hængebroen til sølvminen',
    marker: { spot: 'bridgeStart', height: 2.8 },
    interact: { spot: 'bridgeStart', radius: 4, label: 'Gå over hængebroen' },
  },
  mine: {
    objective: 'Hop i minevognen ved sølvminen',
    marker: { spot: 'mine', height: 3.5 },
    interact: { spot: 'mine', radius: 5, label: 'Hop i minevognen' },
  },
  done: { objective: 'Rejs videre mod vest til Promontory, når du er klar' },
};

/** Chapter 5 – "Klippebjergene": Sølvkløften, gold panning, the rope bridge and the mine. */
export class Chapter5 extends ChapterBase<Step> {
  protected introScript = 'k5-intro';

  constructor(
    game: Game,
    hud: Hud,
    private travelOn: () => void,
  ) {
    super(game, hud, 'k5', STEPS, ['intro', 'find-morten', 'gold', 'bridge', 'mine', 'done']);
  }

  protected override onStart() {
    this.game.world.setMood('day');
    this.game.world.setKanelFollow?.(true);
    // After the mine you're on the far side of the ridge.
    if (this.step === 'done') {
      const exit = this.game.world.spots.exit;
      if (exit) this.game.setView(exit.x, exit.z, 0);
    }
  }

  protected speakerPosition(speaker: SpeakerId): THREE.Vector3 | null {
    if (speaker === 'morten') return this.game.world.spots.morten ?? null;
    if (speaker === 'kanel') return this.game.world.kanelPosition();
    return null;
  }

  protected async onInteract(step: Step) {
    switch (step) {
      case 'find-morten':
        this.setStep('gold', await this.talk('k5-morten'));
        break;
      case 'gold':
        await this.busyWhile(async () => {
          await this.talk('k5-guld');
          const { seconds } = await playGoldPan();
          if (!this.hasFlag('k5-guld')) {
            const star = seconds < 75;
            store.update({
              dollars: store.save.dollars + 10,
              stars: store.save.stars + (star ? 1 : 0),
            });
            toast(star ? `Hurtige guldfingre! 💲10 og ⭐` : 'Guld! 💲10');
          }
          await this.talk('k5-guld-klar');
          toast('🏮 Du fik Mortens lygte');
          this.setStep('bridge', ['k5-guld', 'lygte']);
        });
        break;
      case 'bridge':
        await this.crossBridge();
        break;
      case 'mine':
        await this.rideMine();
        break;
    }
  }

  private async crossBridge() {
    const w = this.game.world;
    const start = w.spots.bridgeStart;
    const end = w.spots.bridgeEnd;
    if (!start || !end) return;
    await this.busyWhile(async () => {
      await this.talk('k5-bro');
      w.setKanelFollow?.(false);
      const { wobbles } = await playBridge(this.game, start, end, (a) => w.bridge?.setSway(a));
      if (!this.hasFlag('k5-bro')) {
        const star = wobbles <= 1;
        store.update({ dollars: store.save.dollars + 5, stars: store.save.stars + (star ? 1 : 0) });
        toast(star ? 'Balancekunstner! 💲5 og ⭐' : 'Over broen! 💲5');
      }
      w.setKanelFollow?.(true);
      await this.talk('k5-bro-klar');
      toast('📦 Kassen er væk!');
      this.setStep('mine', ['k5-bro', 'kassen-stjaalet']);
    });
  }

  private async rideMine() {
    const w = this.game.world;
    await this.busyWhile(async () => {
      await this.talkLines('k5-mine', ['start']);
      w.setKanelFollow?.(false);
      const { bumps, wrongTurns } = await playMineRide(this.game);
      await this.fade('Ud i lyset …', () => {
        w.setMood('day');
        const exit = w.spots.exit!;
        this.game.setView(exit.x, exit.z, 0);
        w.setKanelFollow?.(true);
      });
      if (!this.hasFlag('k5-mine')) {
        const star = bumps + wrongTurns <= 1;
        store.update({
          dollars: store.save.dollars + 10,
          stars: store.save.stars + (star ? 1 : 0),
        });
        toast(star ? 'Flot kørt! 💲10 og ⭐' : 'Gennem minen! 💲10');
      }
      await this.talk('k5-mine-klar');
      await this.talk('k5-slut');
      const first = !this.hasFlag('k5-klaret');
      store.update({
        chapter: Math.max(store.save.chapter, 6),
        stars: store.save.stars + (first ? 1 : 0),
      });
      this.setStep('done', ['k5-mine', 'k5-klaret']);
    });
    await this.showChapterCard(
      'Kapitel 5',
      'Klippebjergene',
      'Du kom igennem bjerget! Nu venter det sidste kapitel: Promontory.',
      [
        { label: 'Rejs videre til Promontory 🐴', primary: true, action: this.travelOn },
        { label: 'Bliv lidt i bjergene' },
      ],
    );
  }
}
