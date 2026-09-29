import * as THREE from 'three';
import { markStatic, mergeLocal } from '../batch.js';
import { buildBisonHerd, buildCattle, buildHorse } from '../animals.js';
import { buildCampfire } from '../camp.js';
import { addVegetation, buildCommon, place, streetKeepOut } from '../common.js';
import type { World, WorldOptions } from '../index.js';
import { buildPerson } from '../npc.js';
import { fbm, mulberry32 } from '../../noise.js';
import { faceted, gradientMap, outline, part, toon } from '../../toon.js';
import { heightAt, riverWater, trailX, type TerrainProfile } from '../terrain.js';
import { buildTown, type TownConfig } from '../town.js';
import { wheel, buildWagon } from '../wagon.js';

export const STOEVBY_TOWN: TownConfig = {
  name: 'STØVBY',
  zStart: -178,
  zEnd: -100,
  arch: 'end',
  west: [
    ['SALOON', -112, 2],
    ['BUTIK', -125, 1],
    ['SHERIFF', -160, 1],
    ['FRISØR', -172, 1],
  ],
  east: [
    ['HOTEL', -110, 2],
    ['KVÆGHANDEL', -123, 1],
    ['SMED', -136, 1],
    ['STALD', -149, 1],
    ['POSTHUS', -162, 1],
  ],
  squareZ: -142,
  waterTowerZ: -168,
  seed: 1869,
};

const RIVER_HALF_WIDTH = 13;
const riverZ = (x: number) => -35 + Math.sin(x * 0.013) * 10 + Math.sin(x * 0.041) * 3;

/** Chapter 2: flat Nebraska grassland with the shallow Platte river. */
export const PRAERIEN_TERRAIN: TerrainProfile = {
  hills: 9,
  seed: 13,
  trail: (z) => Math.sin(z * 0.01) * 22 + Math.sin(z * 0.027 + 1) * 6,
  flatZones: [{ z0: STOEVBY_TOWN.zStart, z1: STOEVBY_TOWN.zEnd }],
  river: { z: riverZ, halfWidth: RIVER_HALF_WIDTH },
};

/** Where the trail meets the river (the ford). */
function fordZ(): number {
  let z = -35;
  for (let i = 0; i < 6; i++) z = riverZ(PRAERIEN_TERRAIN.trail(z));
  return z;
}

