import type { DialogueLine } from '@western/shared';
import { narrator } from '../audio/narrator.js';
import { script } from '../story/scripts.js';
import { h } from '../ui/dom.js';

type Animal = 'bison' | 'hest' | 'ulv' | 'bjoern' | 'hjort' | 'hare';

const ANIMALS: Record<Animal, { name: string; icon: string }> = {
  bison: { name: 'Bison', icon: '🦬' },
  hest: { name: 'Hest', icon: '🐎' },
  ulv: { name: 'Ulv', icon: '🐺' },
  bjoern: { name: 'Bjørn', icon: '🐻' },
  hjort: { name: 'Hjort', icon: '🦌' },
  hare: { name: 'Hare', icon: '🐇' },
};

function line(id: string): DialogueLine {
  return script('k4-spor').lines.find((l) => l.id === `k4-spor.${id}`)!;
}

/** Draws a pair of footprints for an animal into the sand. */
function drawTrack(ctx: CanvasRenderingContext2D, animal: Animal, w: number, hgt: number) {
  ctx.fillStyle = '#d9bf8c';
  ctx.fillRect(0, 0, w, hgt);
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = `rgba(120,90,50,${Math.random() * 0.15})`;
    ctx.fillRect(Math.random() * w, Math.random() * hgt, 2, 2);
  }
  ctx.fillStyle = '#6b4a2e';
  const ellipse = (x: number, y: number, rx: number, ry: number, rot = 0) => {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    ctx.fill();
  };
  const print = (cx: number, cy: number) => {
    switch (animal) {
      case 'bison': // Two big, rounded halves (cloven hoof).
        ellipse(cx - 17, cy, 15, 26, 0.12);
        ellipse(cx + 17, cy, 15, 26, -0.12);
        break;
      case 'hjort': // Narrow, pointed heart shape.
        ellipse(cx - 8, cy, 7, 20, 0.2);
        ellipse(cx + 8, cy, 7, 20, -0.2);
        break;
      case 'hest': // One round U-shaped hoof with a V in the middle.
        ellipse(cx, cy, 26, 28);
        ctx.fillStyle = '#d9bf8c';
        ellipse(cx, cy + 10, 14, 20);
        ctx.fillStyle = '#6b4a2e';
        ctx.beginPath();
        ctx.moveTo(cx - 7, cy + 26);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx + 7, cy + 26);
        ctx.fill();
        break;
      case 'ulv': // Four oval toes with claw marks and a pad.
        ellipse(cx, cy + 14, 13, 11);
        for (const [dx, dy] of [
          [-15, -8],
          [15, -8],
          [-6, -20],
          [6, -20],
        ]) {
          ellipse(cx + dx!, cy + dy!, 5, 7);
          ctx.fillRect(cx + dx! - 1, cy + dy! - 14, 2, 5);
        }
        break;
      case 'bjoern': // Wide pad and five toes with long claws.
        ellipse(cx, cy + 10, 26, 17);
        for (let i = 0; i < 5; i++) {
          const x = cx - 24 + i * 12;
          ellipse(x, cy - 16, 6, 7);
          ctx.fillRect(x - 1.5, cy - 32, 3, 10);
        }
        break;
      case 'hare': // Two small front feet and two long hind feet in front of them.
        ellipse(cx - 6, cy + 22, 5, 7);
        ellipse(cx + 6, cy + 32, 5, 7);
        ellipse(cx - 12, cy - 10, 7, 17);
        ellipse(cx + 12, cy - 10, 7, 17);
        break;
    }
  };
  print(w * 0.35, hgt * 0.62);
  print(w * 0.65, hgt * 0.35);
}

export interface TracksResult {
  mistakes: number;
}

/** "Hvem har lavet sporet?": six tracks in the sand, pick the animal each time. */
export function playTracks(): Promise<TracksResult> {
  return new Promise((resolve) => {
    const order = (Object.keys(ANIMALS) as Animal[]).sort(() => Math.random() - 0.5);
    let round = 0;
    let mistakes = 0;
    const canvas = h('canvas', { width: 520, height: 300, class: 'tracks-canvas' });
    const ctx = canvas.getContext('2d')!;
    const options = h('div', { class: 'tracks-options' });
    const status = h('p', { class: 'pack-status' });
    const root = h(
      'div',
      { class: 'pack tracks' },
      h('h2', {}, 'Hvem har lavet sporet?'),
      canvas,
      status,
      options,
    );
    document.body.append(root);

    const show = () => {
      const animal = order[round]!;
      drawTrack(ctx, animal, 520, 300);
      status.textContent = `Spor ${round + 1} af ${order.length}`;
      // The right answer plus three others.
      const choices = [
        animal,
        ...order
          .filter((a) => a !== animal)
          .sort(() => Math.random() - 0.5)
          .slice(0, 3),
      ].sort(() => Math.random() - 0.5);
      options.replaceChildren(
        ...choices.map((a) => {
          const b = h(
            'button',
            { class: 'btn tracks-choice' },
            `${ANIMALS[a].icon} ${ANIMALS[a].name}`,
          );
          b.onclick = () => pick(a, b);
          return b;
        }),
      );
    };

    const pick = (a: Animal, button: HTMLButtonElement) => {
      if (a === order[round]) {
        button.classList.add('right');
        void narrator.play(line('rigtigt'));
        round++;
        setTimeout(() => {
          if (round >= order.length) {
            root.remove();
            resolve({ mistakes });
          } else {
            show();
          }
        }, 900);
      } else {
        mistakes++;
        button.disabled = true;
        button.classList.add('wrong');
        void narrator.play(line('forkert'));
      }
    };
    show();
  });
}
