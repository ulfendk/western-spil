import * as THREE from 'three';
import { buildHorse } from '../animals.js';
import { addVegetation, buildCommon, place, streetKeepOut } from '../common.js';
import type { World, WorldOptions } from '../index.js';
import { buildMountains } from '../landscape.js';
import { buildMiner, buildPerson, buildPind, buildSoldier, type Npc } from '../npc.js';
import { buildBoevl, buildCattleCar, buildForeman, buildLocomotive } from '../promontory.js';
import { mulberry32 } from '../../noise.js';
import { outline, part } from '../../toon.js';
import { heightAt, RAIL_X, railHeight, trailX, type TerrainProfile } from '../terrain.js';
import { buildTown, type TownConfig } from '../town.js';

const trail = (z: number) => Math.sin(z * 0.008 + 3) * 20 + Math.sin(z * 0.025) * 6;
const CEREMONY_Z = 0;

export const PROMONTORY_TOWN: TownConfig = {
  name: 'PROMONTORY',
  zStart: 70,
  zEnd: 140,
  arch: 'end',
  west: [
    ['SALOON', 80, 2],
    ['TELEGRAF', 94, 1],
    ['HOTEL', 128, 2],
  ],
  east: [
    ['BUTIK', 78, 1],
    ['SPISESTED', 92, 1],
    ['STALD', 120, 1],
  ],
  squareZ: 110,
  waterTowerZ: 125,
  seed: 1869,
};

/** Chapter 6: the Utah desert where the two railways meet at Promontory Summit. */
export const PROMONTORY_TERRAIN: TerrainProfile = {
  hills: 14,
  seed: 61,
  trail,
  palette: 'desert',
  flatZones: [
    { z0: PROMONTORY_TOWN.zStart, z1: PROMONTORY_TOWN.zEnd },
    { z0: CEREMONY_Z - 30, z1: CEREMONY_Z + 45, x: RAIL_X - 6, halfWidth: 18 },
  ],
};

