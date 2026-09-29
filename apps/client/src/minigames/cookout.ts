import { beep } from '../audio/sfx.js';
import { doneness } from './doneness.js';
import { DialogueRunner } from '../story/dialogue.js';
import { script } from '../story/scripts.js';
import { h } from '../ui/dom.js';

export interface CookoutResult {
  /** Seconds to light the fire with the magnifying glass. */
  fireSeconds: number;
  /** Seconds to open the can of beans. */
  canSeconds: number;
  /** Breakfast score: 3 per perfectly fried egg or bacon strip (5 items, max 15). */
  breakfast: number;
}

const dialogue = new DialogueRunner();

/** Kanel says some lines of the cooking script (ids without the "kogning." prefix). */
export async function kanelSays(ids: string[]) {
  const all = script('kogning');
  await dialogue.run({
    ...all,
    lines: all.lines.filter((l) => ids.some((id) => l.id === `kogning.${id}`)),
  });
}

/**
 * Breakfast over a campfire, in three steps: light the fire by focusing the sun
 * with a magnifying glass, open a can of beans, and fry eggs and bacon without
 * burning them. Everything runs on real time, so it plays the same on slow tablets.
 */
export async function playCookout(): Promise<CookoutResult> {
  const size = Math.min(
    520,
    Math.floor(window.innerWidth * 0.92),
    Math.floor(window.innerHeight * 0.58),
  );
  const canvas = h('canvas', {
    width: size * 2,
    height: size * 2,
    class: 'lasso-canvas cook-canvas',
  });
  canvas.style.width = canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2);
  const title = h('h2', {}, '');
  const help = h('p', { class: 'pack-help' }, '');
  const status = h('p', { class: 'pack-status' }, '');
  const controls = h('div', { class: 'contest-buttons' });
  const root = h(
    'div',
    { class: 'pack cookout', hidden: true },
    title,
    help,
    canvas,
    controls,
    status,
  );
  document.body.append(root);
  const stage = { title, help, status, controls, canvas, ctx, size };
  // The board is hidden while Kanel talks, and shown for each step.
  const talk = async (ids: string[]) => {
    root.hidden = true;
    await kanelSays(ids);
    root.hidden = false;
  };
  try {
    await talk(['intro', 'lup']);
    const fireSeconds = await lightFire(stage);
    await talk(['ild', 'boenner']);
    const canSeconds = await openCan(stage);
    await talk(['steg']);
    const breakfast = await fry(stage);
    return { fireSeconds, canSeconds, breakfast };
  } finally {
    root.remove();
  }
}

interface Stage {
  title: HTMLElement;
  help: HTMLElement;
  status: HTMLElement;
  controls: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  size: number;
}

