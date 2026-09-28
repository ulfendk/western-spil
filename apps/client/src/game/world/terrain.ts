import * as THREE from 'three';
import { fbm, mulberry32, valueNoise } from '../noise.js';
import { gradientMap } from '../toon.js';

export const WORLD_SIZE = 400;
export const WORLD_HALF = WORLD_SIZE / 2 - 10;
/** The railway runs north–south (along z), parallel to the trail. */
export const RAIL_X = 64;

/** A levelled stretch along the trail (a town), blended smoothly into the land around it. */
export interface FlatZone {
  z0: number;
  z1: number;
}

/** A shallow river crossing the land roughly east–west. */
export interface RiverProfile {
  /** Centre line of the river: z for a given x. */
  z(x: number): number;
  halfWidth: number;
}

/** Shape of one region's land. Only one region is active at a time. */
export interface TerrainProfile {
  /** Height of the big rolling hills in metres. */
  hills: number;
  /** Noise seed, so every region looks different. */
  seed: number;
  /** The wagon trail winds westward (−z): its x for a given z. */
  trail(z: number): number;
  flatZones: FlatZone[];
  river?: RiverProfile;
}

let active: TerrainProfile = {
  hills: 26,
  seed: 7,
  trail: (z) => Math.sin(z * 0.012) * 30 + Math.sin(z * 0.031) * 8,
  flatZones: [{ z0: 100, z1: 178 }],
};

/** Switches the land to another region's shape (call before building that region). */
export function setTerrain(profile: TerrainProfile) {
  active = profile;
}

export function terrainProfile(): TerrainProfile {
  return active;
}

export function trailX(z: number): number {
  return active.trail(z);
}

function rawHeight(x: number, z: number): number {
  const hills = (fbm(x * 0.008, z * 0.008, 4, active.seed) - 0.5) * active.hills;
  const bumps = (fbm(x * 0.05, z * 0.05, 2, 3) - 0.5) * 1.6;
  return hills + bumps;
}

/** Smoothly graded railway bed so the rails never jump. */
export function railHeight(z: number): number {
  return (fbm(RAIL_X * 0.008, z * 0.006, 2, 7) - 0.5) * 8 + 0.5;
}

/** Gentle ground level along a flat zone's main street. */
function zoneHeight(zone: FlatZone, z: number): number {
  const zc = THREE.MathUtils.clamp(z, zone.z0, zone.z1);
  return rawHeight(trailX(zc), zc) * 0.2;
}

/** River bed level at a point along the river (the water sits a little above it). */
export function riverBed(x: number): number {
  const r = active.river;
  if (!r) return 0;
  return rawHeight(x, r.z(x)) * 0.25 - 0.8;
}

/** Water surface height of the river at x. */
export function riverWater(x: number): number {
  return riverBed(x) + 0.55;
}

export function heightAt(x: number, z: number): number {
  let h = rawHeight(x, z);
  // Flatten the trail so wagons (and kids) can follow it.
  h *= 0.25 + 0.75 * THREE.MathUtils.smoothstep(Math.abs(x - trailX(z)), 4, 18);
  // Level towns and blend them smoothly into the land around them.
  for (const zone of active.flatZones) {
    const inZ =
      THREE.MathUtils.smoothstep(z, zone.z0 - 18, zone.z0 - 4) *
      (1 - THREE.MathUtils.smoothstep(z, zone.z1 + 4, zone.z1 + 18));
    if (inZ <= 0) continue;
    const inX = 1 - THREE.MathUtils.smoothstep(Math.abs(x - trailX(z)), 26, 42);
    h = THREE.MathUtils.lerp(h, zoneHeight(zone, z), inZ * inX);
  }
  // Carve a shallow river with gently sloping banks.
  const r = active.river;
  if (r) {
    const d = Math.abs(z - r.z(x));
    const inRiver = 1 - THREE.MathUtils.smoothstep(d, r.halfWidth - 2, r.halfWidth + 7);
    if (inRiver > 0) h = THREE.MathUtils.lerp(h, riverBed(x), inRiver);
  }
  // Blend into the railway embankment.
  const rail = 1 - THREE.MathUtils.smoothstep(Math.abs(x - RAIL_X), 3.5, 16);
  return THREE.MathUtils.lerp(h, railHeight(z), rail);
}

