import * as THREE from 'three';
import { markStatic } from '../batch.js';
import { buildHorse } from '../animals.js';
import { addVegetation, buildCommon, place, streetKeepOut } from '../common.js';
import type { World, WorldOptions } from '../index.js';
import { buildMountains } from '../landscape.js';
import { buildMineEntrance, buildPine, buildRockfall, buildRopeBridge } from '../mountain.js';
import { buildMiner } from '../npc.js';
import { mulberry32 } from '../../noise.js';
import { heightAt, riverWater, trailX, type TerrainProfile } from '../terrain.js';
import { buildTown, signTexture, type TownConfig } from '../town.js';

const trail = (z: number) => Math.sin(z * 0.01 + 1) * 18 + Math.sin(z * 0.03) * 5;
const FACE_Z = -32;
const BACK_Z = -86;
const GORGE_X = trail(8) + 32;
const GORGE = { x0: GORGE_X, z0: 44, x1: GORGE_X, z1: FACE_Z + 6, halfWidth: 7, depth: 16 };
const BRIDGE_Z = 6;
/** A shallow stream crossing the trail just north of town, where you pan for gold. */
const STREAM_HALF_WIDTH = 3.5;
const streamZ = (x: number) => 150 + Math.sin(x * 0.02) * 5;

export const SOELVKLOEFTEN_TOWN: TownConfig = {
  name: 'SØLVKLØFTEN',
  zStart: 56,
  zEnd: 132,
  arch: 'end',
  west: [
    ['SALOON', 66, 2],
    ['MINEKONTOR', 79, 1],
    ['HOTEL', 118, 2],
  ],
  east: [
    ['GULDKØB', 64, 1],
    ['BUTIK', 77, 1],
    ['SMED', 90, 1],
    ['STALD', 103, 1],
    ['POSTHUS', 116, 1],
  ],
  squareZ: 97,
  waterTowerZ: 110,
  seed: 1848,
};

/** Chapter 5: mountain valley with the mining town, a gorge and the ridge to the west. */
export const BJERGENE_TERRAIN: TerrainProfile = {
  hills: 30,
  seed: 43,
  trail,
  flatZones: [{ z0: SOELVKLOEFTEN_TOWN.zStart, z1: SOELVKLOEFTEN_TOWN.zEnd }],
  ridge: { faceZ: FACE_Z, backZ: BACK_Z, height: 34 },
  gorges: [GORGE],
  river: { z: streamZ, halfWidth: STREAM_HALF_WIDTH },
  snowline: 16,
  // The trail disappears into the blocked tunnel and comes out again beyond the ridge.
  trailGaps: [[FACE_Z + 1, BACK_Z - 18]],
  decks: [],
};

