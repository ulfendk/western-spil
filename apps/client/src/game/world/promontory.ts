import * as THREE from 'three';
import { mergeLocal } from './batch.js';
import { outline, part } from '../toon.js';
import type { Npc } from './npc.js';

/**
 * A 4-4-0 steam locomotive, standing still, facing −z. Colours tell the two apart:
 * Central Pacific's "Jupiter" and Union Pacific's "No. 119".
 */
export function buildLocomotive(o: {
  boiler: string;
  cab: string;
  trim: string;
  wheels: string;
  name: string;
}): THREE.Group {
  const g = new THREE.Group();
  g.add(part(new THREE.BoxGeometry(2.2, 0.3, 7), '#2a2a2a', [0, 0.9, 0]));
  g.add(
    part(
      new THREE.CylinderGeometry(0.85, 0.85, 4.4, 20),
      o.boiler,
      [0, 1.95, -1.1],
      [Math.PI / 2, 0, 0],
    ),
  );
  for (const z of [-2.6, -1.3, 0, 0.9])
    g.add(part(new THREE.TorusGeometry(0.86, 0.05, 6, 20), o.trim, [0, 1.95, z]));
  g.add(
    part(
      new THREE.CylinderGeometry(0.87, 0.87, 0.2, 20),
      o.trim,
      [0, 1.95, -3.3],
      [Math.PI / 2, 0, 0],
    ),
  );
  g.add(part(new THREE.BoxGeometry(0.6, 0.5, 0.5), o.trim, [0, 2.4, -3.3]));
  g.add(part(new THREE.SphereGeometry(0.24, 12, 8), '#fff2b0', [0, 2.4, -3.52]));
  g.add(part(new THREE.CylinderGeometry(0.22, 0.28, 1, 12), '#2a2a2a', [0, 3.1, -2.6]));
  g.add(part(new THREE.CylinderGeometry(0.66, 0.22, 0.95, 14), '#2a2a2a', [0, 4, -2.6]));
  g.add(part(new THREE.CylinderGeometry(0.7, 0.7, 0.12, 14), o.trim, [0, 4.5, -2.6]));
  g.add(part(new THREE.SphereGeometry(0.35, 12, 8), o.trim, [0, 2.9, -0.8]));
  g.add(part(new THREE.BoxGeometry(2.1, 2, 2), o.cab, [0, 2.3, 2.3]));
  g.add(part(new THREE.BoxGeometry(2.5, 0.15, 2.4), '#2a2a2a', [0, 3.35, 2.3]));
  // Name plate.
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = o.trim;
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#1b1b1b';
  ctx.font = '40px Rye, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(o.name, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  for (const side of [-1, 1]) {
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.35),
      new THREE.MeshBasicMaterial({ map: tex }),
    );
    plate.position.set(side * 1.07, 2.6, 2.3);
    plate.rotation.y = side * (Math.PI / 2);
    g.add(plate);
  }
  const catcher = part(
    new THREE.ConeGeometry(1.1, 1.2, 4),
    o.wheels,
    [0, 0.7, -3.9],
    [-Math.PI / 2, Math.PI / 4, 0],
  );
  catcher.scale.set(1, 1, 0.5);
  g.add(catcher);
  for (const [z, r] of [
    [-2.4, 0.45],
    [-1.6, 0.45],
    [-0.1, 0.8],
    [1.5, 0.8],
  ] as const) {
    for (const side of [-1, 1]) {
      g.add(
        part(
          new THREE.CylinderGeometry(r, r, 0.14, 16),
          o.wheels,
          [side * 0.82, r + 0.2, z],
          [0, 0, Math.PI / 2],
        ),
      );
    }
  }
  return outline(g, 0.04);
}

/** Wooden cattle car with slatted sides (where the Bøvl brothers end up). */
export function buildCattleCar(): THREE.Group {
  const g = new THREE.Group();
  g.add(part(new THREE.BoxGeometry(2.4, 0.3, 7), '#2a2a2a', [0, 0.9, 0]));
  for (let i = 0; i < 6; i++) {
    for (const side of [-1, 1])
      g.add(part(new THREE.BoxGeometry(0.08, 0.16, 7), '#8a4b22', [side * 1.2, 1.3 + i * 0.35, 0]));
  }
  for (const z of [-3.45, 3.45])
    g.add(part(new THREE.BoxGeometry(2.4, 2.2, 0.1), '#8a4b22', [0, 2.1, z]));
  g.add(part(new THREE.BoxGeometry(2.7, 0.15, 7.4), '#5b3a1d', [0, 3.3, 0]));
  for (const z of [-2.5, 2.5]) {
    for (const side of [-1, 1])
      g.add(
        part(
          new THREE.CylinderGeometry(0.45, 0.45, 0.14, 14),
          '#3a3330',
          [side * 0.82, 0.65, z],
          [0, 0, Math.PI / 2],
        ),
      );
  }
  return outline(g, 0.03);
}

