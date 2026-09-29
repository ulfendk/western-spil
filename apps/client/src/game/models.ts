import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { outline, toon } from './toon.js';

/**
 * The sculpted people from tools/models (see its README): loaded once at start,
 * then cloned whenever a region needs one. If loading fails (offline on a first
 * visit, an old browser), `character()` returns null and the builders fall back
 * to the simple primitive figures.
 */

/** How strongly the baked ambient occlusion (vertex alpha) darkens the colours. */
const AO_MIX = 0.55;
/** Beyond this distance a part switches to its low-detail mesh. */
const LOD_DISTANCE = 14;

const models = new Map<string, THREE.Object3D>();

interface Manifest {
  [name: string]: { file: string; tris: number };
}

export async function loadModels(timeoutMs = 8000): Promise<void> {
  const load = async () => {
    const base = `${import.meta.env.BASE_URL}models/`;
    const manifest = (await (await fetch(`${base}manifest.json`)).json()) as Manifest;
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    await Promise.all(
      Object.entries(manifest).map(async ([name, entry]) => {
        const gltf = await loader.loadAsync(`${base}${entry.file}`);
        models.set(name, prepare(gltf.scene));
      }),
    );
  };
  try {
    await Promise.race([
      load(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
  } catch (err) {
    console.warn('[models] using simple figures:', (err as Error).message);
    models.clear();
  }
}

/** A fresh copy of a character (geometry and materials are shared), or null. */
export function character(name: string): THREE.Object3D | null {
  const model = models.get(name);
  return model ? model.clone(true) : null;
}

/**
 * Bake the occlusion into the colours, swap in the game's toon materials and ink
 * outlines, and turn each part's _lod0/_lod1 pair into a THREE.LOD.
 */
function prepare(root: THREE.Object3D): THREE.Object3D {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  for (const mesh of meshes) {
    const geo = mesh.geometry;
    const src = geo.getAttribute('color') as THREE.BufferAttribute | undefined;
    if (src) {
      const n = src.count;
      const rgb = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const ao = src.itemSize === 4 ? src.getW(i) : 1;
        const f = 1 - (1 - ao) * AO_MIX;
        rgb[i * 3] = src.getX(i) * f;
        rgb[i * 3 + 1] = src.getY(i) * f;
        rgb[i * 3 + 2] = src.getZ(i) * f;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
    }
    mesh.material = toon('#ffffff', { vertexColors: true });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  // Parts: a node named after the part holding <part>_lod0 and <part>_lod1.
  const parents = new Set(meshes.map((m) => m.parent!).filter(Boolean));
  for (const node of parents) {
    const near = node.children.find((c) => c.name.endsWith('_lod0')) as THREE.Mesh | undefined;
    const far = node.children.find((c) => c.name.endsWith('_lod1')) as THREE.Mesh | undefined;
    if (!near || !far) continue;
    const lod = new THREE.LOD();
    lod.name = `${node.name}_lod`;
    // Faces get a fine ink line (a thick one pokes through round the nose and lips).
    const face = node.name === 'head' || node.name === 'beard';
    outline(near, face ? 0.004 : 0.012);
    outline(far, face ? 0.008 : 0.02);
    lod.addLevel(near, 0);
    lod.addLevel(far, LOD_DISTANCE);
    node.remove(near, far);
    node.add(lod);
  }
  return root;
}
