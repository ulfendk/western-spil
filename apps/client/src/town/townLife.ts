import { regionInfo } from '@western/shared';
import type { Game } from '../game/game.js';
import { HorseshoeClient } from '../minigames/horseshoe.js';
import { store } from '../save/store.js';
import { DialogueRunner } from '../story/dialogue.js';
import { script } from '../story/scripts.js';
import type { Hud } from '../ui/hud.js';
import { h } from '../ui/dom.js';

/** Things to do in the region's shared town: a welcome the first time, and the horseshoe pit. */
export class TownLife {
  private dialogue = new DialogueRunner();
  private prompt = h('button', { class: 'interact-prompt', hidden: true });
  private busyHere = false;
  private onKey = (e: KeyboardEvent) => {
    if (e.code === 'KeyE' && !this.prompt.hidden && !this.busy) void this.playHorseshoe();
  };

  constructor(
    private game: Game,
    private hud: Hud,
    /** True while something else (the chapter's story) has the player's attention. */
    private othersBusy: () => boolean,
  ) {
    this.prompt.onclick = () => void this.playHorseshoe();
    document.body.append(this.prompt);
    window.addEventListener('keydown', this.onKey);
  }

  dispose() {
    this.prompt.remove();
    window.removeEventListener('keydown', this.onKey);
  }

  get busy(): boolean {
    return this.busyHere;
  }

  /** "by-st-louis", "by-stoevby"… */
  private get welcomeScript(): string {
    return `by-${regionInfo(this.game.region).townId}`;
  }

  update() {
    if (this.busyHere || this.othersBusy()) {
      this.prompt.hidden = true;
      return;
    }
    const p = this.game.playerPosition;
    const inTown = this.game.world.town.contains(p);
    const flag = `set-${regionInfo(this.game.region).townId}`;
    if (inTown && !store.save.progress.flags.includes(flag)) void this.welcome(flag);
    const nearPit = p.distanceTo(this.game.world.town.pitStart) < 3.5;
    if (nearPit === this.prompt.hidden) {
      const touch = matchMedia('(pointer: coarse)').matches;
      this.prompt.textContent = `🐴 Spil hestesko${touch ? '' : '  [E]'}`;
      this.prompt.hidden = !nearPit;
    }
  }

  private addFlag(flag: string) {
    const progress = store.save.progress;
    if (!progress.flags.includes(flag)) {
      store.update({ progress: { ...progress, flags: [...progress.flags, flag] } });
    }
  }

  private async welcome(flag: string) {
    this.busyHere = true;
    this.addFlag(flag);
    this.game.lockInput(true);
    this.hud.setTalking(true);
    try {
      await this.dialogue.run(script(this.welcomeScript));
    } finally {
      this.game.lockInput(false);
      this.hud.setTalking(false);
      this.busyHere = false;
    }
  }

  private async playHorseshoe() {
    if (this.busyHere) return;
    this.busyHere = true;
    this.prompt.hidden = true;
    this.hud.setTalking(true);
    try {
      await new HorseshoeClient(
        this.game,
        this.game.world.town,
        regionInfo(this.game.region).townId,
      ).play();
    } finally {
      this.hud.setTalking(false);
      this.busyHere = false;
    }
  }
}
