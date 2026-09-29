import * as THREE from 'three';
import { markStatic } from '../batch.js';
import { buildHorse } from '../animals.js';
import { buildCampfire } from '../camp.js';
import { buildBucket, buildCottonwood, buildRack, buildTipi } from '../camp4.js';
import { addVegetation, buildCommon, place } from '../common.js';
import type { World, WorldOptions } from '../index.js';
import { buildMountains } from '../landscape.js';
import { buildElder, buildPerson } from '../npc.js';
import { mulberry32 } from '../../noise.js';
import { heightAt, riverWater, trailX, type TerrainProfile } from '../terrain.js';

const trail = (z: number) => Math.sin(z * 0.011 + 4) * 20 + Math.sin(z * 0.029) * 6;
const CAMP_Z = -10;
const CAMP_X = trail(CAMP_Z) - 34;
const CREEK_HALF_WIDTH = 5;
/** The creek runs north–south-ish west of the camp, crossing the trail further south. */
const creekZ = (x: number) => -48 + Math.sin(x * 0.02) * 14;

/** Chapter 4: grassy foothills with a creek, cottonwoods and the Lakota camp. */
export const LEJREN_TERRAIN: TerrainProfile = {
  hills: 22,
  seed: 37,
  trail,
  flatZones: [{ z0: CAMP_Z - 22, z1: CAMP_Z + 22, x: CAMP_X, halfWidth: 24 }],
  river: { z: creekZ, halfWidth: CREEK_HALF_WIDTH },
};

