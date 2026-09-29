import * as THREE from 'three';
import type { ContestKind } from '@western/shared';
import { markStatic } from './batch.js';
import { outline, part } from '../toon.js';
import type { Colliders } from './colliders.js';
import { heightAt } from './terrain.js';

/** Where a town contest starts: stand here and press E. */
export interface ContestSpot {
  kind: ContestKind;
  at: THREE.Vector3;
}

/** A place on a wall where a wanted poster can hang (facing `ry`). */
export interface PosterSpot {
  pos: THREE.Vector3;
  ry: number;
}

const FACE_LABEL: Record<ContestKind, string> = {
  daaser: 'DÅSESKYDNING',
  loeb: 'VÆDDELØB',
  plakater: 'EFTERLYST',
};

/**
 * The contest corner by the horseshoe pit: a tin-can stand, the race's hitching
 * rail and a notice board with wanted posters. Placed beside the pit (along the
 * square) and facing the street, which lies behind the pit's throw line.
 */
export function buildContestCorner(
  parent: THREE.Object3D,
  colliders: Colliders,
  pitStart: THREE.Vector3,
  pitDir: THREE.Vector3,
): ContestSpot[] {
  const side = new THREE.Vector3(-pitDir.z, 0, pitDir.x);
  // Props face back towards the street (against the throwing direction).
  const ry = Math.atan2(-pitDir.x, -pitDir.z);
  const spots: ContestSpot[] = [];
  const put = (
    kind: ContestKind,
    obj: THREE.Object3D,
    lateral: number,
    along: number,
    r: number,
  ) => {
    const p = pitStart.clone().addScaledVector(side, lateral).addScaledVector(pitDir, along);
    obj.position.set(p.x, heightAt(p.x, p.z), p.z);
    obj.rotation.y = ry;
    parent.add(markStatic(obj));
    colliders.add(p.x, p.z, r);
    // Stand in front of it, on the street side.
    const at = p.clone().addScaledVector(pitDir, -2.2);
    at.y = heightAt(at.x, at.z);
    spots.push({ kind, at });
  };
  put('daaser', canStand(), -7, 3, 1.6);
  put('plakater', noticeBoard(), 7, 3, 1.3);
  put('loeb', hitchingRail(), 7, 9.5, 1.6);
  return spots;
}

/** Two wanted-poster places on a building's front wall, left and right of the door. */
export function posterSpotsOn(obj: THREE.Object3D, width: number, out: PosterSpot[]) {
  obj.updateMatrixWorld(true);
  for (const x of [-(width / 2 - 0.9), width / 2 - 0.9]) {
    const pos = obj.localToWorld(new THREE.Vector3(x, 1.75, 0.14));
    out.push({ pos, ry: obj.rotation.y });
  }
}

function signBoard(text: string): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-0.9, 0.9])
    g.add(part(new THREE.BoxGeometry(0.12, 2.4, 0.12), '#6b4423', [x, 1.2, 0]));
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.55, 0.08),
    new THREE.MeshToonMaterial({ map: labelTexture(text) }),
  );
  board.position.set(0, 2.15, 0.05);
  g.add(board);
  return g;
}

/** A table with tin cans, a plank fence behind it with more cans on top. */
function canStand(): THREE.Group {
  const g = new THREE.Group();
  g.add(part(new THREE.BoxGeometry(1.8, 0.1, 0.8), '#8a5a2b', [0, 0.9, 1]));
  for (const x of [-0.8, 0.8])
    for (const z of [0.7, 1.3])
      g.add(part(new THREE.BoxGeometry(0.1, 0.9, 0.1), '#6b4423', [x, 0.45, z]));
  // Plank fence three metres back, cans lined up on the top rail.
  for (const x of [-2, 0, 2])
    g.add(part(new THREE.BoxGeometry(0.14, 1.3, 0.14), '#6b4423', [x, 0.65, -2]));
  for (const y of [0.5, 1.15])
    g.add(part(new THREE.BoxGeometry(4.3, 0.18, 0.08), '#8a5a2b', [0, y, -2]));
  for (let i = 0; i < 6; i++) {
    const x = -1.75 + i * 0.7;
    g.add(
      part(new THREE.CylinderGeometry(0.1, 0.1, 0.26, 10), i === 3 ? '#e0b84a' : '#b8bcc2', [
        x,
        1.37,
        -2,
      ]),
    );
  }
  for (const x of [-0.4, 0, 0.4])
    g.add(part(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 8), '#b8bcc2', [x, 1.05, 1.05]));
  outline(g, 0.02);
  const sign = signBoard(FACE_LABEL.daaser);
  // On the pit side of the stand, clear of the houses behind it.
  sign.position.set(2.9, 0, 0.6);
  g.add(sign);
  return g;
}

