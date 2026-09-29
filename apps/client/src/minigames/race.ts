import { RACE, raceBarrels } from '@western/shared';
import { beep, drum } from '../audio/sfx.js';
import { h } from '../ui/dom.js';
import { toast } from '../ui/toast.js';
import type { ContestContext } from './contest.js';

/** Speed gained per good stride, and how quickly it fades (per second). */
const STRIDE = 2.4;
const FADE = 0.45;
/** Stay a hair under the server's limit. */
const TOP = RACE.maxSpeed * 0.95;
const JUMP_TIME = 0.6;
const STUMBLE_TIME = 0.7;

/**
 * Hestevæddeløb: a side view with a lane per rider. Tap ◀ and ▶ in turn to
 * gallop (the same one twice breaks the stride), ⬆ to jump the barrels. The
 * other riders' horses move by what the server says they've run.
 */
export async function playRace(ctx: ContestContext): Promise<void> {
  const barrels = raceBarrels(ctx.seed);
  const w = Math.min(680, Math.floor(window.innerWidth * 0.94));
  const hgt = Math.min(320, Math.floor(window.innerHeight * 0.48));
  const canvas = h('canvas', { width: w * 2, height: hgt * 2, class: 'lasso-canvas' });
  canvas.style.width = `${w}px`;
  canvas.style.height = `${hgt}px`;
  const g = canvas.getContext('2d')!;
  g.scale(2, 2);
  const left = h('button', { class: 'btn hs-aim' }, '◀');
  const jumpBtn = h('button', { class: 'btn hs-aim' }, '⬆');
  const right = h('button', { class: 'btn hs-aim' }, '▶');
  const root = h(
    'div',
    { class: 'pack contest-game' },
    h(
      'p',
      { class: 'pack-help' },
      'Tryk skiftevis ◀ og ▶ for at galoppere. ⬆ hopper over tønderne.',
    ),
    canvas,
    h('div', { class: 'contest-buttons' }, left, jumpBtn, right),
  );
  document.body.append(root);

  let dist = 0;
  let speed = 0;
  let lastFoot = 0;
  let air = 0;
  let stumble = 0;
  let finished = false;
  const cleared = new Set<number>();
  const stride = (foot: -1 | 1) => {
    if (finished || stumble > 0) return;
    if (foot === lastFoot) {
      speed *= 0.75;
      return;
    }
    lastFoot = foot;
    speed = Math.min(TOP, speed + STRIDE);
    drum('bass');
  };
  const jump = () => {
    if (air <= 0 && stumble <= 0 && !finished) {
      air = JUMP_TIME;
      beep(700, 0.1, 0.08, 0, 'sine');
    }
  };
  left.addEventListener('pointerdown', (e) => (e.preventDefault(), stride(-1)));
  right.addEventListener('pointerdown', (e) => (e.preventDefault(), stride(1)));
  jumpBtn.addEventListener('pointerdown', (e) => (e.preventDefault(), jump()));
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (['ArrowLeft', 'KeyA'].includes(e.code)) stride(-1);
    else if (['ArrowRight', 'KeyD'].includes(e.code)) stride(1);
    else if (['ArrowUp', 'KeyW', 'Space'].includes(e.code)) {
      e.preventDefault();
      jump();
    }
  };
  window.addEventListener('keydown', onKey);

  // Everyone's lane stays the same for the whole race.
  const lanes = ctx.players().map((p) => p.id);
  const shown = new Map<string, number>();
  let sendTimer = 0;
  let last = performance.now();

  await new Promise<void>((resolve) => {
    const frame = (now: number) => {
      // Real time, even on a slow tablet: the race clock on the server doesn't wait.
      const dt = Math.min((now - last) / 1000, 0.5);
      last = now;
      if (ctx.ended()) return resolve();

      // My horse: stride speed fades, barrels trip you unless you're in the air.
      if (!finished) {
        stumble = Math.max(0, stumble - dt);
        air = Math.max(0, air - dt);
        speed *= Math.exp(-FADE * dt);
        if (stumble > 0) speed = 0;
        dist = Math.min(RACE.length, dist + speed * dt);
        barrels.forEach((b, i) => {
          if (cleared.has(i) || dist < b - 0.6) return;
          cleared.add(i);
          if (air <= 0) {
            stumble = STUMBLE_TIME;
            dist = b - 0.6;
            drum('snare');
            toast('Bump! Hop over tønderne med ⬆', 1400);
          }
        });
        sendTimer -= dt;
        if (sendTimer <= 0 || dist >= RACE.length) {
          sendTimer = 0.25;
          ctx.send({ type: 'progress', d: dist });
        }
        if (dist >= RACE.length) {
          finished = true;
          beep(1200, 0.2, 0.14, 0, 'triangle');
          beep(1600, 0.3, 0.14, 0.15, 'triangle');
        }
      }

      // Draw: the camera follows me; 12 px per metre.
      const scale = 12;
      const camX = dist * scale - w * 0.3;
      g.fillStyle = '#9fd3e0';
      g.fillRect(0, 0, w, hgt);
      g.fillStyle = '#c9a36a';
      g.beginPath();
      g.moveTo(0, hgt * 0.35);
      for (let x = 0; x <= w; x += 30) {
        const wx = x + camX * 0.2;
        g.lineTo(x, hgt * 0.3 + Math.sin(wx * 0.01) * 14);
      }
      g.lineTo(w, hgt * 0.35);
      g.lineTo(w, hgt);
      g.lineTo(0, hgt);
      g.fill();
      const laneH = (hgt * 0.62) / Math.max(1, lanes.length);
      const top = hgt * 0.36;
      lanes.forEach((id, lane) => {
        const y0 = top + lane * laneH;
        g.fillStyle = lane % 2 ? '#d9b77e' : '#e0c088';
        g.fillRect(0, y0, w, laneH);
        const ground = y0 + laneH * 0.82;
        // Distance marks, barrels and the finish line.
        g.fillStyle = 'rgba(90,60,30,0.35)';
        for (let m = Math.floor(camX / scale / 50) * 50; m * scale - camX < w; m += 50) {
          g.fillRect(m * scale - camX, y0, 2, laneH);
        }
        for (const b of barrels) {
          const x = b * scale - camX;
          if (x < -30 || x > w + 30) continue;
          g.fillStyle = '#a8743d';
          g.fillRect(x - 8, ground - 22, 16, 22);
          g.fillStyle = '#3a3330';
          g.fillRect(x - 8, ground - 16, 16, 3);
          g.fillRect(x - 8, ground - 7, 16, 3);
        }
        const fx = RACE.length * scale - camX;
        for (let k = 0; k < 8; k++) {
          g.fillStyle = k % 2 ? '#1b1b1b' : '#f3ecdc';
          g.fillRect(fx, y0 + (k * laneH) / 8, 6, laneH / 8);
        }
        // The rider in this lane.
        const p = ctx.players().find((pl) => pl.id === id);
        if (!p) return;
        let d: number;
        if (p.me) d = dist;
        else {
          // Smooth the server's 4-per-second updates.
          const prev = shown.get(id) ?? p.progress;
          d = prev + (p.progress - prev) * Math.min(1, dt * 6);
          shown.set(id, d);
        }
        const x = d * scale - camX;
        const lift = p.me && air > 0 ? Math.sin((1 - air / JUMP_TIME) * Math.PI) * 30 : 0;
        const run = p.me ? speed > 0.5 : p.progress > 0 && p.progress < RACE.length;
        drawHorse(g, x, ground - lift, now, run, p.me, p.me && stumble > 0);
        g.fillStyle = p.me ? '#b8322a' : '#2a1a0c';
        g.font = '13px sans-serif';
        g.textAlign = 'center';
        // Under the horse, where the rider's hat can't cover it.
        g.fillText(p.me ? 'Dig' : p.nickname, x, ground + 13);
      });
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  window.removeEventListener('keydown', onKey);
  root.remove();
}

function drawHorse(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number,
  running: boolean,
  me: boolean,
  tripped: boolean,
) {
  const legs = running && !tripped ? Math.sin(now / 60) * 7 : 0;
  g.save();
  g.translate(x, y);
  if (tripped) g.rotate(0.25);
  g.fillStyle = '#4a2a14';
  for (const [lx, sw] of [
    [-12, legs],
    [-6, -legs],
    [8, -legs],
    [14, legs],
  ] as const)
    g.fillRect(lx + sw * 0.5, -16, 4, 16);
  g.fillStyle = me ? '#b5652b' : '#8a6a4a';
  g.beginPath();
  g.ellipse(0, -22, 20, 10, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(22, -34, 9, 6, -0.6, 0, Math.PI * 2);
  g.fill();
  g.fillRect(14, -36, 7, 14);
  g.fillStyle = '#4a2a14';
  g.fillRect(-24, -26, 6, 3);
  // Rider with a hat.
  g.fillStyle = me ? '#c8553d' : '#3d6b8a';
  g.fillRect(-5, -44, 10, 14);
  g.fillStyle = '#f1c9a0';
  g.beginPath();
  g.arc(0, -48, 5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2a2320';
  g.fillRect(-8, -54, 16, 3);
  g.fillRect(-4, -60, 8, 6);
  g.restore();
}
