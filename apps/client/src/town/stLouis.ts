import type { Game } from '../game/game.js';
import { TOWN, trailX } from '../game/world/index.js';
import { HorseshoeClient } from '../minigames/horseshoe.js';
import { store } from '../save/store.js';
import { DialogueRunner } from '../story/dialogue.js';
import { script } from '../story/scripts.js';
import type { Hud } from '../ui/hud.js';
import { h } from '../ui/dom.js';

/** Things to do in St. Louis: the welcome and the horseshoe pit. */
export class StLouis {
  private dialogue = new DialogueRunner();
  private prompt = h('button', { class: 'interact-prompt', hidden: true });
  private busyHere = false;

  constructor(
    private game: Game,
    private hud: Hud,
    /** True while something else (the chapter's story) has the player's attention. */
    private othersBusy: () => boolean,
  ) {
    this.prompt.onclick = () => void this.playHorseshoe();
    document.body.append(this.prompt);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE' && !this.prompt.hidden && !this.busy) void this.playHorseshoe();
    });
  }

  get busy(): boolean {
    return this.busyHere;
  }

  update() {
    if (this.busyHere || this.othersBusy()) {
      this.prompt.hidden = true;
      return;
    }
    const p = this.game.playerPosition;
    const inTown = p.z > TOWN.zStart && p.z < TOWN.zEnd && Math.abs(p.x - trailX(p.z)) < 26;
    if (inTown && !store.save.progress.flags.includes('set-st-louis')) void this.welcome();
    const nearPit = p.distanceTo(this.game.world.town.pitStart) < 3.5;
    if (nearPit === this.prompt.hidden) {
      const touch = matchMedia('(pointer: coarse)').matches;
      this.prompt.textContent = `🐴 Spil hestesko${touch ? '' : '  [E]'}`;
      this.prompt.hidden = !nearPit;
    }
  }

  private addFlag(flag: string) {
    const progress = store.save.progress;
    if (!progress.flags.includes(flag))
      store.update({ progress: { ...progress, flags: [...progress.flags, flag] } });
  }

  private async welcome() {
    this.busyHere = true;
    this.addFlag('set-st-louis');
    this.game.lockInput(true);
    this.hud.setTalking(true);
    try {
      await this.dialogue.run(script('by-st-louis'));
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
      await new HorseshoeClient(this.game, this.game.world.town, 'st-louis').play();
    } finally {
      this.hud.setTalking(false);
      this.busyHere = false;
    }
  }
}
