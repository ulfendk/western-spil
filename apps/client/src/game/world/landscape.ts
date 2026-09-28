import * as THREE from 'three';
import { fbm, mulberry32 } from '../noise.js';
import { faceted, gradientMap, outline, toon } from '../toon.js';

const STRATA = ['#c8553d', '#d9774a', '#b8483a', '#e39a5e', '#c9603f', '#f0c08a'].map(
  (c) => new THREE.Color(c),
);

/** Eroded sandstone shape with horizontal colour strata (vertex colours). */
function strataColumn(
  radius: number,
  height: number,
  seed: number,
  taper: number,
): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(radius * taper, radius, height, 11, 10);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const isCap =
      Math.abs(Math.abs(y) - height / 2) < 1e-3 && Math.hypot(x, z) < radius * taper * 0.99;
    if (!isCap) {
      // Erode the walls with noise so the silhouette isn't a clean cylinder.
      const k = 0.82 + fbm(Math.cos(a) * 2 + seed, y * 0.08 + Math.sin(a) * 2, 3, seed) * 0.35;
      pos.setX(i, x * k);
      pos.setZ(i, z * k);
    }
    const band = Math.floor((y / height + 0.5) * 7 + fbm(a, seed, 1, 2) * 1.2);
    c.copy(STRATA[(band + seed) % STRATA.length]!);
    if (isCap || y > height / 2 - 0.01) c.lerp(new THREE.Color('#e8b070'), 0.5);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return faceted(geo);
}

/** Mesas, buttes and spires on the horizon, Monument Valley style. */
export function buildMesas(): THREE.Group {
  const group = new THREE.Group();
  const rand = mulberry32(99);
  const mat = toon('#ffffff', { vertexColors: true });
  for (let i = 0; i < 30; i++) {
    const angle = rand() * Math.PI * 2;
    // Keep the west (−z) open for the mountains and the sun.
    if (Math.sin(angle) < -0.75) continue;
    const dist = 300 + rand() * 260;
    const kind = rand();
    const g = new THREE.Group();
    if (kind < 0.55) {
      // Wide flat-topped mesa with a talus skirt.
      const w = 30 + rand() * 50;
      const h = 30 + rand() * 45;
      const body = new THREE.Mesh(strataColumn(w, h, i, 0.85), mat);
      body.position.y = h / 2;
      body.scale.z = 0.5 + rand() * 0.5;
      const skirt = new THREE.Mesh(strataColumn(w * 1.25, h * 0.25, i + 3, 0.8), mat);
      skirt.position.y = h * 0.12;
      skirt.scale.z = body.scale.z;
      g.add(body, skirt);
    } else if (kind < 0.85) {
      // Butte: taller than wide.
      const w = 10 + rand() * 14;
      const h = 45 + rand() * 50;
      const body = new THREE.Mesh(strataColumn(w, h, i, 0.9), mat);
      body.position.y = h / 2;
      const skirt = new THREE.Mesh(strataColumn(w * 1.8, h * 0.22, i + 5, 0.6), mat);
      skirt.position.y = h * 0.11;
      g.add(body, skirt);
    } else {
      // Thin spires in a cluster.
      for (let s = 0; s < 3; s++) {
        const w = 3 + rand() * 4;
        const h = 30 + rand() * 40;
        const spire = new THREE.Mesh(strataColumn(w, h, i + s, 0.55), mat);
        spire.position.set((rand() - 0.5) * 25, h / 2, (rand() - 0.5) * 25);
        g.add(spire);
      }
    }
    g.position.set(Math.cos(angle) * dist, -3, Math.sin(angle) * dist);
    g.rotation.y = rand() * Math.PI;
    group.add(outline(g, 0.35));
  }
  return group;
}

/** Snow-capped mountains far to the west: the end of the journey. */
export function buildMountains(): THREE.Group {
  const group = new THREE.Group();
  const rand = mulberry32(5);
  const base = new THREE.Color('#7d86b8');
  const rock = new THREE.Color('#9aa0c8');
  const snow = new THREE.Color('#f7f5ff');
  // Not fogged: the hazy blue is baked into the colours so they stay visible at 1 km.
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap, fog: false });
  for (let i = 0; i < 16; i++) {
    const h = 120 + rand() * 170;
    const r = h * (0.9 + rand() * 0.5);
    const geo = new THREE.ConeGeometry(r, h, 9, 6);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let j = 0; j < pos.count; j++) {
      const y = pos.getY(j);
      const t = y / h + 0.5;
      if (t < 0.99) {
        const k = 0.85 + rand() * 0.3;
        pos.setX(j, pos.getX(j) * k);
        pos.setZ(j, pos.getZ(j) * k);
        pos.setY(j, y + (rand() - 0.5) * h * 0.06);
      }
      c.copy(base).lerp(rock, t);
      if (t > 0.62 + rand() * 0.1) c.copy(snow);
      colors.set([c.r, c.g, c.b], j * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const m = new THREE.Mesh(faceted(geo), mat);
    const x = (i / 15 - 0.5) * 1500 + (rand() - 0.5) * 80;
    m.position.set(x, h / 2 - 20, -780 - rand() * 180);
    m.rotation.y = rand() * Math.PI;
    group.add(m);
  }
  return group;
}
