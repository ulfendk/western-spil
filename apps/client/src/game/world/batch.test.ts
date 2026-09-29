import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { outline, part } from '../toon.js';
import { batchStatic, chunkInstances, markStatic, mergeLocal } from './batch.js';

const meshes = (root: THREE.Object3D) => {
  let n = 0;
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) n++;
  });
  return n;
};

const triangles = (root: THREE.Object3D) => {
  let n = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position!.count) / 3;
  });
  return n;
};

/** A little house: four walls and a roof in two colours, with outlines. */
function house(x: number) {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) g.add(part(new THREE.BoxGeometry(1, 2, 0.1), '#c8553d', [i, 1, 0]));
  g.add(part(new THREE.ConeGeometry(1, 1, 4), '#5e3a1a', [0, 2.5, 0]));
  g.position.x = x;
  return outline(g, 0.02);
}

describe('batchStatic', () => {
  it('bakes static objects into one mesh per material and keeps every triangle', () => {
    const scene = new THREE.Scene();
    for (let i = 0; i < 5; i++) scene.add(markStatic(house(i * 3)));
    const before = triangles(scene);
    const { merged } = batchStatic(scene);
    expect(merged).toBe(50); // 5 houses × (5 parts + 5 outlines)
    // Wall colour, roof colour and the outline, all within one map chunk.
    expect(meshes(scene)).toBe(3);
    expect(triangles(scene)).toBe(before);
  });

  it('leaves hidden parts and unmarked objects alone', () => {
    const scene = new THREE.Scene();
    const h = house(0);
    const hidden = part(new THREE.BoxGeometry(1, 1, 1), '#ffffff', [0, 5, 0]);
    hidden.visible = false;
    h.add(hidden);
    scene.add(markStatic(h), house(20));
    batchStatic(scene);
    expect(hidden.parent).toBe(h);
    // The unmarked house keeps its 10 meshes; the marked one is 3 batches.
    expect(meshes(scene)).toBe(10 + 3 + 1);
  });

  it('keeps unbakeable children (a textured sign) where they were', () => {
    const scene = new THREE.Scene();
    const h = house(4);
    const wall = h.children[0] as THREE.Mesh;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshToonMaterial({ map: new THREE.Texture() }),
    );
    sign.position.set(0, 0.5, 0.1);
    wall.add(sign);
    scene.add(markStatic(h));
    scene.updateMatrixWorld(true);
    const at = sign.getWorldPosition(new THREE.Vector3());
    batchStatic(scene);
    expect(sign.parent).not.toBeNull();
    scene.updateMatrixWorld(true);
    expect(sign.getWorldPosition(new THREE.Vector3()).distanceTo(at)).toBeLessThan(1e-6);
  });

  it('keeps mirrored parts facing outwards', () => {
    const scene = new THREE.Scene();
    const g = new THREE.Group();
    const p = part(new THREE.PlaneGeometry(1, 1), '#ffffff', [0, 0, 0]);
    p.scale.x = -1;
    g.add(p);
    scene.add(markStatic(g));
    batchStatic(scene);
    const batch = scene.getObjectByName('static-batches')!.children[0] as THREE.Mesh;
    const pos = batch.geometry.attributes.position!;
    const a = new THREE.Vector3().fromBufferAttribute(pos, 0);
    const b = new THREE.Vector3().fromBufferAttribute(pos, 1);
    const c = new THREE.Vector3().fromBufferAttribute(pos, 2);
    // The plane faces +z; the triangle's winding must still say so.
    const n = b.sub(a).cross(c.sub(a));
    expect(n.z).toBeGreaterThan(0);
  });
});

describe('mergeLocal', () => {
  it('merges an assembly but keeps flagged moving parts separate and animatable', () => {
    const body = house(0);
    const leg = new THREE.Group();
    leg.add(part(new THREE.BoxGeometry(0.2, 1, 0.2), '#c8553d', [0, -0.5, 0]));
    leg.add(part(new THREE.BoxGeometry(0.3, 0.1, 0.3), '#5e3a1a', [0, -1, 0]));
    body.add(leg);
    outline(leg, 0.02);
    mergeLocal(leg).userData.moving = true;
    mergeLocal(body);
    // The leg is still its own group under the body, and can still swing.
    expect(leg.parent).toBe(body);
    expect(meshes(leg)).toBe(3);
    leg.rotation.x = 0.5;
    // Body: wall, roof and outline batches, plus the leg's 3.
    expect(meshes(body)).toBe(6);
  });

  it('keeps the root movable: merged parts follow the root', () => {
    const h = house(0);
    mergeLocal(h);
    h.position.set(10, 0, 0);
    h.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(h);
    expect(box.min.x).toBeGreaterThan(8);
  });
});

describe('chunkInstances', () => {
  it('splits instances into map chunks and hides far chunks', () => {
    const inst = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.1, 0.1, 0.1),
      new THREE.MeshBasicMaterial(),
      3,
    );
    const m = new THREE.Matrix4();
    inst.setMatrixAt(0, m.makeTranslation(1, 0, 1));
    inst.setMatrixAt(1, m.makeTranslation(2, 0, 2));
    inst.setMatrixAt(2, m.makeTranslation(300, 0, 300));
    const group = chunkInstances(inst, 100);
    expect(group.children).toHaveLength(2);
    (group.userData.cull as (p: THREE.Vector3) => void)(new THREE.Vector3(0, 0, 0));
    const visible = group.children.filter((c) => c.visible) as THREE.InstancedMesh[];
    expect(visible).toHaveLength(1);
    expect(visible[0]!.count).toBe(2);
  });
});
