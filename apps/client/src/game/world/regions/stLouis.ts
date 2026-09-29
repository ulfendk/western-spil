import * as THREE from 'three';
import { markStatic } from '../batch.js';
import { buildBisonHerd, buildHorse } from '../animals.js';
import {
  buildCampfire,
  buildCampProps,
  buildFence,
  buildSign,
  buildWantedPoster,
} from '../camp.js';
import { addVegetation, buildCommon, place, streetKeepOut } from '../common.js';
import type { World, WorldOptions } from '../index.js';
import { buildMesas, buildMountains } from '../landscape.js';
import { buildPind } from '../npc.js';
import { heightAt, trailX, type TerrainProfile } from '../terrain.js';
import { buildTown, ST_LOUIS_TOWN } from '../town.js';
import { buildWagon } from '../wagon.js';

/** Chapter 1: red-rock prairie outside St. Louis, with the camp and the town. */
export const ST_LOUIS_TERRAIN: TerrainProfile = {
  hills: 26,
  seed: 7,
  trail: (z) => Math.sin(z * 0.012) * 30 + Math.sin(z * 0.031) * 8,
  flatZones: [{ z0: ST_LOUIS_TOWN.zStart, z1: ST_LOUIS_TOWN.zEnd }],
};

export function buildStLouis(scene: THREE.Scene, opts: WorldOptions): World {
  const common = buildCommon(scene);
  const { colliders, animated } = common;
  scene.add(markStatic(buildMesas()));
  scene.add(buildMountains());

  // The camp by the trail where the journey begins.
  const campZ = 18;
  const camp = new THREE.Vector2(trailX(campZ) + 11, campZ);

  const wagon = place(buildWagon(), camp.x - 1.5, camp.y - 6, 0.15);
  scene.add(markStatic(wagon));
  for (const dz of [-1.6, 0, 1.6]) {
    colliders.add(wagon.position.x + Math.sin(0.15) * dz, wagon.position.z + dz, 1.3);
  }
  colliders.add(wagon.position.x - Math.sin(0.15) * 3.3, wagon.position.z - 3.3, 0.5); // tongue

  const kanel = place(buildHorse(), camp.x - 4.5, camp.y + 2.5, Math.PI / 2 + 0.3);
  scene.add(kanel);
  animated.push(kanel);
  colliders.add(kanel.position.x, kanel.position.z, 1.1);

  const fire = place(buildCampfire(), camp.x + 2, camp.y + 2);
  scene.add(fire);
  animated.push(fire);
  colliders.add(fire.position.x, fire.position.z, 1.0);
  scene.add(markStatic(place(buildCampProps(), camp.x + 2, camp.y + 2)));
  // Log seats and bedroll around the fire (offsets match buildCampProps).
  for (const [dx, dz, r] of [
    [-0.5, 1.9, 0.4],
    [0.5, 1.9, 0.4],
    [-1.8, -0.3, 0.4],
    [-1.6, 0.7, 0.4],
    [1.9, -0.9, 0.6],
  ] as const) {
    colliders.add(camp.x + 2 + dx, camp.y + 2 + dz, r);
  }

  const fence = place(buildFence(24), camp.x + 8, camp.y - 12);
  scene.add(markStatic(fence));
  for (let i = 0; i <= 10; i++) colliders.add(fence.position.x, fence.position.z + i * 2.4, 0.6);

  const signZ = 32;
  const sign = place(buildSign('VESTPÅ'), trailX(signZ) - 4.5, signZ, Math.PI / 2);
  scene.add(sign);
  colliders.add(sign.position.x, sign.position.z, 0.35);
  // The poster hangs on the trail-facing side of the post, below the arrow.
  const poster = buildWantedPoster();
  poster.position.set(0, 1.35, 0.13);
  poster.visible = false;
  sign.add(poster);

  // Postmester Pind waits by the campfire.
  const pind = place(buildPind(), camp.x - 0.5, camp.y + 4.2, Math.PI * 0.9);
  scene.add(pind);
  animated.push(pind);
  colliders.add(pind.position.x, pind.position.z, 0.45);

  const town = buildTown(scene, colliders, ST_LOUIS_TOWN);

  addVegetation(scene, common, {
    density: opts.vegetationDensity,
    keepOut: [
      { x: camp.x, z: camp.y, r: 13 },
      { x: sign.position.x, z: sign.position.z, r: 2 },
      ...streetKeepOut(ST_LOUIS_TOWN.zStart, ST_LOUIS_TOWN.zEnd, trailX),
    ],
  });

  const herd = buildBisonHerd(new THREE.Vector2(-95, -70), 11);
  scene.add(herd);
  animated.push(herd);

  const moving: { x: number; z: number; r: number }[] = [];
  const spawnZ = 44;
  const westZ = -70;
  return {
    region: 'st-louis',
    colliders,
    spots: {
      pind: pind.position.clone(),
      kanel: kanel.position.clone(),
      wagon: wagon.position.clone(),
      sign: sign.position.clone(),
      trailWest: new THREE.Vector3(trailX(westZ), heightAt(trailX(westZ), westZ), westZ),
    },
    town,
    sun: common.sun,
    spawn: new THREE.Vector3(trailX(spawnZ), heightAt(trailX(spawnZ), spawnZ), spawnZ),
    setPosterVisible: (visible) => (poster.visible = visible),
    setPlayerPosition: (p) => pind.lookAtPlayer(p.distanceTo(pind.position) < 9 ? p : null),
    kanelPosition: () => kanel.position,
    herd,
    dynamicColliders: () => {
      moving.length = 0;
      moving.push(...common.railway.trainCollider, ...herd.colliders);
      return moving;
    },
    update: common.update,
    setMood: common.setMood,
  };
}
