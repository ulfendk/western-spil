import { regionInfo, type ContestKind } from '@western/shared';
import type { Game } from '../game/game.js';
import { playCans } from '../minigames/cans.js';
import { ContestClient, type ContestGame } from '../minigames/contest.js';
import { HorseshoeClient } from '../minigames/horseshoe.js';
import { playPosters } from '../minigames/posters.js';
import { playRace } from '../minigames/race.js';
import { store } from '../save/store.js';
import { DialogueRunner } from '../story/dialogue.js';
import { script } from '../story/scripts.js';
import type { Hud } from '../ui/hud.js';
import { h } from '../ui/dom.js';

type Activity = 'hestesko' | ContestKind;

const PROMPTS: Record<Activity, string> = {
  hestesko: '🐴 Spil hestesko',
  daaser: '🥫 Skyd til dåser',
  loeb: '🐎 Hestevæddeløb',
  plakater: '📜 Find de efterlyste',
};

const GAMES: Record<ContestKind, ContestGame> = {
  daaser: playCans,
  loeb: playRace,
  plakater: playPosters,
};

/** Things to do in the region's shared town: a welcome the first time, the horseshoe pit and the contests. */
export class TownLife {
  private dialogue = new DialogueRunner();
  private prompt = h('button', { class: 'interact-prompt', hidden: true });
  private busyHere = false;
  /** The activity whose prompt is showing. */
  private near: Activity | null = null;
  private onKey = (e: KeyboardEvent) => {
    if (e.code === 'KeyE' && !this.prompt.hidden && !this.busy) void this.startActivity();
  };

  constructor(
    private game: Game,
    private hud: Hud,
    /** True while something else (the chapter's story) has the player's attention. */
    private othersBusy: () => boolean,
  ) {
    this.prompt.onclick = () => void this.startActivity();
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
    const town = this.game.world.town;
    const spots: { kind: Activity; at: typeof p }[] = [
      ...(town.hasPit !== false ? [{ kind: 'hestesko' as const, at: town.pitStart }] : []),
      ...(town.contests ?? []),
    ];
    let near: Activity | null = null;
    let best = 3.5;
    for (const s of spots) {
      const d = p.distanceTo(s.at);
      if (d < best) {
        best = d;
        near = s.kind;
      }
    }
    if (near !== this.near) {
      this.near = near;
      const touch = matchMedia('(pointer: coarse)').matches;
      if (near) this.prompt.textContent = `${PROMPTS[near]}${touch ? '' : '  [E]'}`;
      this.prompt.hidden = !near;
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

  private async startActivity() {
    const kind = this.near;
    if (this.busyHere || !kind) return;
    this.busyHere = true;
    this.prompt.hidden = true;
    this.near = null;
    this.hud.setTalking(true);
    const townId = regionInfo(this.game.region).townId;
    try {
      if (kind === 'hestesko') {
        await new HorseshoeClient(this.game, this.game.world.town, townId).play();
      } else {
        await new ContestClient(this.game, kind, townId, GAMES[kind]).play();
      }
    } finally {
      this.hud.setTalking(false);
      this.busyHere = false;
    }
  }
}