export function buildPromontory(scene: THREE.Scene, opts: WorldOptions): World {
  // No passing train here: the two locomotives stand still for the ceremony.
  const common = buildCommon(scene, { train: false });
  const { colliders, animated } = common;
  scene.add(buildMountains());
  const rand = mulberry32(69);

  // The Great Salt Lake glinting to the south-west.
  const lake = new THREE.Mesh(
    new THREE.CircleGeometry(260, 48),
    new THREE.MeshToonMaterial({ color: '#cfe3e8' }),
  );
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(-260, -2.5, -300);
  scene.add(lake);

  const town = buildTown(scene, colliders, PROMONTORY_TOWN);

  // The two locomotives, nose to nose on the last stretch of track.
  const railY = (z: number) => railHeight(z) + 0.2;
  const jupiter = buildLocomotive({
    boiler: '#2e4a78',
    cab: '#b8322a',
    trim: '#d9a83a',
    wheels: '#b8322a',
    name: 'JUPITER',
  });
  jupiter.position.set(RAIL_X, railY(CEREMONY_Z - 9), CEREMONY_Z - 9);
  jupiter.rotation.y = Math.PI;
  const no119 = buildLocomotive({
    boiler: '#2a2a2a',
    cab: '#8a2a22',
    trim: '#c8c8c8',
    wheels: '#8a2a22',
    name: 'No. 119',
  });
  no119.position.set(RAIL_X, railY(CEREMONY_Z + 9), CEREMONY_Z + 9);
  scene.add(jupiter, no119);
  for (const z of [CEREMONY_Z - 9, CEREMONY_Z + 9]) colliders.addBox(RAIL_X, z, 2.8, 8, 0);

  // The last sleeper, of polished laurel wood, and the golden nail (after the ceremony).
  const tie = part(new THREE.BoxGeometry(2.6, 0.18, 0.3), '#5a2a1a', [
    RAIL_X,
    railY(CEREMONY_Z) - 0.05,
    CEREMONY_Z,
  ]);
  scene.add(outline(tie, 0.02));
  const nail = new THREE.Group();
  nail.add(part(new THREE.CylinderGeometry(0.04, 0.02, 0.35, 8), '#e8c24a', [0, 0, 0]));
  nail.add(part(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 10), '#e8c24a', [0, 0.18, 0]));
  nail.position.set(RAIL_X + 0.4, railY(CEREMONY_Z) + 0.12, CEREMONY_Z);
  nail.visible = false;
  scene.add(outline(nail, 0.01));

  // The crowd, Postmester Pind and Ruth with her telegraph table.
  const people: Npc[] = [];
  const addPerson = (npc: Npc, x: number, z: number, faceX: number) => {
    place(npc, x, z, Math.atan2(-(faceX - x), 0));
    scene.add(npc);
    animated.push(npc);
    colliders.add(x, z, 0.45);
    people.push(npc);
    return npc;
  };
  for (let i = 0; i < 5; i++) {
    const z = CEREMONY_Z - 5 + i * 2.4;
    addPerson(i % 2 ? buildSoldier() : buildMiner(), RAIL_X + 6 + (i % 2) * 1.2, z, RAIL_X);
    addPerson(
      buildPerson({
        scale: 1,
        dress: ['#6b3a5a', '#3d6b8a', '#2f6b4a', '#8a5a2b', '#5a4a78'][i]!,
        apron: '#f3ecdc',
        hair: '#5e3a1a',
        bonnet: i % 2 ? '#e8d6b0' : undefined,
      }),
      RAIL_X - 7.5 - (i % 2) * 1.2,
      z + 1,
      RAIL_X,
    );
  }
  const pind = addPerson(buildPind(), RAIL_X - 4.5, CEREMONY_Z + 3, RAIL_X);
  const ruth = addPerson(
    buildPerson({ scale: 1, dress: '#6b3a5a', apron: '#f3ecdc', hair: '#5e3a1a' }),
    RAIL_X - 4.5,
    CEREMONY_Z - 4,
    RAIL_X,
  );
  scene.add(
    part(new THREE.BoxGeometry(1, 0.8, 0.6), '#7a5230', [
      RAIL_X - 3.6,
      heightAt(RAIL_X - 3.6, CEREMONY_Z - 4.2) + 0.4,
      CEREMONY_Z - 4.2,
    ]),
  );

  // Formand Li and his crew at the end of the Central Pacific track.
  const workZ = CEREMONY_Z - 30;
  const li = addPerson(buildForeman(), RAIL_X - 4, workZ, RAIL_X);
  for (let i = 0; i < 3; i++) addPerson(buildForeman(), RAIL_X + 3, workZ - 3 + i * 2.5, RAIL_X);
  for (let i = 0; i < 6; i++) {
    const stack = part(new THREE.BoxGeometry(2.6, 0.16, 0.28), '#5e4128', [
      RAIL_X - 8,
      heightAt(RAIL_X - 8, workZ + 4) + 0.1 + i * 0.17,
      workZ + 4,
    ]);
    scene.add(stack);
  }
  colliders.add(RAIL_X - 8, workZ + 4, 1.5);

  // The Bøvl brothers: hidden until the ceremony, then caught and put in a cattle car.
  const brothers = [0.82, 1, 1.15, 1.35].map((size, i) => {
    const b = buildBoevl(size, ['#6b4a2e', '#4a3a2a', '#5a2a1a', '#3a3a3a'][i]!);
    b.visible = false;
    scene.add(b);
    animated.push(b);
    return b;
  });
  const car = buildCattleCar();
  const carX = RAIL_X + 9;
  const carZ = CEREMONY_Z + 22;
  car.position.set(carX, heightAt(carX, carZ), carZ);
  scene.add(car);
  colliders.addBox(carX, carZ, 2.8, 7.5, 0);

  // Kanel walks with the player.
  const spawnZ = 172;
  const spawn = new THREE.Vector3(trailX(spawnZ), heightAt(trailX(spawnZ), spawnZ), spawnZ);
  const kanel = buildHorse();
  kanel.position.set(spawn.x + 3, heightAt(spawn.x + 3, spawn.z + 3), spawn.z + 3);
  scene.add(kanel);
  animated.push(kanel);
  let kanelFollows = true;

  addVegetation(scene, common, {
    density: opts.vegetationDensity * 0.35,
    cacti: false,
    keepOut: [
      ...streetKeepOut(PROMONTORY_TOWN.zStart, PROMONTORY_TOWN.zEnd, trailX),
      { x: RAIL_X, z: CEREMONY_Z, r: 20 },
      { x: RAIL_X, z: workZ, r: 12 },
    ],
  });
  void rand;

  const at = (x: number, z: number) => new THREE.Vector3(x, heightAt(x, z), z);
  const sunsetZ = -80;
  const moving: { x: number; z: number; r: number }[] = [];
  return {
    region: 'promontory',
    colliders,
    spots: {
      li: li.position.clone(),
      ceremony: at(RAIL_X - 2.5, CEREMONY_Z + 1),
      pind: pind.position.clone(),
      ruth: ruth.position.clone(),
      tie: at(RAIL_X, CEREMONY_Z),
      sunset: at(trailX(sunsetZ), sunsetZ),
      get kanelNow() {
        return kanel.position.clone();
      },
    } as Record<string, THREE.Vector3>,
    town,
    sun: common.sun,
    spawn,
    kanel,
    setKanelFollow: (on) => (kanelFollows = on),
    setBrothers: (where) => {
      brothers.forEach((b, i) => {
        b.visible = where !== 'hidden';
        if (where === 'ceremony') {
          b.position.set(
            RAIL_X + 3 + i * 1.3,
            heightAt(RAIL_X + 3 + i * 1.3, CEREMONY_Z + 4),
            CEREMONY_Z + 4,
          );
          b.rotation.y = Math.PI * 0.8;
        } else if (where === 'caught') {
          b.position.set(carX + (i % 2 ? 0.5 : -0.5), car.position.y + 1.05, carZ - 2.4 + i * 1.5);
          b.rotation.y = -Math.PI / 2;
        }
      });
    },
    setNail: (visible) => (nail.visible = visible),
    setPlayerPosition: (p, heading) => {
      common.setPlayer(p);
      for (const person of people)
        person.lookAtPlayer(p.distanceTo(person.position) < 8 ? p : null);
      for (const b of brothers)
        b.lookAtPlayer(b.visible && p.distanceTo(b.position) < 12 ? p : null);
      kanel.follow(kanelFollows ? p : null, heading);
    },
    kanelPosition: () => kanel.position,
    dynamicColliders: () => moving,
    update: common.update,
    setMood: common.setMood,
  };
}
