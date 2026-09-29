import { CANS, canSchedule } from '@western/shared';
import { beep } from '../audio/sfx.js';
import { h } from '../ui/dom.js';
import type { ContestContext } from './contest.js';

/**
 * Dåseskydning: tin cans pop up along a fence. Tap one while it's up to knock it
 * off (keys 1–8 work too). Gold cans are worth three. Everyone gets the same cans.
 */
export async function playCans(ctx: ContestContext): Promise<void> {
  const cans = canSchedule(ctx.seed);
  const w = Math.min(640, Math.floor(window.innerWidth * 0.94));
  const hgt = Math.min(300, Math.floor(window.innerHeight * 0.45));
  const canvas = h('canvas', { width: w * 2, height: hgt * 2, class: 'lasso-canvas cans-canvas' });
  canvas.style.width = `${w}px`;
  canvas.style.height = `${hgt}px`;
  const g = canvas.getContext('2d')!;
  g.scale(2, 2);
  const root = h(
    'div',
    { class: 'pack contest-game' },
    h('p', { class: 'pack-help' }, 'Tryk på dåserne, når de dukker op. Guld-dåser giver 3 point!'),
    canvas,
  );
  document.body.append(root);

  const slotX = (slot: number) => (w / (CANS.slots + 1)) * (slot + 1);
  const railY = hgt * 0.62;
  const hit = new Set<number>();
  /** Knocked-off cans flying away: [x, y, vx, vy, spin, gold]. */
  const flying: { x: number; y: number; vx: number; vy: number; a: number; gold: boolean }[] = [];
  const puffs: { x: number; y: number; t: number }[] = [];

  const shoot = (x: number, y: number) => {
    const t = ctx.elapsed();
    const target = cans.find(
      (c) =>
        !hit.has(c.id) &&
        t >= c.appear - CANS.tolerance &&
        t <= c.appear + c.stay &&
        Math.abs(slotX(c.slot) - x) < w / (CANS.slots + 1) / 2 &&
        y > railY - 70 &&
        y < railY + 12,
    );
    if (!target) {
      puffs.push({ x, y, t: 0 });
      beep(180, 0.06, 0.06, 0, 'square');
      return;
    }
    hit.add(target.id);
    ctx.send({ type: 'hit', id: target.id, t });
    flying.push({
      x: slotX(target.slot),
      y: railY - 18,
      vx: (Math.random() - 0.5) * 160,
      vy: -260,
      a: 0,
      gold: target.gold,
    });
    beep(target.gold ? 1500 : 900, 0.09, 0.14, 0, 'triangle');
    beep(target.gold ? 2000 : 1200, 0.08, 0.1, 0.06, 'triangle');
  };
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    shoot(((e.clientX - r.left) / r.width) * w, ((e.clientY - r.top) / r.height) * hgt);
  });
  const onKey = (e: KeyboardEvent) => {
    const n = Number(e.key);
    if (n >= 1 && n <= CANS.slots) shoot(slotX(n - 1), railY - 18);
  };
  window.addEventListener('keydown', onKey);

  let last = performance.now();
  await new Promise<void>((resolve) => {
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (ctx.ended()) return resolve();
      const t = ctx.elapsed();
      // Sky, distant hills and the fence.
      g.fillStyle = '#9fd3e0';
      g.fillRect(0, 0, w, hgt);
      g.fillStyle = '#d9b77e';
      g.fillRect(0, hgt * 0.7, w, hgt * 0.3);
      g.fillStyle = '#c9a36a';
      g.beginPath();
      g.moveTo(0, hgt * 0.7);
      for (let x = 0; x <= w; x += 40) g.lineTo(x, hgt * 0.62 + Math.sin(x * 0.02) * 10);
      g.lineTo(w, hgt * 0.7);
      g.fill();
      g.fillStyle = '#8a5a2b';
      g.fillRect(0, railY, w, 12);
      g.fillRect(0, railY + 34, w, 10);
      for (let i = 0; i <= CANS.slots + 1; i++)
        g.fillRect((w / (CANS.slots + 1)) * i - 5, railY - 4, 10, hgt - railY);
      // Cans that are up: they pop up from behind the rail.
      for (const c of cans) {
        if (hit.has(c.id) || t < c.appear || t > c.appear + c.stay) continue;
        const rise = Math.min(1, (t - c.appear) / 0.15, (c.appear + c.stay - t) / 0.15);
        drawCan(g, slotX(c.slot), railY - 22 * rise, c.gold, 1);
      }
      for (const f of flying) {
        f.vy += 700 * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.a += dt * 12;
        g.save();
        g.translate(f.x, f.y);
        g.rotate(f.a);
        drawCan(g, 0, 0, f.gold, 1);
        g.restore();
      }
      for (let i = flying.length - 1; i >= 0; i--) if (flying[i]!.y > hgt + 40) flying.splice(i, 1);
      for (const p of puffs) {
        p.t += dt;
        g.fillStyle = `rgba(230, 215, 180, ${1 - p.t * 2})`;
        g.beginPath();
        g.arc(p.x, p.y, 6 + p.t * 30, 0, Math.PI * 2);
        g.fill();
      }
      for (let i = puffs.length - 1; i >= 0; i--) if (puffs[i]!.t > 0.5) puffs.splice(i, 1);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  window.removeEventListener('keydown', onKey);
  root.remove();
}

function drawCan(g: CanvasRenderingContext2D, x: number, y: number, gold: boolean, s: number) {
  g.fillStyle = gold ? '#e8c24a' : '#b8bcc2';
  g.fillRect(x - 10 * s, y - 14 * s, 20 * s, 28 * s);
  g.fillStyle = gold ? '#fff2b0' : '#e2e5ea';
  g.fillRect(x - 6 * s, y - 14 * s, 4 * s, 28 * s);
  g.fillStyle = gold ? '#b8322a' : '#c8553d';
  g.fillRect(x - 10 * s, y - 4 * s, 20 * s, 9 * s);
  g.strokeStyle = '#2a2320';
  g.lineWidth = 2;
  g.strokeRect(x - 10 * s, y - 14 * s, 20 * s, 28 * s);
}
