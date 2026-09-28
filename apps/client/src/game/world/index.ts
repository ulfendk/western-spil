import * as THREE from 'three';
import {
  buildBisonHerd,
  buildHorse,
  buildTumbleweeds,
  buildVultures,
  type Animated,
} from './animals.js';
import { buildCampfire, buildCampProps, buildFence, buildSign } from './camp.js';
import { Colliders } from './colliders.js';
import { buildMesas, buildMountains } from './landscape.js';
import { buildRailway } from './railway.js';
import { buildSky, SUN_DIR } from './sky.js';
import { buildTerrain, buildTrail, heightAt, trailX } from './terrain.js';
import { buildVegetation, wind } from './vegetation.js';
import { buildWagon } from './wagon.js';

export { heightAt, trailX, WORLD_HALF } from './terrain.js';
export { SUN_DIR } from './sky.js';

export interface World {
  colliders: Colliders;
  sun: THREE.DirectionalLight;
  /** Moving obstacles (the train) as circles, refreshed every frame. */
  dynamicColliders(): { x: number; z: number; r: number }[];
  update(dt: number, time: number): void;
  spawn: THREE.Vector3;
}

export interface WorldOptions {
  vegetationDensity: number;
}

function place<T extends THREE.Object3D>(obj: T, x: number, z: number, rotY = 0, sink = 0): T {
  obj.position.set(x, heightAt(x, z) - sink, z);
  obj.rotation.y = rotY;
  return obj;
}

export function buildWorld(scene: THREE.Scene, opts: WorldOptions): World {
  const colliders = new Colliders();
  const animated: Animated[] = [];

  scene.add(buildSky());
  scene.add(buildTerrain());
  scene.add(buildTrail());
  scene.add(buildMesas());
  scene.add(buildMountains());

  // The camp by the trail where the journey begins.
  const campZ = 18;
  const camp = new THREE.Vector2(trailX(campZ) + 11, campZ);

  const wagon = place(buildWagon(), camp.x - 1.5, camp.y - 6, 0.15);
  scene.add(wagon);
  for (const dz of [-1.6, 0, 1.6])
    colliders.add(wagon.position.x + Math.sin(0.15) * dz, wagon.position.z + dz, 1.3);
  colliders.add(wagon.position.x - Math.sin(0.15) * 3.3, wagon.position.z - 3.3, 0.5); // tongue

  const kanel = place(buildHorse(), camp.x - 4.5, camp.y + 2.5, Math.PI / 2 + 0.3);
  scene.add(kanel);
  animated.push(kanel);
  colliders.add(kanel.position.x, kanel.position.z, 1.1);

  const fire = place(buildCampfire(), camp.x + 2, camp.y + 2);
  scene.add(fire);
  animated.push(fire);
  colliders.add(fire.position.x, fire.position.z, 1.0);
  scene.add(place(buildCampProps(), camp.x + 2, camp.y + 2));

  const fence = place(buildFence(24), camp.x + 8, camp.y - 12);
  scene.add(fence);
  for (let i = 0; i <= 10; i++) colliders.add(fence.position.x, fence.position.z + i * 2.4, 0.6);

  const signZ = 32;
  const sign = place(buildSign('VESTPÅ'), trailX(signZ) - 4.5, signZ, Math.PI / 2);
  scene.add(sign);
  colliders.add(sign.position.x, sign.position.z, 0.35);

  scene.add(
    buildVegetation({
      density: opts.vegetationDensity,
      colliders,
      keepOut: [
        { x: camp.x, z: camp.y, r: 13 },
        { x: sign.position.x, z: sign.position.z, r: 2 },
      ],
    }),
  );

  const railway = buildRailway();
  scene.add(railway);
  animated.push(railway);

  const herd = buildBisonHerd(new THREE.Vector2(-95, -70), 11);
  scene.add(herd);
  animated.push(herd);

  const vultures = buildVultures(new THREE.Vector3(-40, 45, -130));
  scene.add(vultures);
  animated.push(vultures);

  const tumbleweeds = buildTumbleweeds();
  scene.add(tumbleweeds);
  animated.push(tumbleweeds);

  // Warm afternoon light: sky/ground hemisphere + a low sun that casts shadows.
  scene.add(new THREE.HemisphereLight('#fff3d6', '#9c6a44', 1.05));
  const sun = new THREE.DirectionalLight('#fff0c8', 1.9);
  sun.position.copy(SUN_DIR).multiplyScalar(100);
  scene.add(sun, sun.target);
  scene.fog = new THREE.Fog('#f5d49a', 140, 900);

  const spawnZ = 44;
  return {
    colliders,
    sun,
    dynamicColliders: () => railway.trainCollider,
    spawn: new THREE.Vector3(trailX(spawnZ), heightAt(trailX(spawnZ), spawnZ), spawnZ),
    update(dt, time) {
      wind.value = time;
      for (const a of animated) a.update(dt, time);
    },
  };
}
