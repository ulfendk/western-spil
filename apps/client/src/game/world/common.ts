import * as THREE from 'three';
import { buildTumbleweeds, buildVultures, type Animated } from './animals.js';
import { Colliders, type Circle } from './colliders.js';
import { buildRailway } from './railway.js';
import { buildSky, SUN_DIR } from './sky.js';
import { buildTerrain, buildTrail, heightAt } from './terrain.js';
import { buildVegetation, wind, type VegetationOptions } from './vegetation.js';

/** Helper: put an object on the ground at (x, z). */
export function place<T extends THREE.Object3D>(
  obj: T,
  x: number,
  z: number,
  rotY = 0,
  sink = 0,
): T {
  obj.position.set(x, heightAt(x, z) - sink, z);
  obj.rotation.y = rotY;
  return obj;
}

/** What every region has: sky, land, trail, railway, wildlife, vegetation and light. */
export interface Common {
  colliders: Colliders;
  animated: Animated[];
  sun: THREE.DirectionalLight;
  railway: ReturnType<typeof buildRailway>;
  update(dt: number, time: number): void;
}

export function buildCommon(scene: THREE.Scene): Common {
  const colliders = new Colliders();
  const animated: Animated[] = [];
  scene.add(buildSky());
  scene.add(buildTerrain());
  scene.add(buildTrail());

  const railway = buildRailway(colliders);
  scene.add(railway);
  animated.push(railway);

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

  return {
    colliders,
    animated,
    sun,
    railway,
    update(dt, time) {
      wind.value = time;
      for (const a of animated) a.update(dt, time);
    },
  };
}

/** Vegetation after everything else is placed, so it can keep out of the way. */
export function addVegetation(
  scene: THREE.Scene,
  common: Common,
  opts: Omit<VegetationOptions, 'colliders'>,
) {
  scene.add(buildVegetation({ ...opts, colliders: common.colliders }));
}

/** Keep-out circles along a town's main street. */
export function streetKeepOut(zStart: number, zEnd: number, trailX: (z: number) => number) {
  const out: { x: number; z: number; r: number }[] = [];
  for (let z = zStart - 8; z <= zEnd + 4; z += 10) out.push({ x: trailX(z), z, r: 21 });
  return out;
}

export type { Circle };
