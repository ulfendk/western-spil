import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Size of the map chunks static meshes are batched into (keeps frustum culling useful). */
const CHUNK = 64;

/**
 * Mark an object whose parts never move, change or hide after the world is built.
 * `batchStatic` later bakes it into shared per-material meshes: hundreds of draw
 * calls become a handful. Moving or hiding the object afterwards has no effect.
 */
export function markStatic<T extends THREE.Object3D>(obj: T): T {
  obj.userData.static = true;
  return obj;
}

/** Only plain toon and outline-hull meshes are safe to bake. */
function bakeable(mesh: THREE.Mesh): boolean {
  if ((mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) {
    return false;
  }
  const m = mesh.material;
  if (Array.isArray(m) || !mesh.visible) return false;
  if ((m as THREE.MeshToonMaterial).isMeshToonMaterial) return !(m as THREE.MeshToonMaterial).map;
  // The inverted-hull outline material (a ShaderMaterial drawn on back faces).
  return (
    (m as THREE.ShaderMaterial).isShaderMaterial &&
    m.side === THREE.BackSide &&
    'thickness' in (m as THREE.ShaderMaterial).uniforms
  );
}

/**
 * Bakes every mesh under objects marked with `markStatic` into one mesh per
 * material, shadow setting and map chunk. Returns how many meshes were merged.
 */
export function batchStatic(scene: THREE.Scene): { merged: number; batches: number } {
  scene.updateMatrixWorld(true);
  const groups = new Map<
    string,
    { material: THREE.Material; cast: boolean; receive: boolean; geos: THREE.BufferGeometry[] }
  >();
  const baked: THREE.Mesh[] = [];

  const roots: THREE.Object3D[] = [];
  scene.traverse((o) => {
    if (o.userData.static) roots.push(o);
  });
  for (const root of roots) {
    // Hidden roots (or ones inside a hidden parent) are toggled later: leave them alone.
    let shown = true;
    for (let p: THREE.Object3D | null = root; p; p = p.parent) if (!p.visible) shown = false;
    if (!shown) continue;
    const box = new THREE.Vector3().setFromMatrixPosition(root.matrixWorld);
    const chunk = `${Math.floor(box.x / CHUNK)},${Math.floor(box.z / CHUNK)}`;
    // Hidden parts (shown later) and flagged moving parts stay as they are.
    root.traverseVisible((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !bakeable(mesh) || mesh.userData.baked || underMoving(mesh, root)) return;
      const geo = prepare(mesh, mesh.matrixWorld);
      const material = mesh.material as THREE.Material;
      const key = `${material.uuid}|${mesh.castShadow}|${mesh.receiveShadow}|${chunk}`;
      let g = groups.get(key);
      if (!g)
        groups.set(
          key,
          (g = { material, cast: mesh.castShadow, receive: mesh.receiveShadow, geos: [] }),
        );
      g.geos.push(geo);
      mesh.userData.baked = true;
      baked.push(mesh);
    });
  }

  const holder = new THREE.Group();
  holder.name = 'static-batches';
  for (const g of groups.values()) {
    const merged = mergeGeometries(g.geos, false);
    for (const geo of g.geos) geo.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, g.material);
    mesh.castShadow = g.cast;
    mesh.receiveShadow = g.receive;
    mesh.matrixAutoUpdate = false;
    holder.add(mesh);
  }
  // Children first, so anything re-attached keeps bubbling up to a surviving parent.
  for (const mesh of baked.reverse()) {
    // Keep anything that wasn't baked (a textured sign on a wall) where it was.
    for (const child of [...mesh.children]) {
      if (!child.userData.baked && mesh.parent) mesh.parent.attach(child);
    }
    mesh.removeFromParent();
  }
  scene.add(holder);
  return { merged: baked.length, batches: holder.children.length };
}

function flipWinding(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const attr of Object.values(geo.attributes) as THREE.BufferAttribute[]) {
    const a = attr.array;
    const s = attr.itemSize;
    for (let i = 0; i < attr.count; i += 3) {
      // Swap the 2nd and 3rd vertex of every triangle.
      for (let k = 0; k < s; k++) {
        const t = a[(i + 1) * s + k]!;
        a[(i + 1) * s + k] = a[(i + 2) * s + k]!;
        a[(i + 2) * s + k] = t;
      }
    }
  }
  return geo;
}

/**
 * Merges a moving assembly (a train car, a person's body) into one mesh per
 * material in its own space, so the root can still move, turn and hide.
 * Parts that animate on their own must be flagged `userData.moving = true`
 * (they and everything under them are kept as they are).
 */
