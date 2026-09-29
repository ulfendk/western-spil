import * as THREE from 'three';
import { markStatic } from './batch.js';
import { mulberry32 } from '../noise.js';
import { outline, part } from '../toon.js';
import type { Colliders } from './colliders.js';
import {
  buildContestCorner,
  posterSpotsOn,
  type ContestSpot,
  type PosterSpot,
} from './contestCorner.js';
import { heightAt, trailX } from './terrain.js';

/** Layout of a frontier town along the trail. */
export interface TownConfig {
  name: string;
  /** Main street runs along the trail from zStart to zEnd. */
  zStart: number;
  zEnd: number;
  /** The welcome arch stands at this end of the street (where travellers arrive). */
  arch: 'start' | 'end';
  /** [sign, z, floors] for buildings on the west and east side of the street. */
  west: [string, number, 1 | 2][];
  east: [string, number, 1 | 2][];
  /** z of the open square (west side) with the horseshoe pit. */
  squareZ: number;
  church?: number;
  waterTowerZ: number;
  seed: number;
}

export const ST_LOUIS_TOWN: TownConfig = {
  name: 'ST. LOUIS',
  zStart: 100,
  zEnd: 178,
  arch: 'start',
  west: [
    ['SALOON', 110, 2],
    ['KØBMAND', 123, 1],
    ['SHERIFF', 160, 1],
  ],
  east: [
    ['HOTEL', 108, 2],
    ['POSTHUS', 121, 1],
    ['BANK', 133, 1],
    ['SMED', 145, 1],
    ['STALD', 157, 1],
  ],
  squareZ: 143,
  church: 171,
  waterTowerZ: 140,
  seed: 2024,
};

export interface TownSpots {
  config: TownConfig;
  /** False for meeting places without a horseshoe pit (the camp). */
  hasPit?: boolean;
  /** Is this point inside the town (for the first-visit welcome)? */
  contains(p: THREE.Vector3): boolean;
  /** Middle of the main street. */
  center: THREE.Vector3;
  /** Horseshoe pit: throw line, stake and throwing direction (unit vector). */
  pitStart: THREE.Vector3;
  pitStake: THREE.Vector3;
  pitDir: THREE.Vector3;
  /** Where the town contests start (none at the camp). */
  contests?: ContestSpot[];
  /** Walls where wanted posters can hang in the poster hunt. */
  posterSpots?: PosterSpot[];
}

