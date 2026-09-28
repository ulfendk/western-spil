import { h } from '../ui/dom.js';

/** Karlsvognen (the Plough / Big Dipper): the four stars of the wagon, then the shaft. */
const DIPPER: [number, number][] = [
  [0.74, 0.34], // Dubhe
  [0.72, 0.52], // Merak
  [0.56, 0.57], // Phecda
  [0.54, 0.43], // Megrez
  [0.42, 0.4], // Alioth
  [0.3, 0.36], // Mizar
  [0.18, 0.44], // Alkaid
];
const POLARIS: [number, number] = [0.79, 0.07];

export interface StarsResult {
  mistakes: number;
}

/**
 * Find Karlsvognen: tap its seven stars in order among many others. The first
 * star glows; after a pause the next one hints. At the end the "pointer" line
 * shows the way to the Pole Star.
 */
export function playStars(): Promise<StarsResult> {
  return new Promise((resolve) => {
    const W = 640;
    const H = 400;
    const canvas = h('canvas', { width: W * 2, height: H * 2, class: 'stars-canvas' });
    const ctx = canvas.getContext('2d')!;
    ctx.scale(2, 2);
    const status = h('p', { class: 'pack-status' });
    const root = h(
      'div',
      { class: 'pack stars' },
      h('h2', {}, 'Find Karlsvognen'),
      h('p', { class: 'pack-help' }, 'Tryk på stjernerne i rækkefølge. Den første lyser allerede.'),
      canvas,
      status,
    );
    document.body.append(root);

    const background = Array.from({ length: 140 }, () => [
      Math.random(),
      Math.random(),
      Math.random() * 1.2 + 0.3,
    ]);
    let next = 0;
    let mistakes = 0;
    let lastTap = performance.now();
    let done = false;
    let raf = 0;

    const draw = (now: number) => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#060a1f');
      g.addColorStop(1, '#1b2550');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      for (const [x, y, r] of background) {
        ctx.fillStyle = `rgba(255,248,224,${0.35 + Math.sin(now / 500 + x! * 40) * 0.15})`;
        ctx.beginPath();
        ctx.arc(x! * W, y! * H, r!, 0, Math.PI * 2);
        ctx.fill();
      }
      // Lines between the stars found so far.
      ctx.strokeStyle = '#f4c95d';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < next; i++) {
        const [x, y] = DIPPER[i]!;
        if (i === 0) ctx.moveTo(x * W, y * H);
        else ctx.lineTo(x * W, y * H);
      }
      // Close the wagon's box (4th star back to the 1st) once the whole figure is found.
      if (next === DIPPER.length) {
        ctx.moveTo(DIPPER[3]![0] * W, DIPPER[3]![1] * H);
        ctx.lineTo(DIPPER[0]![0] * W, DIPPER[0]![1] * H);
      }
      ctx.stroke();
      DIPPER.forEach(([x, y], i) => {
        const found = i < next;
        const hint = i === next && (i === 0 || now - lastTap > 4000);
        const pulse = hint ? 2 + Math.sin(now / 200) * 1.5 : 0;
        ctx.fillStyle = found ? '#f4c95d' : '#fff8e0';
        ctx.beginPath();
        ctx.arc(x * W, y * H, 4 + pulse, 0, Math.PI * 2);
        ctx.fill();
      });
      if (done) {
        // The two outer stars point to the Pole Star.
        ctx.setLineDash([8, 8]);
        ctx.strokeStyle = '#9fd0da';
        ctx.beginPath();
        ctx.moveTo(DIPPER[1]![0] * W, DIPPER[1]![1] * H);
        ctx.lineTo(POLARIS[0] * W, POLARIS[1] * H);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(POLARIS[0] * W, POLARIS[1] * H, 7 + Math.sin(now / 200) * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = '18px "Patrick Hand", sans-serif';
        ctx.fillText('Nordstjernen', POLARIS[0] * W - 110, POLARIS[1] * H + 6);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    const update = () => {
      status.textContent = done ? 'Karlsvognen! ⭐' : `${next} af ${DIPPER.length} stjerner`;
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (done) return;
      const r = canvas.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      const [sx, sy] = DIPPER[next]!;
      // Generous hit area for small fingers.
      if (Math.hypot((x - sx) * W, (y - sy) * H) < 26) {
        next++;
        lastTap = performance.now();
        if (next === DIPPER.length) {
          done = true;
          setTimeout(() => {
            cancelAnimationFrame(raf);
            root.remove();
            resolve({ mistakes });
          }, 3000);
        }
      } else {
        mistakes++;
      }
      update();
    });
    update();
  });
}
