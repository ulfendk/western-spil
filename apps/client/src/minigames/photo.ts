import type { DialogueLine } from '@western/shared';
import { narrator } from '../audio/narrator.js';
import type { Game } from '../game/game.js';
import type { Herd } from '../game/world/index.js';
import { script } from '../story/scripts.js';
import { h } from '../ui/dom.js';
import { toast } from '../ui/toast.js';

const TOO_CLOSE = 11;
const MAX_DISTANCE = 70;
const ALBUM_KEY = 'kanel.album';

export interface PhotoResult {
  bison: number;
  image: string;
}

function line(id: string): DialogueLine {
  return script('k2-foto').lines.find((l) => l.id === `k2-foto.${id}`)!;
}

/** Keeps the latest photos (small JPEGs) in the browser. */
export function albumPhotos(): string[] {
  try {
    return JSON.parse(localStorage.getItem(ALBUM_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

function saveToAlbum(image: string) {
  try {
    const photos = [image, ...albumPhotos()].slice(0, 12);
    localStorage.setItem(ALBUM_KEY, JSON.stringify(photos));
  } catch {
    // Storage full or blocked: the photo still counts.
  }
}

/**
 * Camera mode on the prairie: a viewfinder over the normal first-person view.
 * The player walks and aims as usual and snaps photos; getting too close makes
 * the herd stampede. Resolves when the player closes the camera.
 */
export class PhotoCamera {
  private root: HTMLElement;
  private counter = h('div', { class: 'photo-counter' });
  private strip = h('div', { class: 'photo-strip' });
  private onKey = (e: KeyboardEvent) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (!e.repeat) this.snap();
    } else if (e.code === 'Escape' || e.code === 'KeyC') {
      this.close();
    }
  };
  private onMouse = (e: MouseEvent) => {
    // With the mouse captured (pointer lock), a click takes the photo.
    if (document.pointerLockElement && e.button === 0) this.snap();
  };
  private resolveClose: (() => void) | null = null;
  private cooldown = 0;

  constructor(
    private game: Game,
    private herd: Herd,
    private needed: number,
    private onGoodPhoto: (result: PhotoResult) => void,
    private goodSoFar: () => number,
  ) {
    const snap = h('button', { class: 'btn btn-big photo-snap' }, '📷 Knips');
    snap.onclick = () => this.snap();
    const closeBtn = h('button', { class: 'btn photo-close' }, 'Luk kameraet');
    closeBtn.onclick = () => this.close();
    this.root = h(
      'div',
      { class: 'photo' },
      h('div', { class: 'photo-frame' }, h('div', { class: 'photo-cross' })),
      this.counter,
      this.strip,
      h('div', { class: 'photo-buttons' }, closeBtn, snap),
    );
  }

  open(): Promise<void> {
    document.body.append(this.root);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('mousedown', this.onMouse);
    this.updateCounter();
    return new Promise((resolve) => (this.resolveClose = resolve));
  }

  close() {
    this.root.remove();
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('mousedown', this.onMouse);
    this.resolveClose?.();
    this.resolveClose = null;
  }

  private updateCounter() {
    this.counter.textContent = `📷 ${this.goodSoFar()} af ${this.needed} billeder`;
  }

  private snap() {
    const now = performance.now();
    if (now < this.cooldown) return;
    this.cooldown = now + 800;
    // Flash.
    const flash = h('div', { class: 'photo-flash' });
    document.body.append(flash);
    setTimeout(() => flash.remove(), 350);

    const player = this.game.playerPosition;
    const bison = this.herd.positions();
    if (bison.some((b) => b.distanceTo(player) < TOO_CLOSE)) {
      this.herd.startle(player);
      void narrator.play(line('taet'));
      toast('For tæt på! Bisonerne løb væk 🐃💨');
      return;
    }
    // Count bison inside the viewfinder (the frame covers the middle 80 % of the screen).
    let inFrame = 0;
    for (const b of bison) {
      b.y += 1.3;
      const p = this.game.project(b);
      if (p.inFront && Math.abs(p.x) < 0.8 && Math.abs(p.y) < 0.8 && p.distance < MAX_DISTANCE)
        inFrame++;
    }
    if (inFrame === 0) {
      void narrator.play(line('ingen'));
      toast('Ingen bisoner på billedet');
      return;
    }
    const image = this.game.snapshot();
    saveToAlbum(image);
    const thumb = h('img', { src: image, alt: `Billede med ${inFrame} bisoner` });
    this.strip.prepend(thumb);
    void narrator.play(line('godt'));
    toast(`📸 ${inFrame} ${inFrame === 1 ? 'bison' : 'bisoner'} på billedet!`);
    this.onGoodPhoto({ bison: inFrame, image });
    this.updateCounter();
  }
}