export function signTexture(
  text: string,
  bg: string,
  fg: string,
  w = 512,
  h = 128,
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.fillStyle = fg;
  ctx.font = `${Math.floor(h * 0.55)}px Rye, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface BuildingOptions {
  sign: string;
  width: number;
  depth: number;
  height: number;
  color: string;
  trim: string;
  floors?: 1 | 2;
}

/**
 * Classic false-front western building. The front faces local +z at z = 0 and the
 * body extends backwards; a porch roof and boardwalk stick out in front.
 */
function building(o: BuildingOptions): THREE.Group {
  const g = new THREE.Group();
  const { width: w, depth: d, height: h } = o;
  const frontH = h + 1.6;
  g.add(part(new THREE.BoxGeometry(w, h, d), o.color, [0, h / 2, -d / 2]));
  g.add(gableRoof(w, d, h, '#6b4a2e'));
  // The tall false front with a stepped top and trim.
  g.add(part(new THREE.BoxGeometry(w + 0.2, frontH, 0.25), o.color, [0, frontH / 2, 0.05]));
  g.add(part(new THREE.BoxGeometry(w + 0.5, 0.25, 0.45), o.trim, [0, frontH, 0.1]));
  g.add(part(new THREE.BoxGeometry(w * 0.5, 0.6, 0.25), o.color, [0, frontH + 0.4, 0.05]));
  g.add(part(new THREE.BoxGeometry(w * 0.5 + 0.3, 0.18, 0.4), o.trim, [0, frontH + 0.75, 0.1]));
  // Sign board.
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.8, 0.9, 0.12),
    new THREE.MeshToonMaterial({ map: signTexture(o.sign, '#f3e2b3', '#3a2615') }),
  );
  sign.position.set(0, frontH - 0.7, 0.25);
  sign.castShadow = true;
  g.add(sign);
  // Door and windows.
  g.add(part(new THREE.BoxGeometry(1.3, 2.3, 0.1), '#4a2c14', [0, 1.35, 0.2]));
  g.add(part(new THREE.BoxGeometry(1.1, 0.1, 0.12), o.trim, [0, 2.55, 0.22]));
  for (const side of [-1, 1]) {
    const wx = side * (w / 2 - 1.3);
    g.add(part(new THREE.BoxGeometry(1.3, 1.4, 0.08), '#9fd0da', [wx, 1.6, 0.2]));
    g.add(part(new THREE.BoxGeometry(1.5, 0.12, 0.14), o.trim, [wx, 2.35, 0.22]));
    g.add(part(new THREE.BoxGeometry(1.5, 0.12, 0.14), o.trim, [wx, 0.85, 0.22]));
    g.add(part(new THREE.BoxGeometry(0.06, 1.4, 0.1), o.trim, [wx, 1.6, 0.25]));
    if (o.floors === 2) {
      g.add(part(new THREE.BoxGeometry(1, 1.1, 0.08), '#9fd0da', [side * (w / 4), 4.4, 0.2]));
      g.add(part(new THREE.BoxGeometry(1.2, 0.12, 0.14), o.trim, [side * (w / 4), 5.0, 0.22]));
    }
  }
  // Porch roof on posts, boardwalk and a hitching rail.
  g.add(part(new THREE.BoxGeometry(w + 0.4, 0.14, 2.6), '#7a5230', [0, 3.2, 1.3], [0.12, 0, 0]));
  for (const x of [-w / 2, 0, w / 2]) {
    g.add(part(new THREE.BoxGeometry(0.16, 3.1, 0.16), '#6b4a2e', [x, 1.55, 2.45]));
  }
  g.add(part(new THREE.BoxGeometry(w + 0.4, 0.2, 2.7), '#8f6a40', [0, 0.1, 1.3]));
  g.add(part(new THREE.BoxGeometry(w * 0.6, 0.1, 0.1), '#5e3a1a', [0, 0.95, 3.4]));
  for (const x of [-w * 0.3, w * 0.3])
    g.add(part(new THREE.BoxGeometry(0.12, 1, 0.12), '#5e3a1a', [x, 0.5, 3.4]));
  return outline(g, 0.025);
}

function church(): THREE.Group {
  const g = new THREE.Group();
  const white = '#efe9dc';
  g.add(part(new THREE.BoxGeometry(6, 4.5, 10), white, [0, 2.25, -5]));
  g.add(gableRoof(6, 10, 4.5, '#8a3d2e', 2.2));
  // Steeple with a bell.
  g.add(part(new THREE.BoxGeometry(2.4, 3.4, 2.4), white, [0, 6.2, -0.8]));
  g.add(part(new THREE.BoxGeometry(1.4, 1.2, 2.5), '#3a2615', [0, 6.8, -0.8]));
  g.add(
    part(
      new THREE.SphereGeometry(0.45, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      '#d9a441',
      [0, 6.5, -0.8],
      [Math.PI, 0, 0],
    ),
  );
  g.add(part(new THREE.ConeGeometry(1.9, 3.6, 4), '#8a3d2e', [0, 9.7, -0.8], [0, Math.PI / 4, 0]));
  g.add(part(new THREE.BoxGeometry(0.12, 1, 0.12), '#3a2615', [0, 12, -0.8]));
  g.add(part(new THREE.BoxGeometry(0.6, 0.12, 0.12), '#3a2615', [0, 12.2, -0.8]));
  g.add(part(new THREE.BoxGeometry(1.8, 2.8, 0.1), '#6b4423', [0, 1.4, 0.02]));
  for (const side of [-1, 1])
    g.add(part(new THREE.BoxGeometry(0.9, 1.8, 0.1), '#9fd0da', [side * 2, 2.4, 0.02]));
  return outline(g, 0.025);
}

function waterTower(): THREE.Group {
  const g = new THREE.Group();
  for (const [x, z] of [
    [-1.6, -1.6],
    [1.6, -1.6],
    [-1.6, 1.6],
    [1.6, 1.6],
  ] as const) {
    g.add(part(new THREE.BoxGeometry(0.25, 7, 0.25), '#6b4a2e', [x, 3.5, z]));
  }
  g.add(part(new THREE.BoxGeometry(3.6, 0.2, 3.6), '#6b4a2e', [0, 7, 0]));
  g.add(part(new THREE.CylinderGeometry(2.1, 2.1, 3.2, 16), '#8a5a2b', [0, 8.7, 0]));
  for (const y of [7.6, 9.8])
    g.add(
      part(new THREE.TorusGeometry(2.12, 0.05, 4, 20), '#3a3330', [0, y, 0], [Math.PI / 2, 0, 0]),
    );
  g.add(part(new THREE.ConeGeometry(2.4, 1.4, 16), '#5e3a1a', [0, 11, 0]));
  return outline(g, 0.03);
}

export function barrel(): THREE.Group {
  const g = new THREE.Group();
  g.add(part(new THREE.CylinderGeometry(0.34, 0.34, 0.9, 12), '#a8743d', [0, 0.45, 0]));
  for (const y of [0.2, 0.7])
    g.add(
      part(new THREE.TorusGeometry(0.345, 0.02, 4, 12), '#3a3330', [0, y, 0], [Math.PI / 2, 0, 0]),
    );
  return outline(g, 0.02);
}

function trough(): THREE.Group {
  const g = new THREE.Group();
  g.add(part(new THREE.BoxGeometry(2.2, 0.6, 0.7), '#7a5230', [0, 0.3, 0]));
  const water = part(new THREE.BoxGeometry(2, 0.05, 0.5), '#5fa8c2', [0, 0.55, 0]);
  water.userData.noOutline = true;
  g.add(water);
  return outline(g, 0.02);
}

/**
 * Gable roof over a w×d body of height h: two slopes meeting in a ridge that runs
 * front to back, plus triangular gable ends.
 */
export function gableRoof(w: number, d: number, h: number, color: string, rise = 1.3): THREE.Group {
  const g = new THREE.Group();
  const half = w / 2 + 0.3;
  const slope = Math.hypot(half, rise);
  const angle = Math.atan2(rise, half);
  for (const side of [-1, 1]) {
    const panel = part(
      new THREE.BoxGeometry(slope, 0.14, d + 0.4),
      color,
      [0, 0, 0],
      [0, 0, -side * angle],
    );
    panel.position.set((side * half) / 2, h + rise / 2, -d / 2);
    g.add(panel);
  }
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, rise);
  shape.closePath();
  const gable = new THREE.ShapeGeometry(shape);
  for (const z of [-d + 0.01, -0.01]) {
    const m = part(gable, '#8f6a40', [0, h, z], [0, z < -0.5 ? Math.PI : 0, 0]);
    m.userData.noOutline = true;
    g.add(m);
  }
  return g;
}

/** Street-facing yaw for a building on the west (+x facing) or east (−x facing) side. */
const FACE_EAST = Math.PI / 2;
const FACE_WEST = -Math.PI / 2;

export function buildTown(scene: THREE.Scene, colliders: Colliders, cfg: TownConfig): TownSpots {
  const rand = mulberry32(cfg.seed);
  const street = (z: number) => trailX(z);
  /** Front line of the buildings, measured from the middle of the street. */
  const FRONT = 8.5;

  const posterSpots: PosterSpot[] = [];
  const place = (obj: THREE.Object3D, side: -1 | 1, z: number, depth: number, width: number) => {
    const x = street(z) + side * FRONT;
    obj.position.set(x, heightAt(x, z) - 0.05, z);
    obj.rotation.y = side < 0 ? FACE_EAST : FACE_WEST;
    scene.add(markStatic(obj));
    posterSpotsOn(obj, width, posterSpots);
    // Collider covers the body and the porch.
    const centerOffset = (depth - 2.8) / 2;
    const cx = x + side * centerOffset;
    colliders.addBox(cx, z, width + 0.4, depth + 2.8, obj.rotation.y);
  };

  const palette = [
    ['#c8553d', '#f3e2b3'],
    ['#6f9a8e', '#f3e2b3'],
    ['#d9a441', '#5e3a1a'],
    ['#8aa3b8', '#f3e2b3'],
    ['#b07a42', '#f3e2b3'],
    ['#a15c7a', '#f3e2b3'],
  ];
  const { west, east } = cfg;
  let i = 0;
  for (const [side, list] of [
    [-1, west],
    [1, east],
  ] as const) {
    for (const [sign, z, floors] of list) {
      const width = 7 + rand() * 2.5;
      const depth = 9;
      const [color, trim] = palette[i++ % palette.length]!;
      const b = building({
        sign,
        width,
        depth,
        height: floors === 2 ? 5.6 : 3.8,
        color: color!,
        trim: trim!,
        floors,
      });
      place(b, side, z, depth, width);
    }
  }
  if (cfg.church !== undefined) place(church(), -1, cfg.church, 10, 6.4);

  // Welcome arch over the street at the edge of town, facing arriving travellers.
  const archZ = cfg.arch === 'start' ? cfg.zStart - 5 : cfg.zEnd + 5;
  const arch = new THREE.Group();
  for (const side of [-1, 1])
    arch.add(part(new THREE.BoxGeometry(0.4, 6, 0.4), '#6b4a2e', [side * 5, 3, 0]));
  arch.add(part(new THREE.BoxGeometry(11, 0.3, 0.4), '#6b4a2e', [0, 5.6, 0]));
  const archSign = new THREE.Mesh(
    new THREE.BoxGeometry(6, 1.1, 0.15),
    new THREE.MeshToonMaterial({ map: signTexture(cfg.name, '#b07a42', '#2a1a0c') }),
  );
  archSign.position.set(0, 4.8, 0);
  archSign.rotation.y = cfg.arch === 'start' ? Math.PI : 0;
  arch.add(archSign);
  const ax = street(archZ);
  arch.position.set(ax, heightAt(ax, archZ), archZ);
  scene.add(markStatic(outline(arch, 0.03)));
  for (const side of [-1, 1]) colliders.add(ax + side * 5, archZ, 0.4);

  // Water tower behind the east side, props along the boardwalks.
  const wt = waterTower();
  const wz = cfg.waterTowerZ;
  const wx = street(wz) + 24;
  wt.position.set(wx, heightAt(wx, wz), wz);
  scene.add(markStatic(wt));
  colliders.add(wx, wz, 2.6);
  for (let z = cfg.zStart + 2; z < cfg.zEnd; z += 6 + rand() * 6) {
    const side = rand() < 0.5 ? -1 : 1;
    if (side < 0 && Math.abs(z - cfg.squareZ) < 11) continue; // keep the square open
    const x = street(z) + side * (FRONT - 1.6);
    const prop = rand() < 0.7 ? barrel() : trough();
    prop.position.set(x, heightAt(x, z), z);
    prop.rotation.y = rand() * Math.PI;
    scene.add(markStatic(prop));
    colliders.add(x, z, prop.children.length > 3 ? 1.1 : 0.45);
  }

  // Horseshoe pit on the square, thrown westwards away from the street.
  const pitZ = cfg.squareZ;
  const startX = street(pitZ) - 6;
  const pitStart = new THREE.Vector3(startX, heightAt(startX, pitZ), pitZ);
  const pitDir = new THREE.Vector3(-1, 0, 0);
  const pitStake = pitStart.clone().addScaledVector(pitDir, 12);
  pitStake.y = heightAt(pitStake.x, pitStake.z);
  scene.add(markStatic(buildPit(pitStart, pitStake)));
  const contests = buildContestCorner(scene, colliders, pitStart, pitDir);

  const cz = (cfg.zStart + cfg.zEnd) / 2;
  return {
    config: cfg,
    contains: (p) => p.z > cfg.zStart && p.z < cfg.zEnd && Math.abs(p.x - street(p.z)) < 26,
    center: new THREE.Vector3(street(cz), heightAt(street(cz), cz), cz),
    pitStart,
    pitStake,
    pitDir,
    contests,
    posterSpots,
  };
}

/** Sand pit with a throw line and an iron stake, plus a scoreboard sign. */
export function buildPit(start: THREE.Vector3, stake: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  const len = start.distanceTo(stake);
  const mid = start.clone().lerp(stake, 0.5);
  const sand = part(new THREE.BoxGeometry(len + 3, 0.12, 3), '#e6c98f', [
    mid.x,
    mid.y + 0.02,
    mid.z,
  ]);
  sand.userData.noOutline = true;
  g.add(sand);
  // Throw line and a small box around the stake.
  g.add(part(new THREE.BoxGeometry(0.12, 0.15, 3), '#f7f3ea', [start.x, start.y + 0.05, start.z]));
  g.add(part(new THREE.BoxGeometry(1.6, 0.18, 1.6), '#b89a66', [stake.x, stake.y + 0.05, stake.z]));
  g.add(
    part(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 8), '#3a3330', [
      stake.x,
      stake.y + 0.45,
      stake.z,
    ]),
  );
  // Painted sign.
  const signPost = part(new THREE.BoxGeometry(0.15, 2.2, 0.15), '#6b4a2e', [
    start.x + 0.8,
    start.y + 1.1,
    start.z + 2.2,
  ]);
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.7, 0.1),
    new THREE.MeshToonMaterial({ map: signTexture('HESTESKO', '#f3e2b3', '#3a2615') }),
  );
  board.position.set(start.x + 0.8, start.y + 2.1, start.z + 2.2);
  board.rotation.y = Math.PI / 2;
  g.add(signPost, board);
  return outline(g, 0.02);
}