export function buildBjergene(scene: THREE.Scene, opts: WorldOptions): World {
  const rimY = Math.max(heightAt(GORGE_X - 10, BRIDGE_Z), heightAt(GORGE_X + 10, BRIDGE_Z));
  // Let people walk on the bridge deck.
  BJERGENE_TERRAIN.decks = [
    { x0: GORGE_X - 10.5, x1: GORGE_X + 10.5, z: BRIDGE_Z, halfWidth: 0.9, y: rimY },
  ];

  const common = buildCommon(scene);
  const { colliders, animated } = common;
  const mountains = buildMountains();
  mountains.position.z = 520;
  mountains.scale.setScalar(1.3);
  scene.add(mountains);
  const rand = mulberry32(53);

  const town = buildTown(scene, colliders, SOELVKLOEFTEN_TOWN);

  // The blasted road tunnel where the trail meets the ridge.
  const tunnelX = trailX(FACE_Z);
  const tunnel = buildMineEntrance('VEJTUNNEL', signTexture('VEJTUNNEL', '#b07a42', '#2a1a0c'));
  place(tunnel, tunnelX, FACE_Z + 3, 0);
  tunnel.position.y = heightAt(tunnelX, FACE_Z + 6);
  scene.add(markStatic(tunnel));
  const rocks = buildRockfall(rand, 6);
  place(rocks, tunnelX, FACE_Z + 5.5, 0);
  scene.add(markStatic(rocks));
  colliders.addBox(tunnelX, FACE_Z + 6, 8, 5, 0);

  // The old silver mine on the far side of the gorge.
  const mineX = GORGE_X + 18;
  const mine = buildMineEntrance('SØLVMINEN', signTexture('SØLVMINEN', '#b07a42', '#2a1a0c'));
  place(mine, mineX, FACE_Z + 3, 0);
  mine.position.y = heightAt(mineX, FACE_Z + 7);
  scene.add(markStatic(mine));

  // The rope bridge over the gorge.
  const bridge = buildRopeBridge(GORGE_X - 10.5, GORGE_X + 10.5, BRIDGE_Z, rimY + 0.05);
  scene.add(bridge);
  // A creek at the bottom of the gorge.
  const creek = new THREE.Mesh(
    new THREE.PlaneGeometry(6, GORGE.z0 - GORGE.z1),
    new THREE.MeshToonMaterial({ color: '#5fa8c2' }),
  );
  creek.rotation.x = -Math.PI / 2;
  creek.position.set(GORGE_X, heightAt(GORGE_X, 10) + 0.4, (GORGE.z0 + GORGE.z1) / 2);
  scene.add(creek);

  // The stream's water.
  const streamPts: number[] = [];
  const streamIdx: number[] = [];
  let row = 0;
  for (let x = -340; x <= 340; x += 4, row++) {
    const zc = streamZ(x);
    const y = riverWater(x);
    streamPts.push(x, y, zc - STREAM_HALF_WIDTH - 1, x, y, zc + STREAM_HALF_WIDTH + 1);
    if (row > 0) {
      const a = (row - 1) * 2;
      streamIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const streamGeo = new THREE.BufferGeometry();
  streamGeo.setAttribute('position', new THREE.Float32BufferAttribute(streamPts, 3));
  streamGeo.setIndex(streamIdx);
  streamGeo.computeVertexNormals();
  const stream = new THREE.Mesh(
    streamGeo,
    new THREE.MeshToonMaterial({ color: '#5fa8c2', transparent: true, opacity: 0.85 }),
  );
  stream.renderOrder = 2;
  scene.add(stream);

  // Pines everywhere except the town and the trail; snowy up on the ridge.
  for (let i = 0; i < 170; i++) {
    const x = (rand() - 0.5) * 360;
    const z = (rand() - 0.5) * 360;
    if (Math.abs(x - trailX(z)) < 10) continue;
    if (
      z > SOELVKLOEFTEN_TOWN.zStart - 12 &&
      z < SOELVKLOEFTEN_TOWN.zEnd + 12 &&
      Math.abs(x - trailX(z)) < 34
    )
      continue;
    if (Math.abs(x - GORGE_X) < 12 && z < GORGE.z0 + 4 && z > GORGE.z1 - 4) continue;
    if (Math.abs(x - mineX) < 8 && Math.abs(z - FACE_Z) < 12) continue;
    const y = heightAt(x, z);
    const pine = place(buildPine(rand, y > 14), x, z, rand() * 6);
    scene.add(markStatic(pine));
    colliders.add(x, z, 0.5);
  }

  // Kanel walks with the player.
  const spawnZ = 172;
  const spawn = new THREE.Vector3(trailX(spawnZ), heightAt(trailX(spawnZ), spawnZ), spawnZ);
  const kanel = buildHorse();
  kanel.position.set(spawn.x + 3, heightAt(spawn.x + 3, spawn.z + 3), spawn.z + 3);
  scene.add(kanel);
  animated.push(kanel);
  let kanelFollows = true;

  // Morten waits on the town square.
  const morten = place(
    buildMiner(),
    trailX(SOELVKLOEFTEN_TOWN.squareZ) + 3,
    SOELVKLOEFTEN_TOWN.squareZ + 8,
    0,
  );
  scene.add(morten);
  animated.push(morten);
  colliders.add(morten.position.x, morten.position.z, 0.45);

  addVegetation(scene, common, {
    density: opts.vegetationDensity * 0.6,
    cacti: false,
    keepOut: [
      ...streetKeepOut(SOELVKLOEFTEN_TOWN.zStart, SOELVKLOEFTEN_TOWN.zEnd, trailX),
      { x: GORGE_X, z: 8, r: 40 },
    ],
  });

  const moving: { x: number; z: number; r: number }[] = [];
  const at = (x: number, z: number) => new THREE.Vector3(x, heightAt(x, z), z);
  const exitZ = BACK_Z - 22;
  return {
    region: 'bjergene',
    colliders,
    spots: {
      morten: morten.position.clone(),
      creek: at(trailX(150) + 7, streamZ(trailX(150) + 7) - STREAM_HALF_WIDTH - 1.5),
      bridgeStart: at(GORGE_X - 12, BRIDGE_Z),
      bridgeEnd: at(GORGE_X + 12, BRIDGE_Z),
      mine: at(mineX, FACE_Z + 8),
      tunnel: at(tunnelX, FACE_Z + 9),
      exit: at(trailX(exitZ), exitZ),
    },
    town,
    sun: common.sun,
    spawn,
    kanel,
    bridge,
    setKanelFollow: (on) => (kanelFollows = on),
    setPlayerPosition: (p, heading) => {
      common.setPlayer(p);
      morten.lookAtPlayer(p.distanceTo(morten.position) < 9 ? p : null);
      kanel.follow(kanelFollows ? p : null, heading);
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
