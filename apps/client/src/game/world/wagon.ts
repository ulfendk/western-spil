import * as THREE from 'three';
import { outline, part } from '../toon.js';

const WOOD = '#8a5a2b';
const WOOD_DARK = '#5e3a1a';
const IRON = '#3a3330';
const CANVAS = '#f4ecd6';

/** Spoked wooden wagon wheel lying in the local YZ plane (axle along x). */
export function wheel(radius: number): THREE.Group {
  const g = new THREE.Group();
  g.add(
    part(new THREE.TorusGeometry(radius, 0.07, 8, 28), WOOD_DARK, [0, 0, 0], [0, Math.PI / 2, 0]),
  );
  g.add(
    part(
      new THREE.TorusGeometry(radius + 0.035, 0.035, 6, 28),
      IRON,
      [0, 0, 0],
      [0, Math.PI / 2, 0],
    ),
  );
  g.add(
    part(
      new THREE.CylinderGeometry(0.13, 0.13, 0.3, 12),
      WOOD_DARK,
      [0, 0, 0],
      [0, 0, Math.PI / 2],
    ),
  );
  const spokes = 12;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const spoke = part(new THREE.BoxGeometry(0.05, radius, 0.05), WOOD, [0, 0, 0]);
    spoke.position.set(0, (Math.cos(a) * radius) / 2, (Math.sin(a) * radius) / 2);
    spoke.rotation.x = a;
    g.add(spoke);
  }
  return g;
}

/** Wood-plank texture for the wagon box. */
function plankTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#9a6a38';
  ctx.fillRect(0, 0, 256, 64);
  for (let y = 0; y < 64; y += 16) {
    ctx.fillStyle = y % 32 ? '#8f6132' : '#a3703c';
    ctx.fillRect(0, y, 256, 15);
    ctx.fillStyle = '#4a2c12';
    ctx.fillRect(0, y + 15, 256, 1.5);
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = 'rgba(70,40,15,0.35)';
      ctx.beginPath();
      const yy = y + 3 + Math.random() * 10;
      ctx.moveTo(0, yy);
      ctx.bezierCurveTo(80, yy + 2, 160, yy - 2, 256, yy + 1);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Covered prairie ("Conestoga") wagon. It points along −z: the canvas arches
 * from the left side over the top to the right side, and runs front to back.
 */
export function buildWagon(): THREE.Group {
  const wagon = new THREE.Group();
  const length = 4.4;
  const width = 1.7;
  const bedY = 1.25;

  const plank = new THREE.MeshToonMaterial({ map: plankTexture() });
  const box = new THREE.Mesh(new THREE.BoxGeometry(width, 0.7, length), plank);
  box.position.y = bedY;
  box.castShadow = box.receiveShadow = true;
  wagon.add(box);
  // Blue-painted side boards, a classic Conestoga detail.
  for (const side of [-1, 1]) {
    wagon.add(
      part(new THREE.BoxGeometry(0.06, 0.18, length + 0.1), '#3d6b8a', [
        side * (width / 2 + 0.03),
        bedY + 0.3,
        0,
      ]),
    );
  }

  // Canvas bonnet: half-cylinder along z, arch across x, flaring up at both ends.
  const r = 1.05;
  const cover = new THREE.CylinderGeometry(r, r, length + 0.5, 24, 12, true, Math.PI / 2, Math.PI);
  cover.rotateX(Math.PI / 2);
  const pos = cover.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const t = Math.abs(z) / ((length + 0.5) / 2);
    const flare = 1 + t * t * 0.28;
    pos.setX(i, pos.getX(i) * (0.85 + t * t * 0.1));
    pos.setY(i, pos.getY(i) * 1.18 * flare);
  }
  cover.computeVertexNormals();
  const canvas = new THREE.Mesh(
    cover,
    new THREE.MeshToonMaterial({ color: CANVAS, side: THREE.DoubleSide }),
  );
  canvas.position.y = bedY + 0.3;
  canvas.castShadow = canvas.receiveShadow = true;
  wagon.add(canvas);

  // Bows (hoops) showing through the canvas.
  for (let i = 0; i < 5; i++) {
    const z = -length / 2 + 0.2 + (i * (length - 0.4)) / 4;
    const bow = part(new THREE.TorusGeometry(r * 0.87, 0.035, 6, 20, Math.PI), '#d9ccb0', [
      0,
      bedY + 0.3,
      z,
    ]);
    bow.scale.y = 1.2;
    wagon.add(bow);
  }
  // Dark openings at front and back.
  for (const end of [-1, 1]) {
    const hole = part(
      new THREE.CircleGeometry(0.75, 20, 0, Math.PI),
      '#3a2615',
      [0, bedY + 0.32, end * (length / 2 - 0.05)],
      [0, end > 0 ? 0 : Math.PI, 0],
    );
    hole.scale.y = 1.25;
    hole.userData.noOutline = true;
    wagon.add(hole);
  }

  // Wheels: big at the back, small at the front, axles across.
  for (const [z, radius] of [
    [1.45, 0.85],
    [-1.45, 0.62],
  ] as const) {
    wagon.add(
      part(
        new THREE.CylinderGeometry(0.06, 0.06, width + 0.6, 8),
        WOOD_DARK,
        [0, radius, z],
        [0, 0, Math.PI / 2],
      ),
    );
    for (const side of [-1, 1]) {
      const w = wheel(radius);
      w.position.set(side * (width / 2 + 0.22), radius, z);
      wagon.add(w);
    }
  }

  // Tongue and yoke, a water barrel and a toolbox.
  wagon.add(
    part(new THREE.BoxGeometry(0.12, 0.1, 2.6), WOOD, [0, 0.55, -length / 2 - 1.2], [0.12, 0, 0]),
  );
  wagon.add(part(new THREE.BoxGeometry(1.4, 0.1, 0.12), WOOD, [0, 0.4, -length / 2 - 2.4]));
  const barrel = new THREE.Group();
  barrel.add(part(new THREE.CylinderGeometry(0.28, 0.28, 0.7, 14), '#a8743d', [0, 0, 0]));
  barrel.add(part(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 14), '#a8743d', [0, 0, 0]));
  for (const y of [-0.25, 0.25])
    barrel.add(
      part(new THREE.TorusGeometry(0.285, 0.02, 4, 14), IRON, [0, y, 0], [Math.PI / 2, 0, 0]),
    );
  barrel.position.set(width / 2 + 0.3, bedY - 0.05, 0.3);
  wagon.add(barrel);
  wagon.add(
    part(new THREE.BoxGeometry(0.4, 0.35, 0.9), '#6b4423', [-(width / 2 + 0.22), bedY - 0.1, -0.6]),
  );
  // Lantern hanging at the back.
  wagon.add(
    part(new THREE.BoxGeometry(0.16, 0.24, 0.16), '#f2c14e', [0.5, bedY + 1.1, length / 2 + 0.28]),
  );

  return outline(wagon, 0.025);
}
