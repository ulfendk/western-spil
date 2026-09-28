import * as THREE from 'three';
import type { RegionId } from '@western/shared';
import type { Herd, Horse } from './animals.js';
import type { Circle, Colliders } from './colliders.js';
import type { Fort } from './fort.js';
import type { Mood } from './sky.js';
import { buildFortet, FORTET_TERRAIN } from './regions/fortet.js';
import { buildLejren, LEJREN_TERRAIN } from './regions/lejren.js';
import { buildPraerien, PRAERIEN_TERRAIN } from './regions/praerien.js';
import { buildStLouis, ST_LOUIS_TERRAIN } from './regions/stLouis.js';
import { setTerrain } from './terrain.js';
import type { TownSpots } from './town.js';

export { heightAt, trailX, WORLD_HALF, riverWater, terrainProfile } from './terrain.js';
export { SUN_DIR, type Mood } from './sky.js';
export type { TownSpots, TownConfig } from './town.js';
export type { Herd, Horse } from './animals.js';
export type { Fort } from './fort.js';

/** The river crossing on the prairie: banks on each side of the trail. */
export interface RiverCrossing {
  east: THREE.Vector3;
  west: THREE.Vector3;
}

export interface World {
  region: RegionId;
  colliders: Colliders;
  /** Named places the story refers to (ground positions). */
  spots: Record<string, THREE.Vector3>;
  town: TownSpots;
  sun: THREE.DirectionalLight;
  spawn: THREE.Vector3;
  /** Moving obstacles (the train, bison) as circles, refreshed every frame. */
  dynamicColliders(): readonly Circle[];
  update(dt: number, time: number): void;
  /** Let NPCs turn towards the player, and Kanel follow them. */
  setPlayerPosition(p: THREE.Vector3, heading: number): void;
  /** Where Kanel is right now (he follows the player on the prairie). */
  kanelPosition(): THREE.Vector3;
  // Region-specific extras.
  setPosterVisible?(visible: boolean): void;
  setWheelFixed?(fixed: boolean): void;
  setWireFixed?(fixed: boolean): void;
  /** Weather / time of day. */
  setMood(mood: Mood): void;
  /** Where Wanbli is: meeting the player in the storm, or at home in the camp. */
  setWanbli?(where: 'storm' | 'camp'): void;
  fort?: Fort;
  herd?: Herd;
  kanel?: Horse;
  river?: RiverCrossing;
}

export interface WorldOptions {
  vegetationDensity: number;
}

/** Builds a region into the (empty) scene. The land's shape is switched first. */
export function buildWorld(scene: THREE.Scene, region: RegionId, opts: WorldOptions): World {
  if (region === 'lejren') {
    setTerrain(LEJREN_TERRAIN);
    return buildLejren(scene, opts);
  }
  if (region === 'fortet') {
    setTerrain(FORTET_TERRAIN);
    return buildFortet(scene, opts);
  }
  if (region === 'praerien') {
    setTerrain(PRAERIEN_TERRAIN);
    return buildPraerien(scene, opts);
  }
  setTerrain(ST_LOUIS_TERRAIN);
  return buildStLouis(scene, opts);
}
