import * as THREE from 'three';
import { mulberry32 } from '../noise.js';
import { outline, part } from '../toon.js';
import type { Animated } from './animals.js';

/** Campfire with stone ring, crossed logs, flickering flames, light and smoke. */
export function buildCampfire(): THREE.Group & Animated {
  const fire = new THREE.Group() as THREE.Group & Animated;
  const rand = mulberry32(3);
  const stones = new THREE.Group();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const s = part(
      new THREE.DodecahedronGeometry(0.2 + rand() * 0.08, 0),
      i % 2 ? '#8d8a86' : '#a29c94',
      [Math.cos(a) * 0.75, 0.1, Math.sin(a) * 0.75],
      [rand(), rand(), rand()],
      { flatShading: true },
    );
    stones.add(s);
  }
  fire.add(outline(stones, 0.02));
  const logs = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    logs.add(
      part(
        new THREE.CylinderGeometry(0.08, 0.09, 1.1, 8),
        '#5b3a1d',
        [0, 0.18, 0],
        [Math.PI / 2 - 0.35, (i / 4) * Math.PI, 0],
      ),
    );
  }
  fire.add(outline(logs, 0.02));
  const ember = part(
    new THREE.CircleGeometry(0.5, 16),
    '#e0542a',
    [0, 0.03, 0],
    [-Math.PI / 2, 0, 0],
  );
  ember.userData.noOutline = true;
  fire.add(ember);

  const flameMats = ['#ffd24a', '#ff9a2e', '#f2542d'].map(
    (c) => new THREE.MeshBasicMaterial({ color: c }),
  );
  const flames = [0, 1, 2, 3, 4].map((i) => {
    const f = new THREE.Mesh(
      new THREE.ConeGeometry(0.22 - (i % 3) * 0.04, 0.9 - (i % 3) * 0.2, 7),
      flameMats[i % 3],
    );
    f.position.set(Math.cos(i * 1.3) * 0.12, 0.45, Math.sin(i * 1.3) * 0.12);
    fire.add(f);
    return f;
  });
  const light = new THREE.PointLight('#ff9a3c', 6, 9, 1.6);
  light.position.y = 1;
  fire.add(light);

  const smokeMat = new THREE.MeshToonMaterial({
    color: '#d8d2c8',
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const puffs = Array.from({ length: 6 }, (_, i) => {
    const p = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 1), smokeMat.clone());
    fire.add(p);
    return { p, t: i / 6 };
  });

  fire.update = (dt, time) => {
    flames.forEach((f, i) => {
      const k = 1 + Math.sin(time * (9 + i) + i) * 0.15 + Math.sin(time * 23 + i * 3) * 0.08;
      f.scale.set(1, k, 1);
      f.rotation.y = time * (1 + i * 0.3);
    });
    light.intensity = 5 + Math.sin(time * 13) * 0.8 + Math.sin(time * 29) * 0.5;
    for (const s of puffs) {
      s.t = (s.t + dt * 0.18) % 1;
      s.p.position.set(Math.sin(s.t * 5 + time * 0.3) * 0.3 + s.t * 1.2, 1 + s.t * 5, s.t * 0.4);
      s.p.scale.setScalar(0.6 + s.t * 2.2);
      (s.p.material as THREE.MeshToonMaterial).opacity = 0.5 * (1 - s.t);
    }
  };
  return fire;
}

/** A couple of split logs to sit on, a coffee pot and a bedroll. */
export function buildCampProps(): THREE.Group {
  const g = new THREE.Group();
  g.add(
    part(
      new THREE.CylinderGeometry(0.22, 0.22, 1.6, 10),
      '#7a5230',
      [0, 0.22, 1.9],
      [0, 0, Math.PI / 2],
    ),
  );
  g.add(
    part(
      new THREE.CylinderGeometry(0.2, 0.2, 1.4, 10),
      '#6d4a2a',
      [-1.8, 0.2, 0.2],
      [Math.PI / 2, 0, 0.3],
    ),
  );
  const pot = new THREE.Group();
  pot.add(part(new THREE.CylinderGeometry(0.1, 0.14, 0.3, 10), '#4f6b78', [0, 0.15, 0]));
  pot.add(part(new THREE.ConeGeometry(0.1, 0.1, 10), '#4f6b78', [0, 0.35, 0]));
  pot.add(part(new THREE.BoxGeometry(0.03, 0.03, 0.18), '#4f6b78', [0, 0.25, -0.15], [0.7, 0, 0]));
  pot.position.set(0.95, 0, 0.3);
  g.add(pot);
  const roll = part(
    new THREE.CylinderGeometry(0.22, 0.22, 1.1, 12),
    '#3d6b8a',
    [1.9, 0.22, -0.9],
    [0, 0.4, Math.PI / 2],
  );
  g.add(roll);
  g.add(
    part(
      new THREE.TorusGeometry(0.225, 0.02, 4, 12),
      '#6b3a1a',
      [1.9, 0.22, -0.9],
      [0, 0.4 + Math.PI / 2, 0],
    ),
  );
  return outline(g, 0.02);
}

