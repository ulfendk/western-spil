import * as THREE from 'three';
import { fbm, mulberry32 } from '../noise.js';
import { faceted, gradientMap, mesh, outline, part } from '../toon.js';
import type { Colliders } from './colliders.js';
import { heightAt, RAIL_X, trailX, WORLD_SIZE } from './terrain.js';

/** Shared wind clock for all swaying vegetation. */
export const wind = { value: 0 };

/** Adds a gentle wind sway (stronger at the top of each blade) to a toon material. */
function swaying(mat: THREE.MeshToonMaterial, strength: number): THREE.MeshToonMaterial {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = wind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        vec3 transformed = vec3(position);
        #ifdef USE_INSTANCING
          vec3 root = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #else
          vec3 root = vec3(0.0);
        #endif
        float bend = max(position.y, 0.0);
        float gust = sin(uTime * 1.7 + root.x * 0.21 + root.z * 0.13) * 0.6 + sin(uTime * 3.1 + root.z * 0.5) * 0.25;
        transformed.x += gust * bend * ${strength.toFixed(3)};
        transformed.z += gust * bend * ${(strength * 0.4).toFixed(3)};
        `,
      );
  };
  return mat;
}

/** Keep vegetation off the trail, the railway and the camp. */
function isClear(x: number, z: number, keepOut: { x: number; z: number; r: number }[]): boolean {
  if (Math.abs(x - trailX(z)) < 4.5) return false;
  if (Math.abs(x - RAIL_X) < 5) return false;
  return keepOut.every((k) => (x - k.x) ** 2 + (z - k.z) ** 2 > k.r * k.r);
}

function grassClumpGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const base = new THREE.Color('#6d8a34');
  const tip = new THREE.Color('#f2dd8c');
  const blades = 7;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + i * 0.7;
    const r = 0.12 + (i % 3) * 0.06;
    const h = 0.55 + ((i * 37) % 5) * 0.09;
    const lean = 0.18;
    const bx = Math.cos(a) * r;
    const bz = Math.sin(a) * r;
    const w = 0.075;
    const px = -Math.sin(a) * w;
    const pz = Math.cos(a) * w;
    // One tapered triangle per blade, leaning outwards.
    positions.push(
      bx - px,
      0,
      bz - pz,
      bx + px,
      0,
      bz + pz,
      bx * (1 + lean * 4),
      h,
      bz * (1 + lean * 4),
    );
    colors.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

export interface VegetationOptions {
  density: number;
  /** Desert props (saguaros, prickly pears). Off on the Nebraska prairie. */
  cacti?: boolean;
  /** Extra grass for lush prairie regions. */
  grassBoost?: number;
  keepOut: { x: number; z: number; r: number }[];
  colliders: Colliders;
}

export function buildVegetation(opts: VegetationOptions): THREE.Group {
  const group = new THREE.Group();
  const rand = mulberry32(1234);
  const half = WORLD_SIZE * 0.55;
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const randomClear = () => {
    for (;;) {
      const x = (rand() - 0.5) * 2 * half;
      const z = (rand() - 0.5) * 2 * half;
      if (isClear(x, z, opts.keepOut)) return { x, z };
    }
  };

  // Prairie grass: thousands of instanced clumps, denser in noisy patches.
  const grassMat = swaying(
    new THREE.MeshToonMaterial({ vertexColors: true, gradientMap, side: THREE.DoubleSide }),
    0.28,
  );
  const grassCount = Math.floor(70000 * opts.density * (opts.grassBoost ?? 1));
  const grass = new THREE.InstancedMesh(grassClumpGeometry(), grassMat, grassCount);
  grass.receiveShadow = true;
  // Grass stays out of the depth buffer so the ink-line pass doesn't outline every blade.
  // Drawn after the other opaque objects so it's still hidden behind them.
  grassMat.depthWrite = false;
  grass.renderOrder = 5;
  let placed = 0;
  for (let tries = 0; placed < grassCount && tries < grassCount * 4; tries++) {
    const x = (rand() - 0.5) * 2 * half;
    const z = (rand() - 0.5) * 2 * half;
    if (fbm(x * 0.04, z * 0.04, 2, 21) < 0.36 - rand() * 0.12) continue;
    if (!isClear(x, z, opts.keepOut)) continue;
    const s = 0.7 + rand() * 0.9;
    dummy.position.set(x, heightAt(x, z) - 0.05, z);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.scale.set(s, s * (0.8 + rand() * 0.6), s);
    dummy.updateMatrix();
    grass.setMatrixAt(placed, dummy.matrix);
    grass.setColorAt(placed, tint.setHSL(0.12 + rand() * 0.08, 0.5, 0.7 + rand() * 0.25));
    placed++;
  }
  grass.count = placed;
  group.add(grass);

  // Wildflowers: tiny coloured dots scattered in the grass.
  const flowerGeo = new THREE.IcosahedronGeometry(0.07, 0);
  flowerGeo.translate(0, 0.45, 0);
  const flowerCount = Math.floor(4000 * opts.density);
  const flowers = new THREE.InstancedMesh(
    flowerGeo,
    swaying(new THREE.MeshToonMaterial({ gradientMap, depthWrite: false }), 0.25),
    flowerCount,
  );
  flowers.renderOrder = 6;
  const flowerColors = ['#f2e35a', '#e8f0ff', '#c45bd1', '#f08a3c', '#e2463a'];
  for (let i = 0; i < flowerCount; i++) {
    const { x, z } = randomClear();
    dummy.position.set(x, heightAt(x, z), z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(0.8 + rand() * 0.8);
    dummy.updateMatrix();
    flowers.setMatrixAt(i, dummy.matrix);
    flowers.setColorAt(i, tint.set(flowerColors[Math.floor(rand() * flowerColors.length)]!));
  }
  group.add(flowers);

  // Sagebrush: puffy grey-green bushes.
  const bushGeo = faceted(
    new THREE.IcosahedronGeometry(0.6, 1).scale(1, 0.7, 1).translate(0, 0.35, 0),
  );
  const bushCount = Math.floor(900 * opts.density);
  const bushes = new THREE.InstancedMesh(
    bushGeo,
    new THREE.MeshToonMaterial({ gradientMap }),
    bushCount,
  );
  bushes.castShadow = true;
  bushes.receiveShadow = true;
  for (let i = 0; i < bushCount; i++) {
    const { x, z } = randomClear();
    const s = 0.6 + rand() * 1.1;
    dummy.position.set(x, heightAt(x, z) - 0.1, z);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.scale.set(s * (1 + rand() * 0.4), s, s);
    dummy.updateMatrix();
    bushes.setMatrixAt(i, dummy.matrix);
    opts.colliders.add(x, z, 0.45 * s);
    bushes.setColorAt(i, tint.setHSL(0.2 + rand() * 0.08, 0.22, 0.45 + rand() * 0.12));
  }
  group.add(bushes);

  // Saguaros, prickly pears and rock clusters: individual meshes with outlines.
  for (let i = 0; i < 90; i++) {
    const x = (rand() - 0.5) * 2 * half;
    const z = (rand() - 0.5) * 2 * half;
    if (!isClear(x, z, opts.keepOut)) continue;
    const kind = opts.cacti === false ? 0.7 + rand() * 0.3 : rand();
    let prop: THREE.Object3D;
    let radius: number;
    if (kind < 0.4) {
      prop = saguaro(rand);
      radius = 0.6;
    } else if (kind < 0.65) {
      prop = pricklyPear(rand);
      radius = 0.8;
    } else {
      prop = rockCluster(rand);
      radius = 1.6;
    }
    prop.position.set(x, heightAt(x, z) - 0.15, z);
    prop.rotation.y = rand() * Math.PI * 2;
    group.add(prop);
    opts.colliders.add(x, z, radius * prop.scale.x);
  }
  return group;
}

/** Ribbed saguaro cactus with arms. */
export function saguaro(rand: () => number): THREE.Group {
  const green = '#4d8a3b';
  const cactus = new THREE.Group();
  const h = 3 + rand() * 3.5;
  cactus.add(part(ribbed(0.38, h), green, [0, h / 2, 0]));
  cactus.add(
    part(new THREE.SphereGeometry(0.38, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), green, [0, h, 0]),
  );
  for (const side of [-1, 1]) {
    if (rand() < 0.3) continue;
    const armH = 1 + rand() * 1.5;
    const y = h * (0.35 + rand() * 0.3);
    const arm = new THREE.Group();
    arm.add(
      part(
        new THREE.CapsuleGeometry(0.24, 0.55, 4, 10),
        green,
        [side * 0.55, 0, 0],
        [0, 0, Math.PI / 2],
      ),
    );
    arm.add(part(ribbed(0.25, armH), green, [side * 0.9, armH / 2, 0]));
    arm.add(
      part(new THREE.SphereGeometry(0.25, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), green, [
        side * 0.9,
        armH,
        0,
      ]),
    );
    arm.position.y = y;
    arm.rotation.y = rand() * 0.6;
    cactus.add(arm);
  }
  // A pink flower on top, sometimes.
  if (rand() < 0.4)
    cactus.add(part(new THREE.IcosahedronGeometry(0.16, 0), '#f07aa6', [0, h + 0.36, 0]));
  return outline(cactus, 0.03);
}

/** Cylinder with vertical ribs, like a saguaro. */
function ribbed(radius: number, height: number): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(radius, radius * 1.05, height, 20, 4);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + Math.cos(a * 10) * 0.07;
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

function pricklyPear(rand: () => number): THREE.Group {
  const g = new THREE.Group();
  const padGeo = new THREE.SphereGeometry(0.4, 12, 8);
  padGeo.scale(1, 1.25, 0.28);
  const add = (x: number, y: number, rz: number, ry: number, depth: number) => {
    g.add(part(padGeo, '#6f9a45', [x, y, 0], [0, ry, rz]));
    if (depth > 0) {
      add(x - 0.35, y + 0.6, rz + 0.5, ry + 0.8, depth - 1);
      if (rand() < 0.7) add(x + 0.35, y + 0.6, rz - 0.5, ry - 0.6, depth - 1);
    } else if (rand() < 0.5) {
      g.add(part(new THREE.SphereGeometry(0.08, 8, 6), '#d33c5c', [x, y + 0.5, 0]));
    }
  };
  add(0, 0.45, 0, 0, 2);
  return outline(g, 0.025);
}

function rockCluster(rand: () => number): THREE.Group {
  const g = new THREE.Group();
  const colors = ['#b5714c', '#c98a5a', '#a0624a', '#d4a574'];
  const n = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let j = 0; j < pos.count; j++) {
      const k = 0.8 + fbm(pos.getX(j) * 2 + i * 9, pos.getZ(j) * 2 + pos.getY(j), 2, 4) * 0.5;
      pos.setXYZ(j, pos.getX(j) * k, pos.getY(j) * k * 0.75, pos.getZ(j) * k);
    }
    geo.computeVertexNormals();
    const s = i === 0 ? 1 + rand() * 1.2 : 0.4 + rand() * 0.6;
    const rock = mesh(geo, colors[Math.floor(rand() * colors.length)]!, { flatShading: true });
    rock.scale.setScalar(s);
    rock.position.set(i === 0 ? 0 : (rand() - 0.5) * 3, s * 0.35, i === 0 ? 0 : (rand() - 0.5) * 3);
    rock.rotation.set(rand(), rand() * 6, rand());
    g.add(rock);
  }
  return outline(g, 0.03);
}
