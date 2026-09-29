import * as THREE from 'three';
import { character } from '../../models.js';
import { buildBisonHerd, buildHorse, type Animated } from '../animals.js';
import { addVegetation, buildCommon } from '../common.js';
import { buildFort } from '../fort.js';
import type { World, WorldOptions } from '../index.js';
import { buildMountains } from '../landscape.js';
import { mulberry32 } from '../../noise.js';
import { outline, part } from '../../toon.js';
import { RAIL_X, railHeight } from '../terrain.js';
import { heightAt, trailX, type TerrainProfile } from '../terrain.js';

const trail = (z: number) => Math.sin(z * 0.009 + 2) * 24 + Math.sin(z * 0.033) * 7;
const FORT_Z = 40;
const FORT_X = trail(FORT_Z) - 44;
const FORT_W = 56;
const FORT_D = 48;
/** Telegraph poles along the railway stand here (see railway.ts). */
const POLE_X = RAIL_X + 4.5;
const CUT_Z = -45;

/** Chapter 3: rolling grassland with Fort Kearny beside the trail. */
export const FORTET_TERRAIN: TerrainProfile = {
  hills: 16,
  seed: 29,
  trail,
  flatZones: [
    {
      z0: FORT_Z - FORT_D / 2 - 4,
      z1: FORT_Z + FORT_D / 2 + 4,
      x: FORT_X,
      halfWidth: FORT_W / 2 + 6,
    },
  ],
};

