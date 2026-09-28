import * as THREE from 'three';
import { buildTumbleweeds, buildVultures, type Animated } from './animals.js';
import { Colliders, type Circle } from './colliders.js';
import { buildRailway } from './railway.js';
import { buildSky, SUN_DIR, type Mood } from './sky.js';
import { thunder } from '../../audio/sfx.js';
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
  /** Weather / time of day: sky, light, fog, rain and lightning. */
  setMood(mood: Mood): void;
  /** Rain falls around the player. */
  setPlayer(p: THREE.Vector3): void;
}

const LIGHT: Record<Mood, { hemi: number; sun: number; fog: string; near: number; far: number }> = {
  day: { hemi: 1.05, sun: 1.9, fog: '#f5d49a', near: 140, far: 900 },
  storm: { hemi: 0.55, sun: 0.25, fog: '#565b66', near: 25, far: 260 },
  night: { hemi: 0.28, sun: 0.12, fog: '#141a33', near: 60, far: 420 },
};

export function buildCommon(scene: THREE.Scene): Common {
  const colliders = new Colliders();
  const animated: Animated[] = [];
  const sky = buildSky();
  scene.add(sky.group);
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
  const hemi = new THREE.HemisphereLight('#fff3d6', '#9c6a44', 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff0c8', 1.9);
  sun.position.copy(SUN_DIR).multiplyScalar(100);
  scene.add(sun, sun.target);
  const fog = new THREE.Fog('#f5d49a', 140, 900);
  scene.fog = fog;

  // Rain: short streaks in a box that follows the player.
  const drops = 1400;
  const rainPos = new Float32Array(drops * 6);
  const seeds = new Float32Array(drops * 3);
  for (let i = 0; i < drops; i++) {
    seeds[i * 3] = (Math.random() - 0.5) * 50;
    seeds[i * 3 + 1] = Math.random() * 25;
    seeds[i * 3 + 2] = (Math.random() - 0.5) * 50;
  }
  const rainGeo = new THREE.BufferGeometry().setAttribute(
    'position',
    new THREE.BufferAttribute(rainPos, 3),
  );
  const rain = new THREE.LineSegments(
    rainGeo,
    new THREE.LineBasicMaterial({ color: '#b8c4d8', transparent: true, opacity: 0.6 }),
  );
  rain.frustumCulled = false;
  rain.visible = false;
  scene.add(rain);
  const player = new THREE.Vector3();

  let mood: Mood = 'day';
  let nextLightning = 5;
  let flash = 0;
  const setMood = (m: Mood) => {
    mood = m;
    const l = LIGHT[m];
    sky.setMood(m);
    hemi.intensity = l.hemi;
    sun.intensity = l.sun;
    hemi.color.set(m === 'night' ? '#8fa0d8' : m === 'storm' ? '#c0c8d8' : '#fff3d6');
    sun.color.set(m === 'night' ? '#9fb0e8' : '#fff0c8');
    fog.color.set(l.fog);
    fog.near = l.near;
    fog.far = l.far;
    rain.visible = m === 'storm';
  };

  return {
    colliders,
    animated,
    sun,
    railway,
    setMood,
    setPlayer: (p) => player.copy(p),
    update(dt, time) {
      wind.value = time;
      for (const a of animated) a.update(dt, time);
      if (mood === 'storm') {
        // Falling rain streaks, wrapped around the player.
        for (let i = 0; i < drops; i++) {
          const y = (((seeds[i * 3 + 1]! - time * 18) % 25) + 25) % 25;
          const x = player.x + seeds[i * 3]!;
          const z = player.z + seeds[i * 3 + 2]!;
          rainPos.set([x, player.y + y - 5, z, x + 0.15, player.y + y - 4.3, z], i * 6);
        }
        rainGeo.attributes.position!.needsUpdate = true;
        // Lightning now and then, with thunder a moment later.
        nextLightning -= dt;
        if (nextLightning < 0) {
          nextLightning = 6 + Math.random() * 8;
          flash = 1;
          const distance = 0.4 + Math.random() * 1.5;
          thunder(distance);
        }
        flash = Math.max(0, flash - dt * 5);
        sky.flash(flash * 0.8);
        hemi.intensity = LIGHT.storm.hemi + flash * 2.5;
      }
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
