import { regionInfo, type RegionId } from '@western/shared';
import type { Game } from '../game/game.js';
import { store } from '../save/store.js';
import { TownLife } from '../town/townLife.js';
import type { Hud } from '../ui/hud.js';
import { h } from '../ui/dom.js';
import { Chapter1 } from './chapter1.js';
import type { ChapterBase } from './chapterBase.js';
import { Chapter2 } from './chapter2.js';

/**
 * Owns the active chapter and town for the region the player is in, and handles
 * travelling between regions (east to west, or back to earlier towns).
 */
export class Director {
  private chapter: ChapterBase<string>;
  private town: TownLife;
  private travelling = false;

  constructor(
    private game: Game,
    private hud: Hud,
  ) {
    this.chapter = this.makeChapter();
    this.town = new TownLife(game, hud, () => this.chapter.isBusy || this.travelling);
  }

  get isBusy(): boolean {
    return this.travelling || this.chapter.isBusy || this.town.busy;
  }

  /** Regions the player may travel to (every region up to their latest chapter). */
  unlockedRegions(): RegionId[] {
    const reached = store.save.chapter;
    return (['st-louis', 'praerien'] as RegionId[]).filter((r) => regionInfo(r).chapter <= reached);
  }

  start() {
    this.chapter.start();
  }

  update() {
    if (this.travelling) return;
    this.chapter.update();
    this.town.update();
  }

  restartChapter() {
    this.chapter.restart();
  }

  /** Build the new region, move the player there and start its chapter. */
  async travel(region: RegionId) {
    if (this.travelling || region === this.game.region) return;
    this.travelling = true;
    const card = h(
      'div',
      { class: 'chapter-card travel-card' },
      h(
        'div',
        { class: 'panel' },
        h('p', { class: 'chapter-kicker' }, 'Rejser…'),
        h('h2', {}, `Mod ${regionInfo(region).name}`),
        h('p', {}, '🐴 💨'),
      ),
    );
    document.body.append(card);
    // Let the card paint before the (heavy) rebuild.
    await new Promise((r) => setTimeout(r, 60));
    this.chapter.dispose();
    this.town.dispose();
    this.hud.setObjective(null);
    store.update({ region });
    this.game.loadRegion(region);
    this.chapter = this.makeChapter();
    this.town = new TownLife(this.game, this.hud, () => this.chapter.isBusy || this.travelling);
    await new Promise((r) => setTimeout(r, 400));
    card.remove();
    this.travelling = false;
    this.chapter.start();
  }

  private makeChapter(): ChapterBase<string> {
    return this.game.region === 'praerien'
      ? (new Chapter2(this.game, this.hud) as unknown as ChapterBase<string>)
      : (new Chapter1(
          this.game,
          this.hud,
          () => void this.travel('praerien'),
        ) as unknown as ChapterBase<string>);
  }
}