const PAL = {
  grassDark: new THREE.Color('#6f8a3a'),
  grassMid: new THREE.Color('#a9a647'),
  grassLight: new THREE.Color('#d2b55a'),
  gold: new THREE.Color('#d9a64e'),
  rock: new THREE.Color('#b0684a'),
  gravel: new THREE.Color('#948673'),
};

/** Tiling hand-painted grass texture that gives the ground detail up close. */
function groundDetailTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(0, 0, size, size);
  const rand = mulberry32(8);
  // Short brush strokes in lighter and darker greys (multiplied with the vertex colours).
  for (let i = 0; i < 1400; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 3 + rand() * 7;
    const shade = 150 + Math.floor(rand() * 105);
    ctx.strokeStyle = `rgb(${shade},${shade},${shade})`;
    ctx.lineWidth = 1 + rand() * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 3, y - len);
    // Draw wrapped copies so the texture tiles seamlessly.
    ctx.moveTo(x - size, y);
    ctx.lineTo(x - size + (rand() - 0.5) * 3, y - len);
    ctx.moveTo(x, y + size);
    ctx.lineTo(x, y + size - len);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

export function buildTerrain(): THREE.Mesh {
  const size = WORLD_SIZE * 1.8;
  const geo = new THREE.PlaneGeometry(size, size, 360, 360);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();

  const normals = geo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = pos.getY(i);
    // Large patches of green, olive and gold prairie.
    const patch = fbm(x * 0.018, z * 0.018, 3, 11);
    if (patch < 0.5)
      c.copy(PAL.grassDark).lerp(PAL.grassMid, THREE.MathUtils.smoothstep(patch, 0.3, 0.5));
    else c.copy(PAL.grassMid).lerp(PAL.grassLight, THREE.MathUtils.smoothstep(patch, 0.5, 0.68));
    c.lerp(PAL.gold, THREE.MathUtils.smoothstep(y, 2, 10) * 0.6);
    const slope = 1 - normals.getY(i);
    c.lerp(PAL.rock, THREE.MathUtils.smoothstep(slope, 0.08, 0.2));
    c.lerp(PAL.gravel, 1 - THREE.MathUtils.smoothstep(Math.abs(x - RAIL_X), 2.5, 4.5));
    // Painterly per-vertex variation.
    c.offsetHSL(0, 0, (valueNoise(x * 0.7, z * 0.7, 5) - 0.5) * 0.05);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const detail = groundDetailTexture();
  detail.repeat.set(size / 4, size / 4);
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, map: detail, gradientMap });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/** A dirt ribbon with wheel ruts laid over the terrain along the trail. */
export function buildTrail(): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(201,146,90,0)');
  grad.addColorStop(0.18, 'rgba(201,146,90,1)');
  grad.addColorStop(0.82, 'rgba(201,146,90,1)');
  grad.addColorStop(1, 'rgba(201,146,90,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 512);
  // Wheel ruts, slightly wobbly.
  for (const x of [40, 88]) {
    ctx.strokeStyle = 'rgba(135, 88, 50, 0.8)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (let y = 0; y <= 512; y += 32) ctx.lineTo(x + Math.sin((y / 512) * Math.PI * 4) * 1.5, y);
    ctx.stroke();
  }
  // Fine pebbles and dust specks.
  for (let i = 0; i < 700; i++) {
    const x = 18 + Math.random() * 92;
    const y = Math.random() * 512;
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(120,80,45,0.55)' : 'rgba(235,200,145,0.7)';
    ctx.beginPath();
    ctx.arc(x, y, 0.6 + Math.random() * 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  // Thin grass strokes along the middle ridge.
  ctx.strokeStyle = 'rgba(130,140,60,0.7)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 90; i++) {
    const x = 58 + Math.random() * 12;
    const y = Math.random() * 512;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 3, y - 5);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;

  const width = 7;
  const across = 8;
  const zs: number[] = [];
  for (let z = WORLD_SIZE * 0.9; z >= -WORLD_SIZE * 0.9; z -= 1.5) zs.push(z);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  zs.forEach((z, row) => {
    const cx = trailX(z);
    for (let j = 0; j <= across; j++) {
      const u = j / across;
      const x = cx + (u - 0.5) * width;
      positions.push(x, heightAt(x, z) + 0.05, z);
      uvs.push(u, (row * 1.5) / 28);
      if (row > 0 && j < across) {
        const a = (row - 1) * (across + 1) + j;
        const b = a + across + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = new THREE.MeshToonMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  return mesh;
}