/** Split-rail zig-zag fence. */
export function buildFence(length: number): THREE.Group {
  const g = new THREE.Group();
  const seg = 2.4;
  const n = Math.floor(length / seg);
  for (let i = 0; i <= n; i++) {
    const zig = i % 2 ? 0.35 : -0.35;
    g.add(
      part(
        new THREE.CylinderGeometry(0.07, 0.08, 1.4, 6),
        '#7d5a36',
        [zig, 0.7, i * seg],
        [0, 0, (i % 3) * 0.03],
      ),
    );
    if (i < n) {
      for (const y of [0.45, 0.85, 1.2]) {
        const rail = part(
          new THREE.BoxGeometry(0.1, 0.1, seg + 0.3),
          i % 2 ? '#8f6a40' : '#86623a',
          [0, y, i * seg + seg / 2],
          [0, zig > 0 ? 0.28 : -0.28, 0],
        );
        g.add(rail);
      }
    }
  }
  return outline(g, 0.02);
}

/** Signpost pointing west, with painted letters. */
export function buildSign(text: string): THREE.Group {
  const sign = new THREE.Group();
  sign.add(part(new THREE.CylinderGeometry(0.09, 0.11, 2.8, 6), '#6b4423', [0, 1.4, 0]));
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#b07a42';
  ctx.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 12; i++) {
    ctx.strokeStyle = 'rgba(90,55,20,0.35)';
    ctx.beginPath();
    const y = 10 + i * 10;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(170, y + 4, 340, y - 4, 512, y + 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#2a1a0c';
  ctx.font = '62px Rye, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  // Arrow-shaped board.
  const shape = new THREE.Shape();
  shape.moveTo(-1.2, -0.32);
  shape.lineTo(1.0, -0.32);
  shape.lineTo(1.35, 0);
  shape.lineTo(1.0, 0.32);
  shape.lineTo(-1.2, 0.32);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
  geo.translate(0, 0, -0.04);
  // Map the text texture onto the arrow's faces.
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, (pos.getX(i) + 1.2) / 2.55, (pos.getY(i) + 0.32) / 0.64);
  const board = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ map: tex }));
  board.castShadow = true;
  board.position.y = 2.3;
  sign.add(board);
  return outline(sign, 0.025);
}

/** Draws the Bøvl brothers' wanted poster (used on the signpost and as a close-up). */
export function drawWantedPoster(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  // Aged paper with a darker edge.
  const g = ctx.createRadialGradient(192, 256, 80, 192, 256, 330);
  g.addColorStop(0, '#f4e3b5');
  g.addColorStop(1, '#c9a86a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 384, 512);
  ctx.fillStyle = '#2a1a0c';
  ctx.textAlign = 'center';
  ctx.font = '64px Rye, serif';
  ctx.fillText('EFTERLYST', 192, 78);
  // Four brothers, shortest to tallest, in a row.
  const heights = [120, 160, 200, 240];
  heights.forEach((hgt, i) => {
    const x = 60 + i * 88;
    const base = 380;
    ctx.fillStyle = '#2a1a0c';
    ctx.fillRect(x - 16, base - hgt + 44, 32, hgt - 70); // body
    ctx.fillRect(x - 16, base - 26, 12, 26); // legs
    ctx.fillRect(x + 4, base - 26, 12, 26);
    ctx.beginPath();
    ctx.arc(x, base - hgt + 30, 18, 0, Math.PI * 2); // head
    ctx.fill();
    ctx.fillRect(x - 28, base - hgt + 10, 56, 6); // hat brim
    ctx.fillRect(x - 14, base - hgt - 10, 28, 22); // hat crown
    ctx.fillStyle = '#f4e3b5';
    ctx.fillRect(x - 12, base - hgt + 26, 24, 6); // bandit mask eyes
    ctx.fillStyle = '#2a1a0c';
    ctx.fillRect(x - 6, base - hgt + 27, 4, 4);
    ctx.fillRect(x + 3, base - hgt + 27, 4, 4);
  });
  ctx.font = '40px Rye, serif';
  ctx.fillText('BØVL-BRØDRENE', 192, 432);
  ctx.font = '34px Rye, serif';
  ctx.fillText('500 $ DUSØR', 192, 482);
  return c;
}

/** Wanted poster of the Bøvl brothers, meant to be pinned to the signpost. */
export function buildWantedPoster(): THREE.Mesh {
  const tex = new THREE.CanvasTexture(drawWantedPoster());
  tex.colorSpace = THREE.SRGBColorSpace;
  const poster = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.8),
    new THREE.MeshToonMaterial({ map: tex, side: THREE.DoubleSide }),
  );
  poster.castShadow = true;
  return poster;
}
