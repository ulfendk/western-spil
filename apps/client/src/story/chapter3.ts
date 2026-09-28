import type * as THREE from 'three';
import type { SpeakerId } from '@western/shared';
import type { Game } from '../game/game.js';
import { playMorse } from '../minigames/morse.js';
import { playParade } from '../minigames/parade.js';
import { store } from '../save/store.js';
import type { Hud } from '../ui/hud.js';
import { toast } from '../ui/toast.js';
import { ChapterBase, type StepInfo } from './chapterBase.js';

type Step = 'intro' | 'find-sergeant' | 'find-ruth' | 'find-cut' | 'morse' | 'parade' | 'done';

const STEPS: Record<Step, StepInfo> = {
  intro: { objective: '' },
  'find-sergeant': {
    objective: 'Tal med sergenten ved fortets port',
    marker: { spot: 'sergeant', height: 2.9 },
    interact: { spot: 'sergeant', radius: 3.4, label: 'Tal med Sergent Holm' },
  },
  'find-ruth': {
    objective: 'Find telegrafisten inde i fortet',
    marker: { spot: 'ruth', height: 2.7 },
    interact: { spot: 'ruth', radius: 3.4, label: 'Tal med Ruth' },
  },
  'find-cut': {
    objective: 'Følg telegrafpælene langs jernbanen og find den klippede ledning',
    marker: { spot: 'cut', height: 3.5 },
    interact: { spot: 'cut', radius: 5, label: 'Splejs ledningen' },
  },
  morse: {
    objective: 'Gå tilbage til Ruth og send advarslen',
    marker: { spot: 'ruth', height: 2.7 },
    interact: { spot: 'ruth', radius: 3.4, label: 'Send beskeden' },
  },
  parade: {
    objective: 'Stil op til parade på paradepladsen',
    marker: { spot: 'parade', height: 3 },
    interact: { spot: 'parade', radius: 7, label: 'Start paraden' },
  },
  done: { objective: 'Kast hestesko med soldaterne. Kapitel 4 er på vej!' },
};

/** Chapter 3 – "Fortet": the cut telegraph line, Morse code and the parade. */
export class Chapter3 extends ChapterBase<Step> {
  protected introScript = 'k3-intro';

  constructor(game: Game, hud: Hud) {
    super(game, hud, 'k3', STEPS, [
      'intro',
      'find-sergeant',
      'find-ruth',
      'find-cut',
      'morse',
      'parade',
      'done',
    ]);
  }

  protected override onStart() {
    this.game.world.setWireFixed?.(this.reached('morse'));
  }

  protected speakerPosition(speaker: SpeakerId): THREE.Vector3 | null {
    const spots = this.game.world.spots;
    if (speaker === 'sergent') return spots.sergeant ?? null;
    if (speaker === 'telegrafist') return spots.ruth ?? null;
    if (speaker === 'kanel') return this.game.world.kanelPosition();
    return null;
  }

  protected async onInteract(step: Step) {
    switch (step) {
      case 'find-sergeant':
        this.setStep('find-ruth', await this.talk('k3-sergent'));
        break;
      case 'find-ruth':
        this.setStep('find-cut', await this.talk('k3-telegraf'));
        break;
      case 'find-cut':
        await this.talk('k3-ledning');
        this.game.world.setWireFixed?.(true);
        toast('🔧 Ledningen er splejset');
        this.setStep('morse', ['k3-ledning']);
        break;
      case 'morse':
        await this.telegraph();
        break;
      case 'parade':
        await this.parade();
        break;
    }
  }

  private async telegraph() {
    await this.busyWhile(async () => {
      await this.talk('k3-morse');
      const practice = await playMorse('SOS', 'Øvelse: SOS');
      await this.talk('k3-morse-besked');
      const message = await playMorse('FIRE HATTE', 'Advarsel mod vest');
      const mistakes = practice.mistakes + message.mistakes;
      if (!this.hasFlag('k3-morse')) {
        const star = mistakes <= 3;
        store.update({
          dollars: store.save.dollars + 10,
          stars: store.save.stars + (star ? 1 : 0),
        });
        toast(
          star ? `Fejlfri telegrafist! 💲10 og ⭐` : `Beskeden er sendt! 💲10 (${mistakes} fejl)`,
        );
      }
      await this.talk('k3-morse-klar');
      this.setStep('parade', ['k3-morse']);
    });
  }

  private async parade() {
    const fort = this.game.world.fort;
    if (!fort) return;
    await this.busyWhile(async () => {
      await this.talk('k3-parade');
      const { hits, total } = await playParade(fort, (x, z, yaw, pitch) =>
        this.game.setView(x, z, yaw, pitch),
      );
      if (!this.hasFlag('k3-parade')) {
        const star = hits >= total * 0.8;
        store.update({
          dollars: store.save.dollars + 10,
          stars: store.save.stars + (star ? 1 : 0),
        });
        toast(
          star
            ? `Flot takt! 💲10 og ⭐ (${hits}/${total})`
            : `Paraden er slut! 💲10 (${hits}/${total})`,
        );
      }
      await this.talk('k3-parade-klar');
      this.addFlags('k3-parade');
      await this.finishChapter();
    });
  }

  private async finishChapter() {
    await this.talk('k3-slut');
    const first = !this.hasFlag('k3-klaret');
    store.update({
      chapter: Math.max(store.save.chapter, 4),
      stars: store.save.stars + (first ? 1 : 0),
    });
    this.setStep('done', ['k3-klaret']);
    await this.showChapterCard(
      'Kapitel 3',
      'Fortet',
      'Du reddede telegrafen! Kapitel 4 er på vej. Imens kan du kaste hestesko med soldaterne.',
      [{ label: 'Fortsæt', primary: true }],
    );
  }
}