/** Runs `frame(dt, now)` every animation frame until it returns true. */
function loop(frame: (dt: number, now: number) => boolean): Promise<void> {
  return new Promise((resolve) => {
    let last = performance.now();
    const tick = (now: number) => {
      // Real time (capped at half a second) so slow devices aren't slow motion.
      const dt = Math.min((now - last) / 1000, 0.5);
      last = now;
      if (frame(dt, now)) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function pointerIn(canvas: HTMLCanvasElement, size: number, e: PointerEvent) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * size, y: ((e.clientY - r.top) / r.height) * size };
}

/** A button that repeats while held (touch friendly). */
function holdButton(label: string, onHold: (held: boolean) => void): HTMLElement {
  const b = h('button', { class: 'btn' }, label);
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    onHold(true);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel'])
    b.addEventListener(ev, () => onHold(false));
  return b;
}

// ---------------------------------------------------------------------------
// 1. Light the fire with a magnifying glass.

async function lightFire(st: Stage): Promise<number> {
  const { ctx, size, canvas } = st;
  st.title.textContent = 'Tænd bålet med en lup';
  st.help.textContent =
    'Flyt lupen, så solpletten lander på det tørre græs. Hold den højere eller lavere, til pletten er lille og skarp.';
  const tinder = { x: size * 0.5, y: size * 0.58, r: size * 0.07 };
  const lens = { x: size * 0.25, y: size * 0.2 };
  canvas.style.cursor = 'none';
  // Every fire needs its own height: find the sharp spot.
  const ideal = 0.45 + Math.random() * 0.3;
  let height = 0.2;
  let heightInput = 0;
  let heat = 0;
  let flame = 0;
  let dragging = false;
  const keys = new Set<string>();
  const up = holdButton('⬆ Højere', (on) => (heightInput = on ? 1 : 0));
  const down = holdButton('⬇ Lavere', (on) => (heightInput = on ? -1 : 0));
  st.controls.replaceChildren(down, up);
  const onDown = (e: PointerEvent) => {
    e.preventDefault();
    dragging = true;
    Object.assign(lens, pointerIn(canvas, size, e));
  };
  const onMove = (e: PointerEvent) => {
    if (dragging || e.pointerType === 'mouse') Object.assign(lens, pointerIn(canvas, size, e));
  };
  const onUp = () => (dragging = false);
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    height = Math.min(1, Math.max(0, height - Math.sign(e.deltaY) * 0.04));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.type === 'keydown') keys.add(e.code);
    else keys.delete(e.code);
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  const started = performance.now();
  let smokeT = 0;
  await loop((dt, now) => {
    const move = size * 0.5 * dt;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) lens.x -= move;
    if (keys.has('ArrowRight') || keys.has('KeyD')) lens.x += move;
    if (keys.has('ArrowUp')) lens.y -= move;
    if (keys.has('ArrowDown')) lens.y += move;
    const hk =
      (keys.has('KeyW') || keys.has('Equal') ? 1 : 0) -
      (keys.has('KeyS') || keys.has('Minus') ? 1 : 0);
    height = Math.min(1, Math.max(0, height + (heightInput || hk) * 0.5 * dt));
    // A hand never holds quite still: the spot wanders a little.
    const t = now / 1000;
    const wobble = size * 0.018;
    // You hold the lens; its sun spot lands below and to the right of it (so neither
    // a finger nor the cursor covers it).
    const spot = {
      x: lens.x + size * 0.1 + Math.sin(t * 1.7) * wobble + Math.sin(t * 4.3) * wobble * 0.5,
      y: lens.y + size * 0.16 + Math.cos(t * 1.3) * wobble + Math.sin(t * 3.7) * wobble * 0.5,
    };
    const blur = Math.abs(height - ideal);
    const spotR = size * (0.02 + blur * 0.18);
    const sharp = Math.max(0, 1 - blur * 4.5) ** 1.5;
    const onTinder = Math.hypot(spot.x - tinder.x, spot.y - tinder.y) < tinder.r;
    if (flame === 0) {
      heat = onTinder ? Math.min(1, heat + dt * sharp * 0.32) : Math.max(0, heat - dt * 0.12);
      if (heat >= 1) {
        flame = 0.01;
        beep(300, 0.4, 0.12, 0, 'sawtooth');
        beep(520, 0.3, 0.1, 0.1, 'triangle');
      }
    } else flame += dt;

    // Draw: dirt, the stone ring, logs and the tinder nest.
    ctx.fillStyle = '#b08a5a';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#9c774a';
    for (let i = 0; i < 40; i++) ctx.fillRect((i * 97) % size, (i * 61) % size, 12, 3);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.fillStyle = i % 2 ? '#8d8a86' : '#a29c94';
      ctx.beginPath();
      ctx.arc(
        tinder.x + Math.cos(a) * size * 0.22,
        tinder.y + Math.sin(a) * size * 0.2,
        size * 0.045,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.strokeStyle = '#5b3a1d';
    ctx.lineWidth = size * 0.035;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI + 0.3;
      ctx.beginPath();
      ctx.moveTo(tinder.x - Math.cos(a) * size * 0.16, tinder.y - Math.sin(a) * size * 0.12);
      ctx.lineTo(tinder.x + Math.cos(a) * size * 0.16, tinder.y + Math.sin(a) * size * 0.12);
      ctx.stroke();
    }
    ctx.strokeStyle = heat > 0.5 ? '#6b4a22' : '#d9b870';
    ctx.lineWidth = 2;
    for (let i = 0; i < 26; i++) {
      const a = i * 2.4;
      ctx.beginPath();
      ctx.moveTo(tinder.x + Math.cos(a) * tinder.r * 0.9, tinder.y + Math.sin(a) * tinder.r * 0.7);
      ctx.lineTo(
        tinder.x - Math.cos(a * 1.3) * tinder.r * 0.7,
        tinder.y - Math.sin(a * 1.3) * tinder.r * 0.5,
      );
      ctx.stroke();
    }
    if (heat > 0.25 && flame === 0) {
      ctx.fillStyle = `rgba(255, 90, 30, ${(heat - 0.25) * 1.2})`;
      ctx.beginPath();
      ctx.arc(tinder.x, tinder.y, tinder.r * 0.35 * heat, 0, Math.PI * 2);
      ctx.fill();
    }
    // Smoke, then flames.
    smokeT += dt;
    const smoke = flame > 0 ? 1 : Math.max(0, (heat - 0.3) / 0.7);
    for (let i = 0; i < 6; i++) {
      const k = (((smokeT * 0.5 + i / 6) % 1) + 1) % 1;
      ctx.fillStyle = `rgba(230, 226, 218, ${smoke * (1 - k) * 0.7})`;
      ctx.beginPath();
      ctx.arc(
        tinder.x + Math.sin(k * 6 + i) * 12,
        tinder.y - k * size * 0.4,
        6 + k * 22,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    if (flame > 0) {
      const f = Math.min(1, flame * 2);
      for (const [c, s] of [
        ['#f2542d', 1],
        ['#ff9a2e', 0.75],
        ['#ffd24a', 0.5],
      ] as const) {
        const hgt = size * 0.2 * f * s * (1 + Math.sin(now / 70 + s * 5) * 0.12);
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(tinder.x - tinder.r * s, tinder.y);
        ctx.quadraticCurveTo(
          tinder.x - tinder.r * s * 0.6,
          tinder.y - hgt * 0.6,
          tinder.x,
          tinder.y - hgt,
        );
        ctx.quadraticCurveTo(
          tinder.x + tinder.r * s * 0.6,
          tinder.y - hgt * 0.6,
          tinder.x + tinder.r * s,
          tinder.y,
        );
        ctx.fill();
      }
    }
    // The sun spot and, above it, the magnifying glass (higher = further up-left).
    if (flame === 0) {
      const g = ctx.createRadialGradient(spot.x, spot.y, 0, spot.x, spot.y, spotR);
      g.addColorStop(0, `rgba(255, 255, 240, ${0.5 + sharp * 0.5})`);
      g.addColorStop(1, 'rgba(255, 240, 180, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(spot.x, spot.y, spotR, 0, Math.PI * 2);
      ctx.fill();
    }
    // Higher lens = further from its spot (and a bigger shadow offset).
    const lift = size * (0.06 + height * 0.2);
    const gx = spot.x - size * 0.1 - (lift - size * 0.16) * 0.6;
    const gy = spot.y - size * 0.16 - (lift - size * 0.16);
    ctx.fillStyle = 'rgba(40, 30, 20, 0.18)';
    ctx.beginPath();
    ctx.ellipse(
      spot.x + lift * 0.2,
      spot.y + lift * 0.1,
      size * 0.08,
      size * 0.05,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.strokeStyle = '#5e3a1a';
    ctx.lineWidth = size * 0.022;
    ctx.beginPath();
    ctx.moveTo(gx + size * 0.06, gy + size * 0.06);
    ctx.lineTo(gx + size * 0.16, gy + size * 0.16);
    ctx.stroke();
    ctx.fillStyle = 'rgba(200, 230, 255, 0.35)';
    ctx.strokeStyle = '#3a3330';
    ctx.lineWidth = size * 0.012;
    ctx.beginPath();
    ctx.arc(gx, gy, size * 0.085, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(gx, gy, size * 0.06, 3.6, 4.4);
    ctx.stroke();
    // Heat meter.
    st.status.textContent =
      flame > 0
        ? 'Ild! 🔥'
        : `🌞 ${sharp > 0.8 ? 'Skarp plet!' : height < ideal ? 'Hold lupen højere' : 'Hold lupen lavere'}  ·  🔥 ${Math.round(heat * 100)} %`;
    return flame > 1.4;
  });
  canvas.removeEventListener('pointerdown', onDown);
  canvas.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  canvas.removeEventListener('wheel', onWheel);
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('keyup', onKey);
  canvas.style.cursor = '';
  return (performance.now() - started) / 1000;
}

// ---------------------------------------------------------------------------
// 2. Open the can of beans: run the opener round the rim.

async function openCan(st: Stage): Promise<number> {
  const { ctx, size, canvas } = st;
  st.title.textContent = 'Åbn dåsen med bønner';
  st.help.textContent = 'Kør dåseåbneren rundt langs kanten, hele vejen rundt.';
  const c = { x: size / 2, y: size / 2 };
  const R = size * 0.3;
  let angle = -Math.PI / 2;
  let cut = 0;
  let dir = 0;
  let lastA: number | null = null;
  let clicks = 0;
  let lid = 0;
  const advance = (d: number) => {
    if (cut >= Math.PI * 2) return;
    if (!dir) dir = Math.sign(d) || 1;
    // Only the way you started cuts (going back just slides the opener).
    const step = d * dir;
    angle += d;
    if (step > 0) {
      cut = Math.min(Math.PI * 2, cut + step);
      const now = Math.floor(cut / 0.35);
      if (now > clicks) {
        clicks = now;
        beep(900 + (clicks % 3) * 120, 0.03, 0.08, 0, 'square');
      }
    }
  };
  const left = h('button', { class: 'btn hs-aim' }, '↺');
  const right = h('button', { class: 'btn hs-aim' }, '↻');
  left.onclick = () => advance(-0.3);
  right.onclick = () => advance(0.3);
  st.controls.replaceChildren(left, right);
  const onDown = (e: PointerEvent) => {
    e.preventDefault();
    const p = pointerIn(canvas, size, e);
    lastA = Math.atan2(p.y - c.y, p.x - c.x);
  };
  const onMove = (e: PointerEvent) => {
    if (lastA === null) return;
    const p = pointerIn(canvas, size, e);
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    const a = Math.atan2(p.y - c.y, p.x - c.x);
    const delta = Math.atan2(Math.sin(a - lastA), Math.cos(a - lastA));
    lastA = a;
    // Only near the rim does the opener bite.
    if (d > R * 0.55 && d < R * 1.5) advance(Math.max(-0.5, Math.min(0.5, delta)));
  };
  const onUp = () => (lastA = null);
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'ArrowRight' || e.code === 'KeyD') advance(0.3);
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') advance(-0.3);
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey);
  const started = performance.now();
  await loop((dt) => {
    if (cut >= Math.PI * 2) lid += dt;
    ctx.fillStyle = '#8a6a44';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#7a5a38';
    for (let i = 0; i < 9; i++) ctx.fillRect(0, (i * size) / 9, size, 3);
    // The can from above: rim, lid with rings, and the label peeking out.
    ctx.fillStyle = '#c8553d';
    ctx.beginPath();
    ctx.arc(c.x, c.y, R * 1.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b8bcc2';
    ctx.beginPath();
    ctx.arc(c.x, c.y, R * 1.06, 0, Math.PI * 2);
    ctx.fill();
    if (lid > 0) {
      // Beans in tomato sauce under the lifted lid.
      ctx.fillStyle = '#b8482a';
      ctx.beginPath();
      ctx.arc(c.x, c.y, R * 0.95, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 46; i++) {
        const a = i * 2.39;
        const r = R * 0.86 * Math.sqrt((i + 0.5) / 46);
        const bx = c.x + Math.cos(a) * r;
        const by = c.y + Math.sin(a) * r;
        ctx.fillStyle = i % 3 ? '#8a3a1e' : '#9c4a26';
        ctx.beginPath();
        ctx.ellipse(bx, by, size * 0.024, size * 0.016, a, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 220, 190, 0.55)';
        ctx.beginPath();
        ctx.ellipse(bx - 2, by - 2, size * 0.008, size * 0.004, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const lift = Math.min(1, lid * 1.5);
    ctx.save();
    ctx.translate(c.x + lift * R * 0.9, c.y - lift * R * 0.9);
    ctx.rotate(lift * 0.6);
    ctx.globalAlpha = 1 - lift * 0.3;
    ctx.fillStyle = '#d4d7dc';
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.96, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#9ea3aa';
    ctx.lineWidth = 3;
    for (const k of [0.3, 0.55, 0.8]) {
      ctx.beginPath();
      ctx.arc(0, 0, R * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    // The cut so far: a dark jagged line along the rim.
    if (cut > 0 && lid === 0) {
      ctx.strokeStyle = '#2a2320';
      ctx.lineWidth = 4;
      ctx.beginPath();
      const start = angle - cut * dir;
      for (let t = 0; t <= cut; t += 0.05) {
        const a = start + t * dir;
        const r = R * 0.98 + Math.sin(t * 40) * 2;
        const x = c.x + Math.cos(a) * r;
        const y = c.y + Math.sin(a) * r;
        if (t === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // The opener: a lever with a blade on the rim.
    if (lid === 0) {
      const bx = c.x + Math.cos(angle) * R;
      const by = c.y + Math.sin(angle) * R;
      ctx.strokeStyle = '#3a3330';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(angle) * R * 0.7, by + Math.sin(angle) * R * 0.7);
      ctx.stroke();
      ctx.strokeStyle = '#8a5a2b';
      ctx.lineWidth = 18;
      ctx.beginPath();
      ctx.moveTo(bx + Math.cos(angle) * R * 0.35, by + Math.sin(angle) * R * 0.35);
      ctx.lineTo(bx + Math.cos(angle) * R * 0.7, by + Math.sin(angle) * R * 0.7);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
    st.status.textContent =
      lid > 0 ? 'Bønnerne er klar! 🫘' : `🥫 ${Math.round((cut / (Math.PI * 2)) * 100)} % åbnet`;
    return lid > 1.3;
  });
  canvas.removeEventListener('pointerdown', onDown);
  canvas.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  window.removeEventListener('keydown', onKey);
  return (performance.now() - started) / 1000;
}

// ---------------------------------------------------------------------------
// 3. Fry eggs and bacon in the skillet.

type Item = {
  kind: 'egg' | 'bacon';
  place: 'board' | 'pan' | 'plate';
  /** Board position, and its slot in the pan. */
  bx: number;
  by: number;
  slot: number;
  /** How cooked the side facing the pan is (1 = perfect), and the first side once flipped. */
  d: number;
  first: number;
  flipped: boolean;
  score: number;
};

async function fry(st: Stage): Promise<number> {
  const { ctx, size, canvas } = st;
  st.title.textContent = 'Steg æg og bacon';
  st.help.textContent =
    'Tryk på æg og bacon for at lægge dem på panden. Vend baconen, når den er gylden, og tag den af, når den er gylden igen. Æggene er færdige, når de er hvide.';
  st.controls.replaceChildren();
  const pan = { x: size * 0.4, y: size * 0.5, r: size * 0.3 };
  // Two eggs at the top, three bacon strips below.
  const slots = [
    [-0.4, -0.5],
    [0.35, -0.5],
    [-0.38, 0.08],
    [0.38, 0.02],
    [0.0, 0.58],
  ].map(([x, y]) => ({ x: pan.x + x! * pan.r, y: pan.y + y! * pan.r }));
  const items: Item[] = [
    ...[0, 1].map((i) => ({ kind: 'egg' as const, bx: size * 0.86, by: size * (0.14 + i * 0.13) })),
    ...[0, 1, 2].map((i) => ({
      kind: 'bacon' as const,
      bx: size * 0.86,
      by: size * (0.42 + i * 0.1),
    })),
  ].map(
    (it) =>
      ({
        ...it,
        place: 'board' as const,
        slot: -1,
        d: 0,
        first: 0,
        flipped: false,
        score: 0,
      }) as Item,
  );
  const plate = { x: size * 0.84, y: size * 0.86, r: size * 0.13 };
  const pops: { x: number; y: number; text: string; t: number }[] = [];
  const RATE = { egg: 1 / 6, bacon: 1 / 4.5 };

  const at = (it: Item) =>
    it.place === 'pan' ? slots[it.slot]! : it.place === 'board' ? { x: it.bx, y: it.by } : null;
  const hit = (p: { x: number; y: number }) =>
    items.find((it) => {
      const q = at(it);
      return q && Math.hypot(q.x - p.x, q.y - p.y) < size * 0.075;
    });
  const serve = (it: Item) => {
    const q = at(it)!;
    const r =
      it.kind === 'egg'
        ? doneness(it.d)
        : [doneness(it.first), doneness(it.d)].reduce((a, b) => (b.points < a.points ? b : a));
    it.score = r.points;
    it.place = 'plate';
    pops.push({ x: q.x, y: q.y, text: r.label, t: 0 });
    beep(r.points === 3 ? 1300 : 700, 0.12, 0.12, 0, 'triangle');
  };
  const tap = (p: { x: number; y: number }) => {
    const it = hit(p);
    if (!it) return;
    if (it.place === 'board') {
      const used = new Set(items.filter((i) => i.place === 'pan').map((i) => i.slot));
      // Eggs go in the top two places, bacon in the lower three.
      const mine = it.kind === 'egg' ? [0, 1] : [2, 3, 4];
      const slot = mine.find((i) => !used.has(i)) ?? -1;
      if (slot < 0) return;
      it.place = 'pan';
      it.slot = slot;
      beep(it.kind === 'egg' ? 1600 : 400, 0.05, 0.1, 0, it.kind === 'egg' ? 'square' : 'sawtooth');
    } else if (it.kind === 'bacon' && !it.flipped) {
      if (it.d < 0.5) {
        pops.push({ x: slots[it.slot]!.x, y: slots[it.slot]!.y, text: 'Vent lidt…', t: 0 });
        return;
      }
      it.first = it.d;
      it.d = 0;
      it.flipped = true;
      beep(600, 0.08, 0.1, 0, 'triangle');
    } else serve(it);
  };
  const onDown = (e: PointerEvent) => {
    e.preventDefault();
    tap(pointerIn(canvas, size, e));
  };
  canvas.addEventListener('pointerdown', onDown);
  // Keys 1–5 tap the items in order (eggs first).
  const onKey = (e: KeyboardEvent) => {
    const n = Number(e.key);
    const it = items[n - 1];
    if (it) {
      const q = at(it);
      if (q) tap(q);
    }
  };
  window.addEventListener('keydown', onKey);
  let sizzle = 0;
  await loop((dt, now) => {
    const inPan = items.filter((i) => i.place === 'pan');
    for (const it of inPan) it.d += RATE[it.kind] * dt;
    sizzle -= dt;
    if (inPan.length && sizzle <= 0) {
      sizzle = 0.18 + Math.random() * 0.25;
      beep(2400 + Math.random() * 1600, 0.02, 0.025 * inPan.length, 0, 'square');
    }
    // The fire's glow, the skillet and the board.
    ctx.fillStyle = '#6b4a2e';
    ctx.fillRect(0, 0, size, size);
    const glow = ctx.createRadialGradient(pan.x, pan.y, pan.r * 0.8, pan.x, pan.y, pan.r * 1.5);
    glow.addColorStop(0, `rgba(255, 140, 40, ${0.55 + Math.sin(now / 90) * 0.08})`);
    glow.addColorStop(1, 'rgba(255, 140, 40, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#1b1b1b';
    ctx.lineWidth = size * 0.035;
    ctx.beginPath();
    ctx.moveTo(pan.x - pan.r * 0.95, pan.y);
    ctx.lineTo(pan.x - pan.r * 1.55, pan.y);
    ctx.stroke();
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.arc(pan.x, pan.y, pan.r * 1.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a3a3a';
    ctx.beginPath();
    ctx.arc(pan.x, pan.y, pan.r * 0.95, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a07a4a';
    ctx.fillRect(size * 0.74, size * 0.05, size * 0.24, size * 0.68);
    ctx.fillStyle = '#f3ecdc';
    ctx.beginPath();
    ctx.arc(plate.x, plate.y, plate.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c8b890';
    ctx.lineWidth = 3;
    ctx.stroke();
    // The food.
    const onPlate = items.filter((i) => i.place === 'plate');
    onPlate.forEach((it, i) => {
      const a = (i / 5) * Math.PI * 2;
      drawFood(
        ctx,
        it,
        plate.x + Math.cos(a) * plate.r * 0.45,
        plate.y + Math.sin(a) * plate.r * 0.45,
        size * 0.45,
      );
    });
    for (const it of items) {
      const q = at(it);
      if (q) drawFood(ctx, it, q.x, q.y, size);
    }
    for (const p of pops) {
      p.t += dt;
      ctx.fillStyle = `rgba(255, 250, 230, ${1 - p.t})`;
      ctx.font = `bold ${Math.round(size * 0.05)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(p.text, p.x, p.y - size * 0.06 - p.t * 30);
    }
    for (let i = pops.length - 1; i >= 0; i--) if (pops[i]!.t > 1) pops.splice(i, 1);
    const done = onPlate.length === items.length;
    st.status.textContent = done
      ? 'Morgenmaden er klar! 🍳'
      : `🍽️ ${onPlate.length} af ${items.length} på tallerkenen`;
    return done && pops.length === 0;
  });
  canvas.removeEventListener('pointerdown', onDown);
  window.removeEventListener('keydown', onKey);
  return items.reduce((s, i) => s + i.score, 0);
}

/** Mixes two hex colours. */
function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const k = Math.max(0, Math.min(1, t));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i]! - v) * k)).join(',')})`;
}

/** Cooking colour along the way: raw → perfect → overdone → burnt. */
function cooked(d: number, raw: string, good: string, over: string, burnt: string): string {
  if (d < 1) return mix(raw, good, d);
  if (d < 1.35) return mix(good, over, (d - 1) / 0.35);
  return mix(over, burnt, (d - 1.35) / 0.4);
}

function drawFood(ctx: CanvasRenderingContext2D, it: Item, x: number, y: number, size: number) {
  const s = size / 520;
  if (it.kind === 'egg') {
    if (it.place === 'board') {
      ctx.fillStyle = '#f3ecdc';
      ctx.strokeStyle = '#8a7a60';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y, 22 * s, 28 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      return;
    }
    // A fried egg: the white sets and browns at the edge, the yolk stays golden.
    ctx.fillStyle =
      it.d > 1.2
        ? cooked(it.d, '#e8e0d0', '#ffffff', '#c89a5a', '#3a2a1a')
        : cooked(it.d, '#c8c0b0', '#ffffff', '#ffffff', '#ffffff');
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = (38 + Math.sin(i * 2.7) * 6) * s;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.fill();
    ctx.fillStyle = cooked(it.d, '#ffb020', '#ffb020', '#e8901a', '#8a5a1a');
    ctx.beginPath();
    ctx.arc(x + 4 * s, y - 2 * s, 14 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(x, y - 7 * s, 4 * s, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // Bacon: a big wavy strip, pink → golden → dark → black. It shows the side
  // that's cooking now (after a flip it starts pink again, then goes golden).
  const d = it.place === 'board' ? 0 : it.d;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.3);
  ctx.lineCap = 'round';
  ctx.strokeStyle = cooked(d, '#e89090', '#c87840', '#8a4a20', '#2a1a10');
  ctx.lineWidth = 24 * s;
  ctx.beginPath();
  for (let i = 0; i <= 12; i++) {
    const px = (-46 + i * 7.7) * s;
    const py = Math.sin(i * 1.3) * 7 * s;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.strokeStyle = mix('#f3e0d0', '#e8c890', Math.min(1, d));
  ctx.lineWidth = 6 * s;
  ctx.stroke();
  ctx.restore();
  // A little arrow on bacon that's ready to be flipped.
  if (it.place === 'pan' && !it.flipped && d >= 0.85 && d <= 1.25) {
    ctx.fillStyle = '#fff4d6';
    ctx.font = `bold ${Math.round(26 * s)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('↻', x, y - 26 * s);
  }
}