export function buildPraerien(scene: THREE.Scene, opts: WorldOptions): World {
  // A coyote pack roams west of the trail.
  const common = buildCommon(scene, { coyotes: new THREE.Vector2(trailX(60) - 110, 60) });
  const { colliders, animated } = common;
  scene.add(markStatic(buildLandmarks()));
  const water = buildRiverWater();
  scene.add(water.mesh);
  animated.push(water);

  // The wagon train in a circle beside the trail.
  const circleZ = 95;
  const C = new THREE.Vector2(trailX(circleZ) + 17, circleZ);
  const rand = mulberry32(95);
  let broken: THREE.Group | null = null;
  let brokenWheel: THREE.Object3D | null = null;
  let looseWheel: THREE.Object3D | null = null;
  const wagons = 6;
  for (let i = 0; i < wagons; i++) {
    const a = (i / wagons) * Math.PI * 2 + 0.3;
    // Leave a gap facing the trail so you can walk in.
    if (i === 3) continue;
    const x = C.x + Math.cos(a) * 11;
    const z = C.y + Math.sin(a) * 11;
    const w = place(buildWagon(), x, z, -a);
    // The broken wagon tilts when repaired, so it only merges its own parts.
    scene.add(i === 1 ? w : markStatic(w));
    for (const d of [-1.6, 0, 1.6]) colliders.add(x - Math.sin(-a) * d, z - Math.cos(-a) * d, 1.3);
    if (i === 1) {
      // The Jensens' wagon: a rear wheel has come off and lies in the grass.
      broken = w;
      w.traverse((o) => {
        if (o.userData.wheel === 'rear-right') brokenWheel = o;
      });
      brokenWheel!.visible = false;
      w.rotation.z = 0.12;
      brokenWheel!.userData.moving = true;
      mergeLocal(w);
      looseWheel = wheel(0.85);
      looseWheel.rotation.set(0, 0, Math.PI / 2);
      const wp = new THREE.Vector3(1.6, 0, 3.2)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), -a)
        .add(w.position);
      looseWheel.position.set(wp.x, heightAt(wp.x, wp.z) + 0.1, wp.z);
      scene.add(outline(looseWheel, 0.02));
    }
    void rand;
  }
  const fire = place(buildCampfire(), C.x, C.y);
  scene.add(fire);
  animated.push(fire);
  colliders.add(C.x, C.y, 1);

  const jensen = place(
    buildPerson({
      scale: 1,
      dress: '#3d6b8a',
      apron: '#f3ecdc',
      hair: '#c9a26a',
      bonnet: '#e8d6b0',
      model: 'jensen',
    }),
    C.x - 3,
    C.y + 3.5,
    0,
  );
  const sofie = place(
    buildPerson({
      scale: 0.72,
      dress: '#c8553d',
      apron: '#f7f3ea',
      hair: '#f0d27a',
      braids: true,
      model: 'sofie',
    }),
    C.x - 4.5,
    C.y + 1.5,
    0,
  );
  scene.add(jensen, sofie);
  animated.push(jensen, sofie);
  colliders.add(jensen.position.x, jensen.position.z, 0.45);
  colliders.add(sofie.position.x, sofie.position.z, 0.35);

  // Kanel walks with the player out here.
  const spawnZ = 172;
  const spawn = new THREE.Vector3(trailX(spawnZ), heightAt(trailX(spawnZ), spawnZ), spawnZ);
  const kanel = place(buildHorse(), spawn.x + 3, spawn.z + 3, 0);
  scene.add(kanel);
  animated.push(kanel);

  // Bison herd grazing north-west of the trail, between the wagons and the river.
  const herd = buildBisonHerd(new THREE.Vector2(-65, 30), 24, 1.4);
  scene.add(herd);
  animated.push(herd);

  // Støvby with its cattle pen behind the east side of the street.
  const town = buildTown(scene, colliders, STOEVBY_TOWN);
  const penZ = -135;
  const pen = new THREE.Vector2(trailX(penZ) + 34, penZ);
  scene.add(markStatic(buildPen(pen, 10, colliders)));
  const cattle = buildCattle(pen, 7, 10);
  scene.add(cattle);
  animated.push(cattle);

  const fz = fordZ();
  const eastZ = fz + RIVER_HALF_WIDTH + 5;
  const westZ = fz - RIVER_HALF_WIDTH - 5;
  addVegetation(scene, common, {
    density: opts.vegetationDensity,
    cacti: false,
    grassBoost: 1.25,
    keepOut: [
      { x: C.x, z: C.y, r: 16 },
      ...streetKeepOut(STOEVBY_TOWN.zStart, STOEVBY_TOWN.zEnd, trailX),
      { x: pen.x, z: pen.y, r: 12 },
    ],
  });

  const moving: { x: number; z: number; r: number }[] = [];
  const archZ = STOEVBY_TOWN.zEnd + 5;
  const at = (x: number, z: number) => new THREE.Vector3(x, heightAt(x, z), z);
  return {
    region: 'praerien',
    colliders,
    spots: {
      jensen: jensen.position.clone(),
      sofie: sofie.position.clone(),
      brokenWagon: broken!.position.clone(),
      herd: at(herd.center.x, herd.center.y),
      fordEast: at(trailX(eastZ), eastZ),
      fordWest: at(trailX(westZ), westZ),
      townArch: at(trailX(archZ), archZ - 8),
    },
    town,
    sun: common.sun,
    spawn,
    kanel,
    herd,
    river: { east: at(trailX(eastZ), eastZ), west: at(trailX(westZ), westZ) },
    setWheelFixed: (fixed) => {
      brokenWheel!.visible = fixed;
      looseWheel!.visible = !fixed;
      broken!.rotation.z = fixed ? 0 : 0.12;
    },
    setPlayerPosition: (p, heading) => {
      jensen.lookAtPlayer(p.distanceTo(jensen.position) < 9 ? p : null);
      sofie.lookAtPlayer(p.distanceTo(sofie.position) < 9 ? p : null);
      kanel.follow(p, heading);
    },
    kanelPosition: () => kanel.position,
    dynamicColliders: () => {
      moving.length = 0;
      moving.push(...common.railway.trainCollider, ...herd.colliders);
      return moving;
    },
    update: common.update,
    setMood: common.setMood,
  };
}