function figure(npc: Npc, body: THREE.Group, turnSpeed = 4): Npc {
  let target: THREE.Vector3 | null = null;
  npc.lookAtPlayer = (p) => (target = p);
  npc.update = (dt, time) => {
    body.position.y = Math.sin(time * 1.3 + npc.position.x) * 0.01;
    let desired = 0;
    if (target) {
      const local = npc.worldToLocal(target.clone());
      desired = Math.atan2(-local.x, -local.z);
    }
    const diff = Math.atan2(
      Math.sin(desired - body.rotation.y),
      Math.cos(desired - body.rotation.y),
    );
    body.rotation.y += diff * (1 - Math.exp(-dt * turnSpeed));
  };
  return npc;
}

/** Formand Li: foreman of a Central Pacific track crew, in a work tunic and a wide straw hat. */
export function buildForeman(): Npc {
  const skin = '#e8bf94';
  const npc = new THREE.Group() as Npc;
  const body = new THREE.Group();
  npc.add(body);
  for (const side of [-1, 1]) {
    body.add(part(new THREE.CapsuleGeometry(0.1, 0.6, 4, 8), '#2f3440', [side * 0.13, 0.45, 0]));
    body.add(part(new THREE.BoxGeometry(0.15, 0.1, 0.26), '#1e1a16', [side * 0.13, 0.05, -0.05]));
  }
  body.add(part(new THREE.CapsuleGeometry(0.27, 0.55, 4, 12), '#3d6b8a', [0, 1.3, 0]));
  body.add(part(new THREE.CylinderGeometry(0.28, 0.28, 0.07, 14), '#1e1a16', [0, 1.02, 0]));
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.34, 1.6, 0);
    arm.add(part(new THREE.CapsuleGeometry(0.085, 0.45, 4, 8), '#3d6b8a', [0, -0.27, 0]));
    arm.add(part(new THREE.SphereGeometry(0.075, 8, 6), skin, [0, -0.57, 0]));
    arm.rotation.z = side * 0.12;
    body.add(arm);
  }
  body.add(part(new THREE.SphereGeometry(0.21, 16, 12), skin, [0, 1.92, 0]));
  body.add(part(new THREE.SphereGeometry(0.04, 8, 6), '#d9a07a', [0, 1.9, -0.21]));
  for (const side of [-1, 1])
    body.add(part(new THREE.SphereGeometry(0.025, 6, 4), '#1b1b1b', [side * 0.07, 1.96, -0.185]));
  body.add(part(new THREE.ConeGeometry(0.5, 0.28, 18), '#d9c088', [0, 2.2, 0]));
  // A rolled plan of the track under one arm: he's the foreman.
  body.add(
    part(
      new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8),
      '#f3ecdc',
      [0.4, 1.25, -0.1],
      [0.3, 0, Math.PI / 2],
    ),
  );
  mergeLocal(outline(body, 0.018));
  return figure(npc, body);
}

/** One of the four Bøvl brothers: long coat, bandana, hat. `size` 0.8 … 1.35. */
export function buildBoevl(size: number, coat: string): Npc {
  const npc = new THREE.Group() as Npc;
  const body = new THREE.Group();
  npc.add(body);
  for (const side of [-1, 1]) {
    body.add(part(new THREE.CapsuleGeometry(0.1, 0.55, 4, 8), '#3a3330', [side * 0.13, 0.42, 0]));
    body.add(part(new THREE.BoxGeometry(0.17, 0.12, 0.3), '#1e1a16', [side * 0.13, 0.06, -0.05]));
  }
  body.add(part(new THREE.CylinderGeometry(0.25, 0.4, 1.1, 14), coat, [0, 0.95, 0]));
  body.add(part(new THREE.CapsuleGeometry(0.25, 0.3, 4, 12), coat, [0, 1.45, 0]));
  body.add(part(new THREE.SphereGeometry(0.2, 14, 10), '#f1c9a0', [0, 1.88, 0]));
  body.add(part(new THREE.ConeGeometry(0.2, 0.2, 12), '#b8322a', [0, 1.8, -0.05], [Math.PI, 0, 0]));
  for (const side of [-1, 1])
    body.add(part(new THREE.SphereGeometry(0.025, 6, 4), '#1b1b1b', [side * 0.07, 1.93, -0.18]));
  body.add(part(new THREE.CylinderGeometry(0.36, 0.36, 0.035, 18), '#2a2a2a', [0, 2.04, 0]));
  body.add(part(new THREE.CylinderGeometry(0.17, 0.2, 0.24, 14), '#2a2a2a', [0, 2.18, 0]));
  body.scale.setScalar(size);
  mergeLocal(outline(body, 0.02));
  return figure(npc, body, 6);
}
