import * as THREE from 'three';
import type { DialogueLine } from '@western/shared';
import { narrator } from '../audio/narrator.js';
import { drum } from '../audio/sfx.js';
import type { Game } from '../game/game.js';
import { outline, part } from '../game/toon.js';
import { script } from '../story/scripts.js';
import { h } from '../ui/dom.js';
import { toast } from '../ui/toast.js';

/** Deep under the map, where nothing else is: the mine tunnel lives here. */
const DEPTH = -320;
const SPEED = 9;
const RADIUS = 2.6;

export interface MineResult {
  bumps: number;
  wrongTurns: number;
}

function line(id: string): DialogueLine {
  return script('k5-mine').lines.find((l) => l.id === `k5-mine.${id}`)!;
}

/**
 * The mine-cart ride through the mountain: a winding tunnel with timber frames and
 * lanterns. Duck (⬇) under low beams, and at the forks follow the arrow on the sign
 * (◀/▶). A wrong turn just rolls you back to try again.
 */
export function playMineRide(game: Game): Promise<MineResult> {
  return new Promise((resolve) => {
    const group = new THREE.Group();
    // A winding path through the rock.
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 14; i++) {
      pts.push(
        new THREE.Vector3(
          Math.sin(i * 0.9) * 18 + Math.sin(i * 0.37) * 10,
          DEPTH + Math.sin(i * 0.6) * 4,
          -i * 24,
        ),
      );
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const length = curve.getLength();
    const walls = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 500, RADIUS, 10, false),
      new THREE.MeshToonMaterial({ color: '#5a4a3c', side: THREE.BackSide }),
    );
    group.add(walls);

    const frame = (u: number, low = false) => {
      const p = curve.getPointAt(u);
      const t = curve.getTangentAt(u);
      const f = new THREE.Group();
      for (const x of [-1.6, 1.6])
        f.add(part(new THREE.BoxGeometry(0.25, 3.4, 0.25), '#6b4423', [x, 1.2 - 1.9, 0]));
      f.add(part(new THREE.BoxGeometry(3.6, 0.3, 0.3), '#6b4423', [0, low ? 0.4 : 1.5, 0]));
      f.position.copy(p);
      f.lookAt(p.clone().add(t));
      group.add(outline(f, 0.02));
    };
    // Rails along the floor.
    const railPts: number[] = [];
    for (let i = 0; i < 400; i++) {
      const a = curve.getPointAt(i / 400);
      const b = curve.getPointAt((i + 1) / 400);
      const t = curve.getTangentAt(i / 400);
      const side = new THREE.Vector3(-t.z, 0, t.x).normalize();
      for (const s of [-0.55, 0.55]) {
        railPts.push(
          a.x + side.x * s,
          a.y - 1.95,
          a.z + side.z * s,
          b.x + side.x * s,
          b.y - 1.95,
          b.z + side.z * s,
        );
      }
    }
    group.add(
      new THREE.LineSegments(
        new THREE.BufferGeometry().setAttribute(
          'position',
          new THREE.Float32BufferAttribute(railPts, 3),
        ),
        new THREE.LineBasicMaterial({ color: '#9aa0a8' }),
      ),
    );

    // Obstacles: low beams to duck under, and forks with an arrow sign.
    type Event = { u: number; kind: 'beam' | 'fork'; side?: -1 | 1; done: boolean };
    const events: Event[] = [];
    for (let u = 0.05; u < 0.97; u += 0.03) {
      const isEvent = [0.17, 0.32, 0.47, 0.62, 0.77, 0.9].some((e) => Math.abs(e - u) < 0.015);
      if (!isEvent) frame(u);
    }
    const lanterns: THREE.Mesh[] = [];
    for (let u = 0.02; u < 1; u += 0.06) {
      const p = curve.getPointAt(u);
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 8, 6),
        new THREE.MeshBasicMaterial({ color: '#ffcf70' }),
      );
      lamp.position.set(p.x + 1.3, p.y + 0.8, p.z);
      group.add(lamp);
      lanterns.push(lamp);
    }
    for (const u of [0.17, 0.47, 0.77]) {
      events.push({ u, kind: 'beam', done: false });
      frame(u, true);
    }
    for (const u of [0.32, 0.62, 0.9]) {
      const side = Math.random() < 0.5 ? -1 : 1;
      events.push({ u, kind: 'fork', side, done: false });
      // The sign: an arrow pointing to the correct track.
      const p = curve.getPointAt(u - 0.02);
      const t = curve.getTangentAt(u - 0.02);
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 64;
      const g = c.getContext('2d')!;
      g.fillStyle = '#f3e2b3';
      g.fillRect(0, 0, 128, 64);
      g.fillStyle = '#b8322a';
      g.font = 'bold 54px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(side < 0 ? '◀' : '▶', 64, 34);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 0.6),
        new THREE.MeshBasicMaterial({ map: tex }),
      );
      sign.position.copy(p).add(new THREE.Vector3(0, 0.9, 0));
      sign.lookAt(p.clone().sub(t));
      group.add(sign);
      // A dark side tunnel opening on the wrong side.
      const side3 = new THREE.Vector3(-t.z, 0, t.x).normalize().multiplyScalar(-side * 2.4);
      const hole = new THREE.Mesh(
        new THREE.CircleGeometry(1.4, 16),
        new THREE.MeshBasicMaterial({ color: '#120c08' }),
      );
      const hp = curve.getPointAt(u).add(side3);
      hole.position.copy(hp);
      hole.lookAt(curve.getPointAt(u));
      group.add(hole);
    }
    // In track order, so the hint always announces the nearest thing ahead.
    events.sort((a, b) => a.u - b.u);
    const lamp = new THREE.PointLight('#ffcf70', 30, 22, 1.6);
    group.add(lamp);
    game.addToScene(group);
    game.world.setMood('night');

    const hint = h('div', { class: 'parade-feedback good' });
    const duck = h('button', { class: 'btn hs-aim' }, '⬇');
    const left = h('button', { class: 'btn hs-aim' }, '◀');
    const right = h('button', { class: 'btn hs-aim' }, '▶');
    const status = h('div', { class: 'photo-counter' });
    const root = h(
      'div',
      { class: 'river-ui' },
      status,
      hint,
      h('div', { class: 'hs-row' }, left, duck, right),
    );
    document.body.append(root);
    let ducking = 0;
    let choice: -1 | 0 | 1 = 0;
    const onDuck = () => (ducking = 0.9);
    duck.addEventListener('pointerdown', onDuck);
    left.addEventListener('pointerdown', () => (choice = -1));
    right.addEventListener('pointerdown', () => (choice = 1));
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowDown', 'KeyS', 'Space'].includes(e.code)) {
        e.preventDefault();
        onDuck();
      } else if (['ArrowLeft', 'KeyA'].includes(e.code)) choice = -1;
      else if (['ArrowRight', 'KeyD'].includes(e.code)) choice = 1;
    };
    window.addEventListener('keydown', onKey);

    let dist = 0;
    let bumps = 0;
    let wrongTurns = 0;
    let shake = 0;
    let saidBump = false;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      dist += SPEED * dt;
      ducking = Math.max(0, ducking - dt);
      shake = Math.max(0, shake - dt * 2);
      const u = Math.min(dist / length, 1);
      // Upcoming event hints.
      const next = events.find((e) => !e.done && e.u > u);
      if (next && (next.u - u) * length < 22) {
        hint.textContent =
          next.kind === 'beam' ? '⬇ Duk dig!' : `Følg skiltet: ${next.side! < 0 ? '◀' : '▶'}`;
      } else {
        hint.textContent = '';
      }
      for (const e of events) {
        if (e.done || u < e.u) continue;
        e.done = true;
        if (e.kind === 'beam' && ducking <= 0) {
          bumps++;
          shake = 1;
          drum('bass');
          toast('Av! 💫', 1000);
          if (!saidBump) {
            saidBump = true;
            void narrator.play(line('bump'));
          }
        } else if (e.kind === 'fork') {
          if (choice !== e.side) {
            wrongTurns++;
            dist -= 28;
            e.done = false;
            toast('Blindgyde! Vi bakker.', 1500);
            void narrator.play(line('blind'));
          }
          choice = 0;
        }
      }
      const p = curve.getPointAt(Math.max(0, Math.min(dist / length, 1)));
      const t = curve.getTangentAt(Math.max(0, Math.min(dist / length, 0.999)));
      const eye = p.clone().add(new THREE.Vector3(0, ducking > 0 ? -1.3 : -0.5, 0));
      eye.x += Math.sin(now / 40) * shake * 0.15;
      lamp.position.copy(eye).addScaledVector(t, 3);
      const yaw = Math.atan2(-t.x, -t.z);
      const pitch = Math.asin(THREE.MathUtils.clamp(t.y, -1, 1)) * 0.6;
      game.setCamera(eye, yaw, pitch);
      status.textContent = `⛏️ ${Math.round(u * 100)} % · ${bumps} bump`;
      if (dist >= length) {
        cancelAnimationFrame(raf);
        window.removeEventListener('keydown', onKey);
        root.remove();
        group.removeFromParent();
        resolve({ bumps, wrongTurns });
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
}
