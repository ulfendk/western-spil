import * as THREE from 'three';
import type { DialogueLine } from '@western/shared';
import { narrator } from '../audio/narrator.js';
import type { Game } from '../game/game.js';
import { riverWater } from '../game/world/index.js';
import { outline, part } from '../game/toon.js';
import { script } from '../story/scripts.js';
import { h } from '../ui/dom.js';
import { toast } from '../ui/toast.js';

const SPEED = 3;
const STEER = 3.5;
const MAX_SIDE = 7;
const DRIFT = 2.6;

export interface RiverResult {
  hits: number;
}

function line(id: string): DialogueLine {
  return script('k2-flod').lines.find((l) => l.id === `k2-flod.${id}`)!;
}

/**
 * Wading across the shallow Platte: you move forward by yourself and steer left and
 * right around logs drifting downstream. Bumping a log just splashes you.
 */
export function playRiver(
  game: Game,
  east: THREE.Vector3,
  west: THREE.Vector3,
): Promise<RiverResult> {
  return new Promise((resolve) => {
    const dir = west.clone().sub(east).setY(0);
    const length = dir.length();
    dir.normalize();
    // Downstream is +x; "side" is measured along the river (perpendicular to our path).
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const yaw = Math.atan2(-dir.x, -dir.z);
    let travelled = 0;
    let offset = 0;
    let steer = 0;
    let hits = 0;
    let splash = 0;
    let said = false;
    let spawnTimer = 0.5;

    const logs: { obj: THREE.Object3D; pos: THREE.Vector3; hit: boolean }[] = [];
    const makeLog = () => {
      const g = new THREE.Group();
      g.add(
        part(
          new THREE.CylinderGeometry(0.32, 0.36, 3.6, 10),
          '#6b4423',
          [0, 0, 0],
          [0, 0, Math.PI / 2],
        ),
      );
      for (const x of [-1.8, 1.8])
        g.add(
          part(
            new THREE.CircleGeometry(0.33, 10),
            '#c89a62',
            [x, 0, 0],
            [0, x > 0 ? Math.PI / 2 : -Math.PI / 2, 0],
          ),
        );
      g.add(
        part(
          new THREE.CylinderGeometry(0.05, 0.04, 0.8, 5),
          '#6b4423',
          [0.6, 0.4, 0],
          [0, 0, -0.6],
        ),
      );
      outline(g, 0.03);
      // Enter upstream (−x), somewhere ahead of us on the crossing.
      const ahead = travelled + 6 + Math.random() * (length - travelled);
      const across = east.clone().addScaledVector(dir, Math.min(ahead, length - 2));
      const pos = across.addScaledVector(new THREE.Vector3(1, 0, 0), -26 - Math.random() * 10);
      g.rotation.y = Math.random() * 0.6 - 0.3;
      game.addToScene(g);
      logs.push({ obj: g, pos, hit: false });
    };

    const left = h('button', { class: 'btn hs-aim' }, '◀');
    const right = h('button', { class: 'btn hs-aim' }, '▶');
    const status = h('div', { class: 'photo-counter' }, 'Styr uden om træstammerne!');
    for (const [btn, d] of [
      [left, -1],
      [right, 1],
    ] as const) {
      btn.addEventListener('pointerdown', () => (steer = d));
      btn.addEventListener('pointerup', () => (steer = 0));
      btn.addEventListener('pointerleave', () => (steer = 0));
    }
    const root = h(
      'div',
      { class: 'river-ui' },
      status,
      h('div', { class: 'hs-row' }, left, right),
    );
    document.body.append(root);
    const keys = new Set<string>();
    const onKey = (e: KeyboardEvent) => {
      if (e.type === 'keydown') keys.add(e.code);
      else keys.delete(e.code);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);

    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const keySteer =
        (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) -
        (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
      const s = keySteer || steer;
      offset = THREE.MathUtils.clamp(offset + s * STEER * dt, -MAX_SIDE, MAX_SIDE);
      travelled += SPEED * dt * (splash > 0 ? 0.4 : 1);
      splash = Math.max(0, splash - dt);

      spawnTimer -= dt;
      if (spawnTimer < 0 && travelled < length - 4) {
        makeLog();
        spawnTimer = 1.1 + Math.random() * 0.9;
      }
      const me = east.clone().addScaledVector(dir, travelled).addScaledVector(side, -offset);
      for (const log of logs) {
        log.pos.x += DRIFT * dt;
        log.obj.position.set(
          log.pos.x,
          riverWater(log.pos.x) + 0.12 + Math.sin(now / 400 + log.pos.z) * 0.05,
          log.pos.z,
        );
        log.obj.rotation.x = Math.sin(now / 700 + log.pos.x) * 0.1;
        // Logs lie across the current (along x): collide with a short segment.
        const dx = Math.max(Math.abs(me.x - log.pos.x) - 1.8, 0);
        const dz = me.z - log.pos.z;
        if (!log.hit && Math.hypot(dx, dz) < 0.9) {
          log.hit = true;
          hits++;
          splash = 0.8;
          toast('Plask! 💦', 1200);
          if (!said) {
            said = true;
            void narrator.play(line('plask'));
          }
        }
      }
      // Bob as you wade; a splash gives a little shake.
      const bob = Math.sin(now / 180) * 0.05 + (splash > 0 ? Math.sin(now / 30) * 0.08 : 0);
      game.placePlayer(me.x, me.z, yaw - s * 0.08, -0.08, bob - 0.1);
      status.textContent = `${Math.round((travelled / length) * 100)} % over · ${hits} plask`;

      if (travelled >= length) {
        cancelAnimationFrame(raf);
        for (const log of logs) log.obj.removeFromParent();
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('keyup', onKey);
        root.remove();
        resolve({ hits });
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
}