export function buildFortet(scene: THREE.Scene, opts: WorldOptions): World {
  const common = buildCommon(scene);
  const { colliders, animated } = common;
  scene.add(buildMountains());

  const fort = buildFort(scene, colliders, { x: FORT_X, z: FORT_Z, width: FORT_W, depth: FORT_D });
  animated.push(...fort.animated);

  // Telegraph line from the fort gate out to the railway's line.
  const lineGroup = new THREE.Group();
  const tops: THREE.Vector3[] = [];
  for (let x = fort.gate.x + 4; x < POLE_X; x += 22) {
    const z = FORT_Z - 6;
    const y = heightAt(x, z);
    lineGroup.add(part(new THREE.CylinderGeometry(0.1, 0.14, 7, 7), '#6b4a2e', [x, y + 3.5, z]));
    lineGroup.add(part(new THREE.BoxGeometry(0.12, 0.12, 1.3), '#6b4a2e', [x, y + 6.6, z]));
    colliders.add(x, z, 0.3);
    tops.push(new THREE.Vector3(x, y + 6.8, z));
  }
  tops.push(new THREE.Vector3(POLE_X, railHeight(FORT_Z - 6) + 6.8, FORT_Z - 6));
  const wire: number[] = [];
  for (let i = 0; i < tops.length - 1; i++) {
    const a = tops[i]!;
    const b = tops[i + 1]!;
    for (let s = 0; s < 8; s++) {
      const p = (t: number) => [
        THREE.MathUtils.lerp(a.x, b.x, t),
        THREE.MathUtils.lerp(a.y, b.y, t) - Math.sin(t * Math.PI) * 0.6,
        a.z,
      ];
      wire.push(...p(s / 8), ...p((s + 1) / 8));
    }
  }
  lineGroup.add(
    new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.Float32BufferAttribute(wire, 3),
      ),
      new THREE.LineBasicMaterial({ color: '#2a2320' }),
    ),
  );
  scene.add(outline(lineGroup, 0.02));

  // The cut: a toppled pole, a dangling wire and four sizes of boot prints.
  const cut = new THREE.Group();
  const cutY = railHeight(CUT_Z);
  const fallen = part(new THREE.CylinderGeometry(0.1, 0.14, 7, 7), '#6b4a2e', [0, 0, 0]);
  fallen.position.set(POLE_X + 2.5, cutY + 0.4, CUT_Z);
  fallen.rotation.z = Math.PI / 2 - 0.15;
  const dangling = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          POLE_X,
          cutY + 6.5,
          CUT_Z + 12,
          POLE_X + 0.4,
          cutY + 0.2,
          CUT_Z + 2,
          POLE_X,
          cutY + 6.5,
          CUT_Z - 12,
          POLE_X - 0.3,
          cutY + 0.2,
          CUT_Z - 2,
        ],
        3,
      ),
    ),
    new THREE.LineBasicMaterial({ color: '#2a2320' }),
  );
  cut.add(outline(fallen, 0.02), dangling);
  const prints = new THREE.Group();
  const rand = mulberry32(4);
  [0.16, 0.22, 0.28, 0.36].forEach((size, k) => {
    for (let i = 0; i < 5; i++) {
      const foot = part(
        new THREE.CircleGeometry(size, 10),
        '#5e3a1a',
        [0, 0, 0],
        [-Math.PI / 2, 0, 0],
      );
      foot.scale.set(0.55, 1, 1);
      const x = POLE_X - 3 - k * 1.2 - i * 0.3 + (i % 2) * 0.35;
      const z = CUT_Z + 1.5 + i * 1.3 + rand() * 0.2;
      foot.position.set(x, heightAt(x, z) + 0.03, z);
      foot.userData.noOutline = true;
      prints.add(foot);
    }
  });
  cut.add(prints);
  scene.add(cut);

  // Prairie dogs popping in and out of their burrows by the trail.
  const dogs = buildPrairieDogs(new THREE.Vector2(trailX(115) + 18, 115));
  scene.add(dogs);
  animated.push(dogs);

  const herd = buildBisonHerd(new THREE.Vector2(-110, -90), 9);
  scene.add(herd);
  animated.push(herd);

  // Kanel walks with the player.
  const spawnZ = 170;
  const spawn = new THREE.Vector3(trailX(spawnZ), heightAt(trailX(spawnZ), spawnZ), spawnZ);
  const kanel = buildHorse();
  kanel.position.set(spawn.x + 3, heightAt(spawn.x + 3, spawn.z + 3), spawn.z + 3);
  scene.add(kanel);
  animated.push(kanel);

  addVegetation(scene, common, {
    density: opts.vegetationDensity,
    cacti: false,
    grassBoost: 1.1,
    keepOut: [
      { x: FORT_X, z: FORT_Z, r: Math.hypot(FORT_W, FORT_D) / 2 + 4 },
      { x: POLE_X, z: CUT_Z, r: 7 },
    ],
  });

  const moving: { x: number; z: number; r: number }[] = [];
  const at = (x: number, z: number) => new THREE.Vector3(x, heightAt(x, z), z);
  return {
    region: 'fortet',
    colliders,
    spots: {
      sergeant: fort.sergeant.position.clone(),
      ruth: fort.telegraphist.clone(),
      cut: at(POLE_X - 2, CUT_Z),
      parade: fort.parade.clone(),
      gate: fort.gate.clone(),
    },
    town: fort,
    sun: common.sun,
    spawn,
    kanel,
    herd,
    fort,
    setWireFixed: (fixed) => {
      cut.visible = !fixed;
    },
    setPlayerPosition: (p, heading) => {
      fort.sergeant.lookAtPlayer(p.distanceTo(fort.sergeant.position) < 9 ? p : null);
      fort.ruth.lookAtPlayer(p.distanceTo(fort.ruth.position) < 9 ? p : null);
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

/** A colony of prairie dogs that pop up, look around and dive back down. */
function buildPrairieDogs(center: THREE.Vector2): THREE.Group & Animated {
  const g = new THREE.Group() as THREE.Group & Animated;
  const rand = mulberry32(12);
  const dogs = Array.from({ length: 12 }, () => {
    const x = center.x + (rand() - 0.5) * 22;
    const z = center.y + (rand() - 0.5) * 16;
    const y = heightAt(x, z);
    const mound = part(
      new THREE.SphereGeometry(0.6, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      '#b08a5a',
      [x, y - 0.05, z],
    );
    mound.scale.y = 0.35;
    const hole = part(
      new THREE.CircleGeometry(0.18, 10),
      '#2a1a0c',
      [x, y + 0.17, z],
      [-Math.PI / 2, 0, 0],
    );
    hole.userData.noOutline = true;
    const sculpted = character('prairie-dog');
    const dog = new THREE.Group();
    if (sculpted) dog.add(sculpted);
    else {
      dog.add(part(new THREE.CapsuleGeometry(0.11, 0.22, 4, 8), '#c49a62', [0, 0.2, 0]));
      dog.add(part(new THREE.SphereGeometry(0.1, 8, 6), '#c49a62', [0, 0.44, -0.03]));
      for (const side of [-1, 1])
        dog.add(
          part(new THREE.SphereGeometry(0.018, 6, 4), '#1b1b1b', [side * 0.045, 0.47, -0.11]),
        );
      dog.add(
        part(new THREE.CapsuleGeometry(0.035, 0.08, 4, 4), '#e8d6b0', [0, 0.28, -0.1], [0.4, 0, 0]),
      );
      outline(dog, 0.012);
    }
    dog.position.set(x, y, z);
    g.add(outline(mound, 0.02), hole, dog);
    return { dog, y, phase: rand() * 10, speed: 0.4 + rand() * 0.5 };
  });
  g.update = (_dt, time) => {
    for (const d of dogs) {
      // Mostly peeking, sometimes fully out, sometimes hidden.
      const s = Math.sin(time * d.speed + d.phase);
      const out = THREE.MathUtils.smoothstep(s, -0.2, 0.5);
      d.dog.position.y = d.y - 0.55 + out * 0.6;
      d.dog.rotation.y = Math.sin(time * 1.3 + d.phase) * 0.8;
    }
  };
  return g;
}
