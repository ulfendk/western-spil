import { beep } from '../audio/sfx.js';
import { h } from '../ui/dom.js';

const FLAKES = 8;

export interface GoldResult {
  seconds: number;
}

/**
 * Panning for gold: swirl the pan (finger or mouse in circles, ◀▶, or hold the
 * button) so the water washes sand and gravel over the rim. The heavy gold stays
 * behind; tap the flakes to collect them.
 */
export function playGoldPan(): Promise<GoldResult> {
  return new Promise((resolve) => {
    const size = Math.min(
      380,
      Math.floor(window.innerWidth * 0.85),
      Math.floor(window.innerHeight * 0.55),
    );
    const canvas = h('canvas', { width: size * 2, height: size * 2, class: 'gold-canvas' });
    canvas.style.width = canvas.style.height = `${size}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(2, 2);
    const status = h('p', { class: 'pack-status' });
    const shake = h('button', { class: 'btn btn-big' }, '🔄 Ryst panden');
    const root = h(
      'div',
      { class: 'pack gold' },
      h('h2', {}, 'Vask guld'),
      h(
        'p',
        { class: 'pack-help' },
        'Kør rundt i panden, så sandet skyller ud. Tryk på guldkornene.',
      ),
      canvas,
      status,
      shake,
    );
    document.body.append(root);
    const started = performance.now();

    // Pan-space: centre (0,0), rim at radius 1.
    type Grain = { x: number; y: number; r: number; c: string };
    const grains: Grain[] = [];
    for (let i = 0; i < 420; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * 0.82;
      grains.push({
        x: Math.cos(a) * d,
        y: Math.sin(a) * d,
        r: 0.018 + Math.random() * 0.03,
        c: ['#8d8a86', '#a29c94', '#6b5a48', '#b8a078'][i % 4]!,
      });
    }
    const flakes = Array.from({ length: FLAKES }, () => {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * 0.55;
      return { x: Math.cos(a) * d, y: Math.sin(a) * d, found: false };
    });
    let found = 0;
    let swirl = 0;
    let lastAngle: number | null = null;
    let holding = false;
    let done = false;

    /** Wash: grains drift outwards and over the rim; gold stays put. */
    const wash = (amount: number) => {
      swirl += amount;
      for (let i = grains.length - 1; i >= 0; i--) {
        const g = grains[i]!;
        const d = Math.hypot(g.x, g.y) || 0.01;
        const push = amount * (0.05 + Math.random() * 0.08);
        const rot = amount * 0.6;
        const nx = g.x * Math.cos(rot) - g.y * Math.sin(rot);
        const ny = g.x * Math.sin(rot) + g.y * Math.cos(rot);
        g.x = nx + (nx / d) * push;
        g.y = ny + (ny / d) * push;
        if (Math.hypot(g.x, g.y) > 0.98) grains.splice(i, 1);
      }
    };

    const visible = (f: (typeof flakes)[number]) =>
      !f.found && grains.filter((g) => Math.hypot(g.x - f.x, g.y - f.y) < 0.09).length < 2;

    const toPan = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) / r.width) * 2 - 1,
        y: ((e.clientY - r.top) / r.height) * 2 - 1,
      };
    };
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const p = toPan(e);
      // Tapping a visible flake collects it.
      const f = flakes.find((fl) => visible(fl) && Math.hypot(fl.x - p.x, fl.y - p.y) < 0.12);
      if (f) {
        f.found = true;
        found++;
        beep(1300 + found * 90, 0.12, 0.12, 0, 'sine');
        if (found >= FLAKES) finish();
        return;
      }
      lastAngle = Math.atan2(p.y, p.x);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (lastAngle === null) return;
      const p = toPan(e);
      const a = Math.atan2(p.y, p.x);
      const d = Math.atan2(Math.sin(a - lastAngle), Math.cos(a - lastAngle));
      lastAngle = a;
      wash(Math.min(Math.abs(d), 0.4));
    });
    const endSwirl = () => (lastAngle = null);
    canvas.addEventListener('pointerup', endSwirl);
    canvas.addEventListener('pointerleave', endSwirl);
    shake.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      holding = true;
    });
    shake.addEventListener('pointerup', () => (holding = false));
    shake.addEventListener('pointerleave', () => (holding = false));
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'Space'].includes(e.code)) {
        e.preventDefault();
        wash(0.25);
      }
    };
    window.addEventListener('keydown', onKey);

    let raf = 0;
    let last = performance.now();
    const draw = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (holding) wash(dt * 2.2);
      const c = size / 2;
      const R = size * 0.46;
      ctx.clearRect(0, 0, size, size);
      // The pan: iron rim and a water-filled bottom.
      ctx.fillStyle = '#4f4a45';
      ctx.beginPath();
      ctx.arc(c, c, R + 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6fa6b8';
      ctx.beginPath();
      ctx.arc(c, c, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(c, c);
      for (const f of flakes) {
        if (f.found) continue;
        const shine = visible(f) ? 0.9 + Math.sin(now / 150 + f.x * 10) * 0.1 : 0.5;
        ctx.fillStyle = `rgba(244, 201, 93, ${shine})`;
        ctx.beginPath();
        ctx.ellipse(f.x * R, f.y * R, 6, 4, f.x * 3, 0, Math.PI * 2);
        ctx.fill();
        if (visible(f)) {
          ctx.strokeStyle = '#fff6c0';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
      for (const g of grains) {
        ctx.fillStyle = g.c;
        ctx.beginPath();
        ctx.arc(g.x * R, g.y * R, g.r * R, 0, Math.PI * 2);
        ctx.fill();
      }
      // Ripples swirling with the water.
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, R * (0.3 * i), swirl + i, swirl + i + 1.2);
        ctx.stroke();
      }
      ctx.restore();
      status.textContent = done ? 'Guld! 🎉' : `🪙 ${found} af ${FLAKES} guldkorn`;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    function finish() {
      done = true;
      setTimeout(() => {
        cancelAnimationFrame(raf);
        window.removeEventListener('keydown', onKey);
        root.remove();
        resolve({ seconds: (performance.now() - started) / 1000 });
      }, 1200);
    }
  });
}
