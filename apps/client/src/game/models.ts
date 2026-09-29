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

/**
 * A fresh copy of a character (geometry and materials are shared), or null.
 * `recolor` swaps the model's key colours (e.g. '#ff00ff' → the hat colour): used
 * for the player avatars. Recoloured geometry is cached per combination.
 */
export function character(name: string, recolor?: Record<string, string>): THREE.Object3D | null {
  const model = models.get(name);
  if (!model) return null;
  const copy = model.clone(true);
  if (recolor) {
    const key = JSON.stringify(recolor);
    copy.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry.userData.rgba)
        mesh.geometry = recolored(mesh.geometry, key, recolor);
    });
  }
  return copy;
}

const recolorCache = new Map<string, THREE.BufferGeometry>();

function recolored(
  geo: THREE.BufferGeometry,
  key: string,
  recolor: Record<string, string>,
): THREE.BufferGeometry {
  const id = `${geo.uuid}|${key}`;
  let out = recolorCache.get(id);
  if (!out) {
    // Key colours are pure primaries: exact 0/1 channels, whatever the colour space.
    const swaps = Object.entries(recolor).map(([from, to]) => ({
      from: new THREE.Color(from),
      to: new THREE.Color(to),
    }));
    out = geo.clone();
    out.setAttribute('color', bakeColors(geo.userData.rgba as THREE.BufferAttribute, swaps));
    recolorCache.set(id, out);
  }
  return out;
}

/** Colours with the occlusion baked in (and key colours swapped). */
function bakeColors(
  src: THREE.BufferAttribute,
  swaps: { from: THREE.Color; to: THREE.Color }[] = [],
): THREE.BufferAttribute {
  const n = src.count;
  const rgb = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let r = src.getX(i);
    let g = src.getY(i);
    let b = src.getZ(i);
    for (const s of swaps) {
      if (
        Math.abs(r - s.from.r) < 0.02 &&
        Math.abs(g - s.from.g) < 0.02 &&
        Math.abs(b - s.from.b) < 0.02
      ) {
        r = s.to.r;
        g = s.to.g;
        b = s.to.b;
        break;
      }
    }
    const ao = src.itemSize === 4 ? src.getW(i) : 1;
    const f = 1 - (1 - ao) * AO_MIX;
    rgb[i * 3] = r * f;
    rgb[i * 3 + 1] = g * f;
    rgb[i * 3 + 2] = b * f;
  }
  return new THREE.BufferAttribute(rgb, 3);
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
      // Keep the original (colour + occlusion) for recolouring avatars later.
      geo.userData.rgba = src;
      geo.setAttribute('color', bakeColors(src));
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
