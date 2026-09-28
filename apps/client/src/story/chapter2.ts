import type * as THREE from 'three';
import type { SpeakerId } from '@western/shared';
import type { Game } from '../game/game.js';
import { PhotoCamera } from '../minigames/photo.js';
import { playRiver } from '../minigames/river.js';
import { playWheel } from '../minigames/wheel.js';
import { store } from '../save/store.js';
import type { Hud } from '../ui/hud.js';
import { h } from '../ui/dom.js';
import { toast } from '../ui/toast.js';
import { ChapterBase, type StepInfo } from './chapterBase.js';

type Step = 'intro' | 'find-train' | 'repair' | 'photo' | 'river' | 'town' | 'done';

const PHOTOS_NEEDED = 3;

const STEPS: Record<Step, StepInfo> = {
  intro: { objective: '' },
  'find-train': {
    objective: 'Find vogntoget og tal med familien Jensen',
    marker: { spot: 'jensen', height: 2.6 },
    interact: { spot: 'jensen', radius: 3.4, label: 'Tal med familien Jensen' },
  },
  repair: {
    objective: 'Reparer hjulet på familien Jensens vogn',
    marker: { spot: 'brokenWagon', height: 4.4 },
    interact: { spot: 'brokenWagon', radius: 5, label: 'Reparer hjulet' },
  },
  photo: {
    objective: 'Tag billeder af bisonerne',
    marker: { spot: 'herd', height: 6 },
  },
  river: {
    objective: 'Kør over floden',
    marker: { spot: 'fordEast', height: 3 },
    interact: { spot: 'fordEast', radius: 6, label: 'Kør over floden' },
  },
  town: {
    objective: 'Følg sporet til Støvby',
    marker: { spot: 'townArch', height: 7 },
    reach: { spot: 'townArch', radius: 14 },
  },
  done: { objective: 'Rejs videre mod vest via rejsekortet i pausemenuen' },
};

/** Chapter 2 – "Prærien": the wagon train, bison photos and the river crossing. */
export class Chapter2 extends ChapterBase<Step> {
  protected introScript = 'k2-intro';
  private cameraButton = h(
    'button',
    { class: 'hud-btn camera-btn', title: 'Kamera (C)', hidden: true },
    '📷',
  );
  private camera: PhotoCamera | null = null;
  private onCameraKey = (e: KeyboardEvent) => {
    if (e.code === 'KeyC' && !this.cameraButton.hidden && !this.camera) void this.openCamera();
  };

  constructor(
    game: Game,
    hud: Hud,
    private travelOn: () => void,
  ) {
    super(game, hud, 'k2', STEPS, [
      'intro',
      'find-train',
      'repair',
      'photo',
      'river',
      'town',
      'done',
    ]);
    this.cameraButton.onclick = () => void this.openCamera();
    document.body.append(this.cameraButton);
    window.addEventListener('keydown', this.onCameraKey);
  }

  override dispose() {
    super.dispose();
    this.camera?.close();
    this.cameraButton.remove();
    window.removeEventListener('keydown', this.onCameraKey);
  }

  private get photos(): number {
    return store.save.progress.flags.filter((f) => /^k2-foto-\d$/.test(f)).length;
  }

  protected override objectiveText(info: StepInfo): string {
    return this.step === 'photo'
      ? `${info.objective} (${this.photos}/${PHOTOS_NEEDED}) – tryk 📷`
      : info.objective;
  }

  protected override onStart() {
    this.game.world.setWheelFixed?.(this.reached('photo'));
  }

  protected override onUpdate() {
    this.cameraButton.hidden = this.step !== 'photo' || !!this.camera;
  }

  protected speakerPosition(speaker: SpeakerId): THREE.Vector3 | null {
    const spots = this.game.world.spots;
    if (speaker === 'jensen') return spots.jensen ?? null;
    if (speaker === 'sofie') return spots.sofie ?? null;
    if (speaker === 'kanel') return this.game.world.kanelPosition();
    return null;
  }

  protected async onInteract(step: Step) {
    switch (step) {
      case 'find-train':
        this.setStep('repair', await this.talk('k2-jensen'));
        break;
      case 'repair':
        await this.repair();
        break;
      case 'river':
        await this.crossRiver();
        break;
    }
  }

  protected override async onReach(step: Step) {
    if (step === 'town') await this.finishChapter();
  }

  private async repair() {
    await this.busyWhile(async () => {
      await this.talk('k2-hjul');
      const { misses } = await playWheel();
      const first = !this.hasFlag('k2-hjul');
      if (first) {
        const star = misses <= 2;
        store.update({
          dollars: store.save.dollars + 10,
          stars: store.save.stars + (star ? 1 : 0),
        });
        toast(star ? `Flot hamret! 💲10 og ⭐ (${misses} forbi)` : `Hjulet sidder fast! 💲10`);
      }
      this.game.world.setWheelFixed?.(true);
      await this.talk('k2-hjul-klar');
      this.setStep('photo', ['k2-hjul']);
    });
  }

  private async openCamera() {
    const herd = this.game.world.herd;
    if (!herd || this.camera || this.busy) return;
    if (!this.hasFlag('k2-foto-vist')) {
      this.addFlags('k2-foto-vist');
      await this.talkLines('k2-foto', ['start']);
    }
    this.camera = new PhotoCamera(
      this.game,
      herd,
      PHOTOS_NEEDED,
      () => {
        const n = this.photos + 1;
        this.addFlags(`k2-foto-${n}`);
        this.applyStep();
        if (n >= PHOTOS_NEEDED) void this.photosDone();
      },
      () => this.photos,
    );
    this.cameraButton.hidden = true;
    await this.camera.open();
    this.camera = null;
  }

  private async photosDone() {
    this.camera?.close();
    if (!this.hasFlag('k2-fotos-klar')) {
      store.update({ dollars: store.save.dollars + 5 });
      toast('📸 Tre flotte billeder! 💲5');
    }
    await this.talk('k2-foto-klar');
    this.setStep('river', ['k2-fotos-klar']);
  }

  private async crossRiver() {
    const river = this.game.world.river;
    if (!river) return;
    await this.busyWhile(async () => {
      await this.talk('k2-flod');
      const { hits } = await playRiver(this.game, river.east, river.west);
      if (!this.hasFlag('k2-flod')) {
        const star = hits <= 1;
        store.update({ dollars: store.save.dollars + 5, stars: store.save.stars + (star ? 1 : 0) });
        toast(star ? `Tør over floden! 💲5 og ⭐` : `Over floden! 💲5 (${hits} plask)`);
      }
      await this.talk('k2-flod-klar');
      this.setStep('town', ['k2-flod']);
    });
  }

  private async finishChapter() {
    await this.talk('k2-slut');
    const first = !this.hasFlag('k2-klaret');
    store.update({
      chapter: Math.max(store.save.chapter, 3),
      stars: store.save.stars + (first ? 1 : 0),
    });
    this.setStep('done', ['k2-klaret']);
    await this.showChapterCard(
      'Kapitel 2',
      'Prærien',
      'Flot klaret! Nu venter Fort Kearny længere mod vest.',
      [
        { label: 'Rejs videre til Fortet 🐴', primary: true, action: this.travelOn },
        { label: 'Bliv lidt i Støvby' },
      ],
    );
  }
}