/** A notice board on two posts, pinned full of wanted posters. */
function noticeBoard(): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-1.1, 1.1])
    g.add(part(new THREE.BoxGeometry(0.14, 2.6, 0.14), '#6b4423', [x, 1.3, 0]));
  g.add(part(new THREE.BoxGeometry(2.4, 1.5, 0.08), '#7a5230', [0, 1.7, 0]));
  g.add(part(new THREE.BoxGeometry(2.7, 0.12, 0.35), '#5e3a1a', [0, 2.55, 0.05]));
  outline(g, 0.02);
  [-0.65, 0, 0.65].forEach((x, i) => {
    const poster = wantedPosterMesh(i);
    poster.position.set(x, 1.7, 0.06);
    poster.rotation.z = (i - 1) * 0.06;
    g.add(poster);
  });
  const sign = labelMesh(FACE_LABEL.plakater, 2.2, 0.45);
  sign.position.set(0, 2.85, 0.05);
  g.add(sign);
  return g;
}

/** A hitching rail with a saddle over it and a flag at the start line. */
function hitchingRail(): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-1.3, 1.3])
    g.add(part(new THREE.BoxGeometry(0.14, 1.1, 0.14), '#6b4423', [x, 0.55, 0]));
  g.add(
    part(
      new THREE.CylinderGeometry(0.06, 0.06, 2.8, 8),
      '#8a5a2b',
      [0, 1.05, 0],
      [0, 0, Math.PI / 2],
    ),
  );
  // A saddle over the rail.
  g.add(part(new THREE.BoxGeometry(0.62, 0.14, 0.55), '#6b3a1a', [0.2, 1.17, 0]));
  g.add(part(new THREE.BoxGeometry(0.7, 0.04, 0.8), '#c8553d', [0.2, 1.1, 0]));
  g.add(part(new THREE.CylinderGeometry(0.04, 0.05, 0.16, 8), '#6b3a1a', [0.2, 1.3, -0.2]));
  // Chequered start flag on a pole.
  g.add(part(new THREE.CylinderGeometry(0.04, 0.05, 2.6, 6), '#3a3330', [1.8, 1.3, 0]));
  outline(g, 0.02);
  const flag = labelMesh('START', 0.9, 0.5, '#f3ecdc', '#1b1b1b');
  flag.position.set(2.27, 2.3, 0);
  g.add(flag);
  const sign = signBoard(FACE_LABEL.loeb);
  sign.position.set(-2.4, 0, 0.3);
  g.add(sign);
  return g;
}

function labelTexture(text: string, bg = '#b07a42', fg = '#2a1a0c'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = fg;
  ctx.font = `${text.length > 10 ? 54 : 70}px Rye, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function labelMesh(text: string, w: number, h: number, bg?: string, fg?: string): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshToonMaterial({ map: labelTexture(text, bg, fg), side: THREE.DoubleSide }),
  );
}

const posterTextures: THREE.CanvasTexture[] = [];

/** "EFTERLYST" poster with one of the four Bøvl brothers (by `variant`). */
export function wantedPosterTexture(variant: number): THREE.CanvasTexture {
  const v = ((variant % 4) + 4) % 4;
  if (posterTextures[v]) return posterTextures[v];
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 340;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#efe0b8';
  ctx.fillRect(0, 0, 256, 340);
  ctx.strokeStyle = '#8a6a3a';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 240, 324);
  ctx.fillStyle = '#2a1a0c';
  ctx.textAlign = 'center';
  ctx.font = '40px Rye, serif';
  ctx.fillText('EFTERLYST', 128, 58);
  // The brother: bigger face and taller hat the bigger he is.
  const s = 0.8 + v * 0.13;
  ctx.fillStyle = '#e8b48a';
  ctx.beginPath();
  ctx.arc(128, 170, 44 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a2320';
  ctx.fillRect(128 - 62 * s, 170 - 44 * s - 6, 124 * s, 12);
  ctx.fillRect(128 - 36 * s, 170 - 44 * s - 6 - 34 * s, 72 * s, 34 * s);
  ctx.beginPath();
  ctx.arc(110, 164, 5, 0, Math.PI * 2);
  ctx.arc(146, 164, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5a3a22';
  ctx.fillRect(100, 190, 56, 10 + v * 2);
  ctx.fillStyle = '#2a1a0c';
  ctx.font = '26px Rye, serif';
  ctx.fillText(['LILLE BØVL', 'BØVL', 'STORE BØVL', 'KÆMPE BØVL'][v]!, 128, 262);
  ctx.font = '30px Rye, serif';
  ctx.fillText('💲 BELØNNING', 128, 306);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  posterTextures[v] = tex;
  return tex;
}

export function wantedPosterMesh(variant: number): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(0.55, 0.73),
    new THREE.MeshToonMaterial({ map: wantedPosterTexture(variant) }),
  );
}
