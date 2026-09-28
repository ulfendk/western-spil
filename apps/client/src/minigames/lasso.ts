import { beep } from '../audio/sfx.js';
import { h } from '../ui/dom.js';

export interface LassoResult {
  throws: number;
}

interface Runner {
  x: number;
  y: number;
  vx: number;
  size: number;
  coat: string;
  caught: boolean;
}

/**
 * Catch the four Bøvl brothers: they zigzag across the desert. Aim the ring
 * (pointer, or arrow keys) and tap/space to throw. The lasso lands after a short
 * flight, so you have to aim a little ahead of a running brother.
 */
export function playLasso(): Promise<LassoResult> {
  return new Promise((resolve) => {
    const w = Math.min(520, Math.floor(window.innerWidth * 0.92));
    const hgt = Math.min(320, Math.floor(window.innerHeight * 0.5));
    const canvas = h('canvas', { width: w * 2, height: hgt * 2, class: 'lasso-canvas' });
    canvas.style.width = `${w}px`;
    canvas.style.height = `${hgt}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(2, 2);
    const status = h('p', { class: 'pack-status' });
    const root = h(
      'div',
      { class: 'pack lasso' },
      h('h2', {}, 'Fang Bøvl-brødrene'),
      h('p', { class: 'pack-help' }, 'Sigt med ringen, og tryk for at kaste lassoen.'),
      canvas,
      status,
    );
    document.body.append(root);

    const runners: Runner[] = [0.8, 1, 1.15, 1.35].map((size, i) => ({
      x: 40 + (i * (w - 80)) / 3,
      y: hgt * (0.35 + (i % 2) * 0.3),
      vx: (i % 2 ? -1 : 1) * (45 + i * 8),
      size,
      coat: ['#6b4a2e', '#4a3a2a', '#5a2a1a', '#3a3a3a'][i]!,
      caught: false,
    }));
    const aim = { x: w / 2, y: hgt / 2 };
    let throws = 0;
    let flying: { x: number; y: number; t: number } | null = null;
    let done = false;
    const FLIGHT = 0.35;
    const RING = 26;

    const toCanvas = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      aim.x = ((e.clientX - r.left) / r.width) * w;
      aim.y = ((e.clientY - r.top) / r.height) * hgt;
    };
    const throwLasso = () => {
      if (flying || done) return;
      throws++;
      flying = { x: aim.x, y: aim.y, t: 0 };
      beep(520, 0.25, 0.08, 0, 'sine');
    };
    canvas.addEventListener('pointermove', toCanvas);
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      toCanvas(e);
      throwLasso();
    });
    const keys = new Set<string>();
    const onKey = (e: KeyboardEvent) => {
      if (e.type === 'keydown' && e.code === 'Space') {
        e.preventDefault();
        throwLasso();
      }
      if (e.type === 'keydown') keys.add(e.code);
      else keys.delete(e.code);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const speed = 260 * dt;
      if (keys.has('ArrowLeft') || keys.has('KeyA')) aim.x -= speed;
      if (keys.has('ArrowRight') || keys.has('KeyD')) aim.x += speed;
      if (keys.has('ArrowUp') || keys.has('KeyW')) aim.y -= speed;
      if (keys.has('ArrowDown') || keys.has('KeyS')) aim.y += speed;
      aim.x = Math.max(0, Math.min(w, aim.x));
      aim.y = Math.max(0, Math.min(hgt, aim.y));

      for (const r of runners) {
        if (r.caught) continue;
        r.x += r.vx * dt;
        r.y += Math.sin(now / 400 + r.size * 5) * 20 * dt;
        if (r.x < 20 || r.x > w - 20) r.vx = -r.vx;
        r.x = Math.max(20, Math.min(w - 20, r.x));
        r.y = Math.max(40, Math.min(hgt - 20, r.y));
      }
      if (flying) {
        flying.t += dt;
        if (flying.t >= FLIGHT) {
          const f = flying;
          flying = null;
          const hit = runners.find(
            (r) => !r.caught && Math.hypot(r.x - f.x, r.y - 14 * r.size - f.y) < RING + 8,
          );
          if (hit) {
            hit.caught = true;
            const n = runners.filter((r) => r.caught).length;
            beep(700 + n * 150, 0.15, 0.14, 0, 'triangle');
            // The rest get a bit faster.
            for (const r of runners) r.vx *= 1.1;
            if (n === runners.length) finish();
          } else beep(200, 0.15, 0.08, 0, 'square');
        }
      }

      // Draw: desert ground, brothers, the ring and the flying lasso.
      ctx.fillStyle = '#e3c089';
      ctx.fillRect(0, 0, w, hgt);
      ctx.fillStyle = '#d2a970';
      for (let i = 0; i < 12; i++) ctx.fillRect((i * 97) % w, (i * 53) % hgt, 30, 3);
      for (const r of runners) {
        const s = r.size;
        ctx.save();
        ctx.translate(r.x, r.y);
        if (r.caught) ctx.globalAlpha = 0.45;
        const leg = r.caught ? 0 : Math.sin(now / 70 + r.x) * 4;
        ctx.fillStyle = '#2a2320';
        ctx.fillRect(-5 * s + leg, -2, 4 * s, 10 * s);
        ctx.fillRect(1 * s - leg, -2, 4 * s, 10 * s);
        ctx.fillStyle = r.coat;
        ctx.fillRect(-7 * s, -24 * s, 14 * s, 22 * s);
        ctx.fillStyle = '#e8b48a';
        ctx.beginPath();
        ctx.arc(0, -30 * s, 6 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#222';
        ctx.fillRect(-9 * s, -37 * s, 18 * s, 3 * s);
        ctx.fillRect(-5 * s, -44 * s, 10 * s, 8 * s);
        if (r.caught) {
          ctx.strokeStyle = '#a0763a';
          ctx.lineWidth = 3;
          ctx.strokeRect(-9 * s, -20 * s, 18 * s, 10 * s);
        }
        ctx.restore();
      }
      ctx.strokeStyle = '#7a4a1a';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(aim.x, aim.y, RING, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (flying) {
        const k = flying.t / FLIGHT;
        const sx = w / 2;
        const sy = hgt + 10;
        const x = sx + (flying.x - sx) * k;
        const y = sy + (flying.y - sy) * k - Math.sin(k * Math.PI) * 60;
        ctx.strokeStyle = '#a0763a';
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo((sx + x) / 2, Math.min(sy, y) - 40, x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(x, y, RING * (0.6 + k * 0.4), RING * 0.5 * (0.6 + k * 0.4), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      const caught = runners.filter((r) => r.caught).length;
      status.textContent = done ? 'Alle fanget! 🎉' : `🤠 ${caught} af ${runners.length} fanget`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    function finish() {
      done = true;
      setTimeout(() => {
        cancelAnimationFrame(raf);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('keyup', onKey);
        root.remove();
        resolve({ throws });
      }, 1200);
    }
  });
}
