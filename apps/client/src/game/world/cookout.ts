import * as THREE from 'three';
import { buildCampfire } from './camp.js';
import type { Colliders } from './colliders.js';
import { outline, part } from '../toon.js';
import { heightAt, inWater } from './terrain.js';

export interface Cookout {
  /** Where to stand to cook (in front of the fire pit). */
  at: THREE.Vector3;
  setLit(on: boolean): void;
}

/**
 * A cooking spot: an unlit fire pit with a skillet on a flat stone, a can of beans,
 * a basket of eggs and a stump to sit on. The breakfast minigame lights it.
 */
export function buildCookout(
  parent: THREE.Object3D,
  animated: { update(dt: number, time: number): void }[],
  colliders: Colliders,
  x: number,
  z: number,
): Cookout {
  const g = new THREE.Group();
  g.position.set(x, heightAt(x, z), z);
  parent.add(g);
  const fire = buildCampfire();
  fire.setLit(false);
  g.add(fire);
  animated.push(fire);
  // The cooking gear beside the fire.
  const gear = new THREE.Group();
  gear.add(
    part(new THREE.CylinderGeometry(0.35, 0.4, 0.3, 10), '#8d8a86', [1.2, 0.15, 0.3], [0, 0, 0], {
      flatShading: true,
    }),
  );
  gear.add(part(new THREE.CylinderGeometry(0.3, 0.26, 0.07, 18), '#2a2a2a', [1.2, 0.34, 0.3]));
  gear.add(part(new THREE.BoxGeometry(0.45, 0.03, 0.06), '#2a2a2a', [1.55, 0.36, 0.3]));
  gear.add(part(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 12), '#b8bcc2', [0.9, 0.08, -0.3]));
  gear.add(part(new THREE.CylinderGeometry(0.071, 0.071, 0.08, 12), '#c8553d', [0.9, 0.08, -0.3]));
  gear.add(part(new THREE.CylinderGeometry(0.2, 0.16, 0.14, 12), '#a8824a', [0.6, 0.07, -0.75]));
  for (const [ex, ez] of [
    [0.56, -0.72],
    [0.64, -0.78],
    [0.6, -0.68],
  ] as const) {
    const egg = part(new THREE.SphereGeometry(0.045, 10, 8), '#f3ecdc', [ex, 0.16, ez]);
    egg.scale.y = 1.3;
    gear.add(egg);
  }
  gear.add(part(new THREE.CylinderGeometry(0.28, 0.32, 0.45, 12), '#7a5230', [-1.4, 0.22, 0.2]));
  g.add(outline(gear, 0.015));
  // A trampled patch of dirt round the pit.
  const dirt = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 24),
    new THREE.MeshToonMaterial({ color: '#a8845a' }),
  );
  dirt.rotation.x = -Math.PI / 2;
  dirt.position.set(0.2, 0.04, 0.4);
  dirt.receiveShadow = true;
  g.add(dirt);
  colliders.add(x, z, 1.0);
  colliders.add(x - 1.4, z + 0.2, 0.35);
  const at = new THREE.Vector3(x, 0, z + 2.2);
  at.y = heightAt(at.x, at.z);
  return { at, setLit: (on) => fire.setLit(on) };
}

/**
 * Finds a free spot for the cookout near `near` (trying a ring of places around it,
 * west of the trail first), so it never lands in a building, fence or rock.
 */
export function freeSpot(colliders: Colliders, near: THREE.Vector3): THREE.Vector2 {
  for (const r of [9, 12, 15, 19]) {
    for (let i = 0; i < 16; i++) {
      const a = Math.PI + (i % 2 ? 1 : -1) * Math.floor((i + 1) / 2) * (Math.PI / 8);
      const x = near.x + Math.cos(a) * r;
      const z = near.z + Math.sin(a) * r;
      // Clear if nothing pushes a 2.4 m circle around (fire pit, gear and the cook).
      const probe = { x, z };
      colliders.resolve(probe, 2.4);
      if (Math.hypot(probe.x - x, probe.z - z) < 0.01 && !inWater(x, z, 4))
        return new THREE.Vector2(x, z);
    }
  }
  return new THREE.Vector2(near.x - 9, near.z);
}

/** Hides grass and flowers within `r` of (x, z), so a spot isn't buried in tall grass. */
export function clearGrass(scene: THREE.Object3D, x: number, z: number, r: number) {
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  scene.traverse((o) => {
    const inst = o as THREE.InstancedMesh;
    // Grass and flowers are the see-through instanced layers (render order 5 and 6).
    if (!inst.isInstancedMesh || (inst.renderOrder !== 5 && inst.renderOrder !== 6)) return;
    let changed = false;
    for (let i = 0; i < inst.count; i++) {
      inst.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      if (Math.hypot(p.x - x, p.z - z) < r) {
        inst.setMatrixAt(i, hidden);
        changed = true;
      }
    }
    if (changed) inst.instanceMatrix.needsUpdate = true;
  });
}