export function buildLejren(scene: THREE.Scene, opts: WorldOptions): World {
  const common = buildCommon(scene);
  const { colliders, animated } = common;
  // The Rockies, much closer now.
  const mountains = buildMountains();
  mountains.position.z = 380;
  mountains.scale.setScalar(1.15);
  scene.add(mountains);
  scene.add(buildCreekWater());

  // Tipis in a circle around the fire; doors face east (+x), as is traditional.
  const rand = mulberry32(41);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    // Leave the east side open towards the trail.
    if (Math.cos(a) > 0.8) continue;
    const x = CAMP_X + Math.cos(a) * 15;
    const z = CAMP_Z + Math.sin(a) * 15;
    const h = 5.5 + rand() * 1.5;
    scene.add(markStatic(place(buildTipi(i, h), x, z, 0)));
    colliders.add(x, z, h * 0.42);
  }
  const fire = place(buildCampfire(), CAMP_X, CAMP_Z);
  scene.add(fire);
  animated.push(fire);
  colliders.add(CAMP_X, CAMP_Z, 1);
  for (const [dx, dz, r] of [
    [-7, 9, 0],
    [8, -8, 0.6],
  ] as const) {
    scene.add(markStatic(place(buildRack(), CAMP_X + dx, CAMP_Z + dz, r)));
    colliders.add(CAMP_X + dx, CAMP_Z + dz, 1.7);
  }

  // Horses grazing by the creek (no saddles here).
  for (let i = 0; i < 4; i++) {
    const x = CAMP_X - 14 + i * 5;
    const z = CAMP_Z - 26 + (i % 2) * 3;
    const coats = ['#6b4423', '#e9dfc4', '#3a2a1e', '#a0703a'];
    const horse = place(
      buildHorse({ saddle: false, coat: coats[i % coats.length]! }),
      x,
      z,
      rand() * Math.PI * 2,
    );
    scene.add(horse);
    animated.push(horse);
    colliders.add(x, z, 1.1);
  }

  // Cottonwoods along the creek.
  for (let x = CAMP_X - 70; x < CAMP_X + 90; x += 9 + rand() * 8) {
    for (const side of [-1, 1]) {
      if (rand() < 0.35) continue;
      const z = creekZ(x) + side * (CREEK_HALF_WIDTH + 4 + rand() * 6);
      if (Math.abs(x - trailX(z)) < 7) continue;
      const tree = place(buildCottonwood(rand), x, z, rand() * 6);
      scene.add(markStatic(tree));
      colliders.add(x, z, 0.6);
    }
  }

  // People.
  const mato = place(buildElder(), CAMP_X + 3, CAMP_Z + 2.5, 0);
  const wanbli = place(
    buildPerson({
      scale: 0.74,
      dress: '#c8a06a',
      hair: '#1f1a17',
      braids: true,
      yoke: ['#2f4a78', '#f3ecdc', '#b8322a'],
    }),
    CAMP_X + 5,
    CAMP_Z - 2,
    0,
  );
  scene.add(mato, wanbli);
  animated.push(mato, wanbli);
  colliders.add(mato.position.x, mato.position.z, 0.45);

  // Where Wanbli meets the player in the storm: by the trail, with a lantern.
  const stormZ = 60;
  const stormSpot = new THREE.Vector3(
    trailX(stormZ) - 3,
    heightAt(trailX(stormZ) - 3, stormZ),
    stormZ,
  );
  const lantern = new THREE.PointLight('#ffcf70', 8, 14, 1.5);
  const lanternMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.28, 0.2),
    new THREE.MeshBasicMaterial({ color: '#ffd98a' }),
  );
  lanternMesh.add(lantern);
  scene.add(lanternMesh);

  // Kanel walks with the player.
  const spawnZ = 165;
  const spawn = new THREE.Vector3(trailX(spawnZ), heightAt(trailX(spawnZ), spawnZ), spawnZ);
  const kanel = buildHorse();
  kanel.position.set(spawn.x + 3, heightAt(spawn.x + 3, spawn.z + 3), spawn.z + 3);
  scene.add(kanel);
  animated.push(kanel);

  // A water spot on the creek bank near the camp, with a bucket waiting.
  const waterX = CAMP_X - 6;
  const waterZ = creekZ(waterX) + CREEK_HALF_WIDTH + 1.5;
  const bucket = place(buildBucket(), CAMP_X + 7, CAMP_Z + 4);
  scene.add(bucket);
  // Animal tracks in the mud by the creek (for the tracking lesson).
  const tracksX = CAMP_X + 12;
  const tracksZ = creekZ(tracksX) + CREEK_HALF_WIDTH + 2;
  for (let i = 0; i < 8; i++) {
    const p = place(
      new THREE.Mesh(
        new THREE.CircleGeometry(0.12, 8),
        new THREE.MeshBasicMaterial({ color: '#4a3220' }),
      ),
      tracksX + i * 0.5,
      tracksZ + (i % 2) * 0.3,
    );
    p.rotation.x = -Math.PI / 2;
    p.position.y += 0.03;
    scene.add(p);
  }

  addVegetation(scene, common, {
    density: opts.vegetationDensity,
    cacti: false,
    grassBoost: 1.1,
    keepOut: [{ x: CAMP_X, z: CAMP_Z, r: 20 }],
  });

  let wanbliAt: 'storm' | 'camp' = 'camp';
  const campWanbli = wanbli.position.clone();
  const setWanbli = (where: 'storm' | 'camp') => {
    wanbliAt = where;
    if (where === 'storm') {
      wanbli.position.copy(stormSpot);
      lanternMesh.position.set(stormSpot.x + 0.35, stormSpot.y + 1.1, stormSpot.z - 0.2);
      lanternMesh.visible = true;
    } else {
      wanbli.position.copy(campWanbli);
      lanternMesh.visible = false;
    }
  };
  setWanbli('camp');

  const moving: { x: number; z: number; r: number }[] = [];
  const at = (x: number, z: number) => new THREE.Vector3(x, heightAt(x, z), z);
  return {
    region: 'lejren',
    colliders,
    spots: {
      storm: stormSpot,
      get wanbli() {
        return wanbli.position.clone();
      },
      mato: mato.position.clone(),
      tracks: at(tracksX, tracksZ),
      water: at(waterX, waterZ),
      fire: at(CAMP_X, CAMP_Z),
      camp: at(CAMP_X + 10, CAMP_Z),
    } as Record<string, THREE.Vector3>,
    town: {
      config: {
        name: 'LEJREN',
        zStart: CAMP_Z - 20,
        zEnd: CAMP_Z + 20,
        arch: 'start',
        west: [],
        east: [],
        squareZ: CAMP_Z,
        waterTowerZ: CAMP_Z,
        seed: 1,
      },
      hasPit: false,
      contains: (p) => Math.hypot(p.x - CAMP_X, p.z - CAMP_Z) < 18,
      center: at(CAMP_X, CAMP_Z),
      pitStart: at(CAMP_X, CAMP_Z),
      pitStake: at(CAMP_X, CAMP_Z),
      pitDir: new THREE.Vector3(1, 0, 0),
    },
    sun: common.sun,
    spawn,
    kanel,
    setWanbli,
    setPlayerPosition: (p, heading) => {
      common.setPlayer(p);
      mato.lookAtPlayer(p.distanceTo(mato.position) < 9 ? p : null);
      wanbli.lookAtPlayer(p.distanceTo(wanbli.position) < 9 ? p : null);
      kanel.follow(p, heading);
      void wanbliAt;
    },
    kanelPosition: () => kanel.position,
    dynamicColliders: () => {
      moving.length = 0;
      moving.push(...common.railway.trainCollider);
      return moving;
    },
    update: common.update,
    setMood: common.setMood,
  };
}

/** Clear creek water along the creek's course. */
function buildCreekWater(): THREE.Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  let row = 0;
  for (let x = -340; x <= 340; x += 4, row++) {
    const zc = creekZ(x);
    const y = riverWater(x);
    positions.push(x, y, zc - CREEK_HALF_WIDTH - 1, x, y, zc + CREEK_HALF_WIDTH + 1);
    if (row > 0) {
      const a = (row - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshToonMaterial({ color: '#5fa8c2', transparent: true, opacity: 0.8 }),
  );
  mesh.renderOrder = 2;
  return mesh;
}