export function mergeLocal<T extends THREE.Object3D>(root: T): T {
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert();
  const groups = new Map<
    string,
    { material: THREE.Material; cast: boolean; receive: boolean; geos: THREE.BufferGeometry[] }
  >();
  const baked: THREE.Mesh[] = [];
  const visit = (o: THREE.Object3D) => {
    if (o !== root && (o.userData.moving || !o.visible)) return;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && bakeable(mesh)) {
      const geo = prepare(mesh, new THREE.Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld));
      const material = mesh.material as THREE.Material;
      const key = `${material.uuid}|${mesh.castShadow}|${mesh.receiveShadow}`;
      let g = groups.get(key);
      if (!g)
        groups.set(
          key,
          (g = { material, cast: mesh.castShadow, receive: mesh.receiveShadow, geos: [] }),
        );
      g.geos.push(geo);
      mesh.userData.baked = true;
      baked.push(mesh);
    }
    for (const c of o.children) visit(c);
  };
  visit(root);
  if (baked.length < 3) {
    for (const m of baked) m.userData.baked = false;
    return root;
  }
  for (const mesh of baked.reverse()) {
    for (const child of [...mesh.children]) {
      if (!child.userData.baked && mesh.parent) mesh.parent.attach(child);
    }
    mesh.removeFromParent();
  }
  for (const g of groups.values()) {
    const merged = mergeGeometries(g.geos, false);
    for (const geo of g.geos) geo.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, g.material);
    mesh.castShadow = g.cast;
    mesh.receiveShadow = g.receive;
    root.add(mesh);
  }
  return root;
}

/** A copy of the mesh's geometry in the target space, with only the attributes its material reads. */
function prepare(mesh: THREE.Mesh, matrix: THREE.Matrix4): THREE.BufferGeometry {
  let geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  const vc = (mesh.material as THREE.MeshToonMaterial).vertexColors;
  for (const name of Object.keys(geo.attributes)) {
    if (name !== 'position' && name !== 'normal' && !(vc && name === 'color'))
      geo.deleteAttribute(name);
  }
  if (!geo.attributes.normal) geo.computeVertexNormals();
  geo.morphAttributes = {};
  geo.clearGroups();
  geo.applyMatrix4(matrix);
  // A mirrored transform flips the winding; flip it back so faces stay front-facing.
  if (matrix.determinant() < 0) geo = flipWinding(geo);
  return geo;
}

function underMoving(obj: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = obj; p && p !== root; p = p.parent)
    if (p.userData.moving) return true;
  return false;
}

/** Size of an instance chunk (grass, flowers, bushes). */
const INSTANCE_CHUNK = 48;

/**
 * Splits one map-wide InstancedMesh into a mesh per chunk, so the chunks outside
 * the view are skipped. With `maxDistance`, chunks further from the player than
 * that are hidden too (via the `userData.cull` hook that `buildWorld` calls).
 */
export function chunkInstances(inst: THREE.InstancedMesh, maxDistance?: number): THREE.Group {
  const group = new THREE.Group();
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < inst.count; i++) {
    inst.getMatrixAt(i, m);
    p.setFromMatrixPosition(m);
    const key = `${Math.floor(p.x / INSTANCE_CHUNK)},${Math.floor(p.z / INSTANCE_CHUNK)}`;
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    list.push(i);
  }
  const chunks: { mesh: THREE.InstancedMesh; center: THREE.Vector3 }[] = [];
  for (const list of buckets.values()) {
    const chunk = new THREE.InstancedMesh(inst.geometry, inst.material, list.length);
    list.forEach((src, i) => {
      inst.getMatrixAt(src, m);
      chunk.setMatrixAt(i, m);
      if (inst.instanceColor) {
        inst.getColorAt(src, c);
        chunk.setColorAt(i, c);
      }
    });
    chunk.castShadow = inst.castShadow;
    chunk.receiveShadow = inst.receiveShadow;
    chunk.renderOrder = inst.renderOrder;
    chunk.computeBoundingSphere();
    group.add(chunk);
    chunks.push({ mesh: chunk, center: chunk.boundingSphere!.center.clone() });
  }
  inst.dispose();
  if (maxDistance !== undefined) {
    const reach = maxDistance + INSTANCE_CHUNK * 0.71;
    group.userData.cull = (player: THREE.Vector3) => {
      for (const ch of chunks) {
        ch.mesh.visible = Math.hypot(ch.center.x - player.x, ch.center.z - player.z) < reach;
      }
    };
  }
  return group;
}