/** The shallow, sandy Platte: a flowing strip of water along the river's course. */
function buildRiverWater(): { mesh: THREE.Mesh; update(dt: number, time: number): void } {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const step = 4;
  const half = RIVER_HALF_WIDTH + 1.5;
  let row = 0;
  for (let x = -340; x <= 340; x += step, row++) {
    const zc = riverZ(x);
    const y = riverWater(x);
    positions.push(x, y, zc - half, x, y, zc + half);
    uvs.push(x / 12, 0, x / 12, 1);
    if (row > 0) {
      const a = (row - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const time = { value: 0 };
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        // Flat comic water: two blues with light streaks drifting downstream (+x).
        float edge = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.88, vUv.y);
        vec3 col = mix(vec3(0.55, 0.78, 0.82), vec3(0.28, 0.56, 0.72), edge);
        float streak = sin((vUv.x - uTime * 0.35) * 6.0 + sin(vUv.y * 9.0) * 1.5);
        col = mix(col, vec3(0.9, 0.97, 1.0), step(0.93, streak) * edge * 0.8);
        gl_FragColor = vec4(col, mix(0.55, 0.9, edge));
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  return {
    mesh,
    update: (dt) => {
      time.value += dt;
      mat.uniforms.uTime!.value = time.value;
    },
  };
}

/** Chimney Rock and Scotts Bluff: famous Oregon Trail landmarks on the western horizon. */
function buildLandmarks(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap });
  const shade = (geo: THREE.BufferGeometry, base: string, top: string) => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const b = new THREE.Color(base);
    const t = new THREE.Color(top);
    const c = new THREE.Color();
    let maxY = -Infinity;
    let minY = Infinity;
    for (let i = 0; i < pos.count; i++) {
      maxY = Math.max(maxY, pos.getY(i));
      minY = Math.min(minY, pos.getY(i));
    }
    for (let i = 0; i < pos.count; i++) {
      const k = (pos.getY(i) - minY) / (maxY - minY);
      c.copy(b).lerp(t, k + (fbm(pos.getX(i) * 0.1, pos.getY(i) * 0.3, 2, 4) - 0.5) * 0.3);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return faceted(geo);
  };
  // Chimney Rock: a wide cone with a thin spire.
  const chimney = new THREE.Group();
  chimney.add(
    new THREE.Mesh(shade(new THREE.ConeGeometry(45, 55, 10, 4), '#b89a78', '#d8c3a0'), mat),
  );
  chimney.children[0]!.position.y = 27;
  const spire = new THREE.Mesh(
    shade(new THREE.CylinderGeometry(3.5, 6, 45, 8, 4), '#c9ad85', '#e6d4b0'),
    mat,
  );
  spire.position.y = 75;
  chimney.add(spire);
  chimney.position.set(-160, -8, -700);
  g.add(outline(chimney, 0.5));
  // Scotts Bluff: a long ridge of stacked bluffs.
  for (let i = 0; i < 4; i++) {
    const w = 60 + i * 12;
    const h = 40 + ((i * 17) % 25);
    const bluff = new THREE.Mesh(
      shade(new THREE.CylinderGeometry(w * 0.75, w, h, 9, 3), '#a98a68', '#cdb58f'),
      mat,
    );
    bluff.position.set(120 + i * 70, h / 2 - 8, -760 - i * 30);
    bluff.scale.z = 0.5;
    g.add(outline(bluff, 0.5));
  }
  void toon;
  return g;
}

/** Round corral of split rails. */
function buildPen(center: THREE.Vector2, r: number, colliders: World['colliders']): THREE.Group {
  const g = new THREE.Group();
  const posts = 18;
  for (let i = 0; i < posts; i++) {
    const a = (i / posts) * Math.PI * 2;
    const x = center.x + Math.cos(a) * r;
    const z = center.y + Math.sin(a) * r;
    const y = heightAt(x, z);
    g.add(part(new THREE.CylinderGeometry(0.08, 0.1, 1.5, 6), '#7d5a36', [x, y + 0.75, z]));
    const a2 = ((i + 1) / posts) * Math.PI * 2;
    const x2 = center.x + Math.cos(a2) * r;
    const z2 = center.y + Math.sin(a2) * r;
    const len = Math.hypot(x2 - x, z2 - z);
    for (const h of [0.55, 1.1]) {
      const rail = part(new THREE.BoxGeometry(0.1, 0.1, len + 0.2), '#8f6a40', [
        (x + x2) / 2,
        y + h,
        (z + z2) / 2,
      ]);
      rail.rotation.y = Math.atan2(x2 - x, z2 - z);
      g.add(rail);
    }
    colliders.add(x, z, 0.8);
  }
  return outline(g, 0.02);
}
