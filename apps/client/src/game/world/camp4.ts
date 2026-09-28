import * as THREE from 'three';
import { mulberry32 } from '../noise.js';
import { outline, part, toon } from '../toon.js';

/** Painted tipi cover: tan hide with geometric bands near the bottom and top. */
function tipiTexture(seed: number): THREE.CanvasTexture {
  const rand = mulberry32(seed);
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#e6d2a8';
  ctx.fillRect(0, 0, 512, 256);
  // Subtle hide texture.
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = `rgba(150,110,60,${rand() * 0.08})`;
    ctx.fillRect(rand() * 512, rand() * 256, 4 + rand() * 20, 2 + rand() * 6);
  }
  const palettes = [
    ['#b8322a', '#2f4a78', '#1b1b1b'],
    ['#2f6b4a', '#d9a441', '#1b1b1b'],
    ['#3d6b8a', '#c8553d', '#f3ecdc'],
  ];
  const [a, b, ink] = palettes[seed % palettes.length]!;
  // Bottom band of triangles (mountains) and a top band (stripes).
  ctx.fillStyle = a!;
  ctx.fillRect(0, 205, 512, 51);
  ctx.fillStyle = b!;
  for (let x = 0; x < 512; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 205);
    ctx.lineTo(x + 16, 175);
    ctx.lineTo(x + 32, 205);
    ctx.fill();
  }
  ctx.fillStyle = ink!;
  ctx.fillRect(0, 202, 512, 4);
  ctx.fillStyle = b!;
  ctx.fillRect(0, 36, 512, 14);
  ctx.fillStyle = a!;
  ctx.fillRect(0, 50, 512, 6);
  // A few painted circles (like stars or suns) around the middle.
  ctx.fillStyle = a!;
  for (let x = 40; x < 512; x += 128) {
    ctx.beginPath();
    ctx.arc(x + rand() * 20, 110 + rand() * 20, 12, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A Lakota tipi; the door faces local +x, which the camp turns to face east. */
export function buildTipi(seed: number, height = 6): THREE.Group {
  const g = new THREE.Group();
  const r = height * 0.42;
  const cover = new THREE.Mesh(
    new THREE.ConeGeometry(r, height, 24, 1, true),
    new THREE.MeshToonMaterial({ map: tipiTexture(seed), side: THREE.DoubleSide }),
  );
  cover.position.y = height / 2;
  cover.castShadow = cover.receiveShadow = true;
  g.add(cover);
  // Poles crossing at the top and fanning out above the smoke hole.
  const rand = mulberry32(seed + 9);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rand() * 0.2;
    const pole = part(
      new THREE.CylinderGeometry(0.04, 0.05, height * 1.35, 5),
      '#7a5230',
      [0, 0, 0],
    );
    const tilt = Math.atan2(r, height);
    pole.position.set(Math.cos(a) * r * 0.08, height * 0.66, Math.sin(a) * r * 0.08);
    pole.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
    g.add(pole);
  }
  // Door flap on the east side.
  const door = part(
    new THREE.CircleGeometry(0.6, 16),
    '#5e3a1a',
    [r - 0.28, 0.75, 0],
    [0, Math.PI / 2, 0],
  );
  door.scale.y = 1.4;
  door.rotation.x = 0;
  door.lookAt(new THREE.Vector3(10, 0.75, 0));
  door.userData.noOutline = true;
  g.add(door);
  return outline(g, 0.02);
}

/** Cottonwood: a twisty trunk and a big lumpy crown. */
export function buildCottonwood(rand: () => number): THREE.Group {
  const g = new THREE.Group();
  const h = 5 + rand() * 3;
  g.add(
    part(
      new THREE.CylinderGeometry(0.28, 0.45, h, 8),
      '#7a6a58',
      [0, h / 2, 0],
      [rand() * 0.1, 0, rand() * 0.1],
    ),
  );
  const leaf = ['#6f8f3a', '#86a246', '#5d7d34'];
  for (let i = 0; i < 6; i++) {
    const s = 1.6 + rand() * 1.4;
    const blob = part(
      new THREE.IcosahedronGeometry(s, 1),
      leaf[i % 3]!,
      [(rand() - 0.5) * 3, h + rand() * 2, (rand() - 0.5) * 3],
      [0, 0, 0],
      { flatShading: true },
    );
    g.add(blob);
  }
  return outline(g, 0.03);
}

/** A wooden drying rack with a few hides and cloths hung over it. */
export function buildRack(): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-1.5, 1.5]) {
    g.add(part(new THREE.CylinderGeometry(0.05, 0.06, 2, 5), '#7a5230', [x, 1, 0]));
  }
  g.add(
    part(
      new THREE.CylinderGeometry(0.04, 0.04, 3.4, 5),
      '#7a5230',
      [0, 1.9, 0],
      [0, 0, Math.PI / 2],
    ),
  );
  for (const [x, c] of [
    [-0.9, '#c89a62'],
    [0.2, '#b07a42'],
    [1, '#3d6b8a'],
  ] as const) {
    g.add(part(new THREE.BoxGeometry(0.7, 1.1, 0.04), c, [x, 1.35, 0]));
  }
  return outline(g, 0.02);
}

/** Wooden bucket (for fetching water). */
export function buildBucket(): THREE.Group {
  const g = new THREE.Group();
  g.add(part(new THREE.CylinderGeometry(0.22, 0.18, 0.35, 12), '#8a5a2b', [0, 0.18, 0]));
  g.add(part(new THREE.TorusGeometry(0.2, 0.015, 4, 12, Math.PI), '#3a3330', [0, 0.36, 0]));
  return outline(g, 0.015);
}

export { toon };
