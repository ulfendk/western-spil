import * as THREE from 'three';
import { outline, part } from '../toon.js';

/** A pine tree: stacked cones, sometimes with snow on the tips. */
export function buildPine(rand: () => number, snowy = false): THREE.Group {
  const g = new THREE.Group();
  const h = 6 + rand() * 6;
  g.add(part(new THREE.CylinderGeometry(0.18, 0.3, h * 0.35, 6), '#5e3a1a', [0, h * 0.17, 0]));
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const r = (1 - i / tiers) * h * 0.28 + 0.4;
    const y = h * 0.25 + (i * h * 0.7) / tiers;
    const c = ['#2f5a3a', '#3a6b44', '#2a5034'][i % 3]!;
    g.add(
      part(new THREE.ConeGeometry(r, h * 0.36, 8), c, [0, y + h * 0.15, 0], [0, rand(), 0], {
        flatShading: true,
      }),
    );
    if (snowy)
      g.add(part(new THREE.ConeGeometry(r * 0.55, h * 0.12, 8), '#f4f6fb', [0, y + h * 0.28, 0]));
  }
  return outline(g, 0.03);
}

/** Timber-framed mine entrance cut into a rock face, with rails running out of it. Faces +z. */
export function buildMineEntrance(sign: string, signTex: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  // Dark mouth, timber posts and a lintel.
  const mouth = part(new THREE.PlaneGeometry(3.6, 3.8), '#0d0906', [0, 1.9, 0.05]);
  mouth.userData.noOutline = true;
  g.add(mouth);
  for (const x of [-1.9, 1.9])
    g.add(part(new THREE.BoxGeometry(0.35, 4.2, 0.35), '#6b4423', [x, 2.1, 0.2]));
  g.add(part(new THREE.BoxGeometry(4.6, 0.4, 0.45), '#6b4423', [0, 4.25, 0.2]));
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(3, 0.7, 0.1),
    new THREE.MeshToonMaterial({ map: signTex }),
  );
  board.position.set(0, 4.85, 0.3);
  board.userData.label = sign;
  g.add(board);
  // Rails coming out of the mine.
  for (const x of [-0.55, 0.55])
    g.add(part(new THREE.BoxGeometry(0.08, 0.1, 7), '#6f7479', [x, 0.12, 3.2]));
  for (let z = 0.2; z < 6.5; z += 0.7)
    g.add(part(new THREE.BoxGeometry(1.6, 0.08, 0.2), '#5e4128', [0, 0.05, z]));
  // A mine cart waiting at the entrance.
  const cart = new THREE.Group();
  cart.add(
    part(
      new THREE.CylinderGeometry(0.9, 0.7, 0.9, 4, 1),
      '#6f5a45',
      [0, 0.85, 0],
      [0, Math.PI / 4, 0],
    ),
  );
  for (const [x, z] of [
    [-0.55, -0.45],
    [0.55, -0.45],
    [-0.55, 0.45],
    [0.55, 0.45],
  ] as const) {
    cart.add(
      part(
        new THREE.CylinderGeometry(0.2, 0.2, 0.1, 10),
        '#3a3330',
        [x, 0.25, z],
        [0, 0, Math.PI / 2],
      ),
    );
  }
  cart.position.set(0, 0, 3.4);
  g.add(cart);
  return outline(g, 0.025);
}

/** Boulders piled up in front of a blasted tunnel. */
export function buildRockfall(rand: () => number, width: number): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const s = 0.7 + rand() * 1.6;
    const geo = new THREE.IcosahedronGeometry(s, 0);
    const rock = part(
      geo,
      ['#8d8a86', '#a29c94', '#7a756f'][i % 3]!,
      [(rand() - 0.5) * width, s * 0.6 + rand() * 1.5, rand() * 2.5],
      [rand(), rand(), rand()],
      {
        flatShading: true,
      },
    );
    g.add(rock);
  }
  return outline(g, 0.03);
}

/** A rope bridge from x0 to x1 at height y along z; sways with `setSway`. */
export function buildRopeBridge(
  x0: number,
  x1: number,
  z: number,
  y: number,
): THREE.Group & { setSway(amount: number): void } {
  const g = new THREE.Group() as THREE.Group & { setSway(amount: number): void };
  const deck = new THREE.Group();
  const len = Math.abs(x1 - x0);
  const n = Math.floor(len / 0.45);
  const planks: THREE.Object3D[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const plank = part(
      new THREE.BoxGeometry(0.36, 0.07, 1.6),
      i % 5 === 3 ? '#6b4a2e' : '#8f6a40',
      [0, 0, 0],
      [0, 0, (i % 3) * 0.02],
    );
    plank.position.set(x0 + (x1 - x0) * t, -Math.sin(t * Math.PI) * 0.8, 0);
    deck.add(plank);
    planks.push(plank);
  }
  // Rope handrails and hangers.
  const ropePts: number[] = [];
  for (const side of [-0.85, 0.85]) {
    for (let i = 0; i < n; i++) {
      const a = planks[i]!.position;
      const b = planks[i + 1]!.position;
      ropePts.push(a.x, a.y + 1.1, side, b.x, b.y + 1.1, side);
      if (i % 2 === 0) ropePts.push(a.x, a.y + 1.1, side, a.x, a.y, side);
    }
  }
  deck.add(
    new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.Float32BufferAttribute(ropePts, 3),
      ),
      new THREE.LineBasicMaterial({ color: '#c8a064' }),
    ),
  );
  g.add(outline(deck, 0.015));
  for (const x of [x0, x1]) {
    for (const side of [-0.9, 0.9])
      g.add(part(new THREE.CylinderGeometry(0.12, 0.14, 2, 7), '#6b4423', [x, 0.8, side]));
  }
  g.position.set(0, y, z);
  g.setSway = (a) => {
    deck.rotation.x = a * 0.12;
    deck.position.y = -Math.abs(a) * 0.1;
  };
  return g;
}
