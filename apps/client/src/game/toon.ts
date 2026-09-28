import * as THREE from 'three';

/** 3-step gradient gives the flat, comic-book shading. */
export const gradientMap = (() => {
  const data = new Uint8Array([80, 165, 255]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
})();

export interface ToonOptions {
  vertexColors?: boolean;
  /** Faceted look (per-face normals); toon materials have no flatShading flag. */
  flatShading?: boolean;
}

/** Splits shared vertices so every face gets its own normal: a crisp faceted look. */
export function faceted(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!geo.index) {
    geo.computeVertexNormals();
    return geo;
  }
  // Keep the smooth, indexed original for the outline hull (a faceted hull would crack).
  geo.computeVertexNormals();
  const flat = geo.toNonIndexed();
  flat.computeVertexNormals();
  flat.userData.smooth = geo;
  return flat;
}

const cache = new Map<string, THREE.MeshToonMaterial>();

/** Shared toon materials, cached by color and options. */
export function toon(color: THREE.ColorRepresentation, opts: ToonOptions = {}) {
  const key = `${new THREE.Color(color).getHexString()}|${opts.vertexColors ?? false}`;
  let mat = cache.get(key);
  if (!mat) {
    mat = new THREE.MeshToonMaterial({
      color,
      gradientMap,
      vertexColors: opts.vertexColors ?? false,
    });
    cache.set(key, mat);
  }
  return mat;
}

const outlineMaterials = new Map<number, THREE.ShaderMaterial>();

/** Inverted-hull outline: backfaces pushed out along normals, drawn in ink (fades with fog). */
function outlineMaterial(thickness: number): THREE.ShaderMaterial {
  let mat = outlineMaterials.get(thickness);
  if (!mat) {
    mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { thickness: { value: thickness } },
      ]),
      side: THREE.BackSide,
      fog: true,
      vertexShader: /* glsl */ `
        #include <common>
        #include <fog_pars_vertex>
        uniform float thickness;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          // Grow slightly with distance so far objects keep a visible line.
          float t = thickness * clamp(-mvPosition.z * 0.04, 1.0, 3.0);
          vec3 n = normalize(normalMatrix * normal);
          mvPosition.xyz += n * t;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <fog_pars_fragment>
        void main() {
          gl_FragColor = vec4(0.09, 0.06, 0.05, 1.0);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
    });
    outlineMaterials.set(thickness, mat);
  }
  return mat;
}

/** Adds black comic outlines to every mesh in the object. */
export function outline<T extends THREE.Object3D>(obj: T, thickness = 0.03): T {
  const meshes: THREE.Mesh[] = [];
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh && !o.userData.isOutline && !o.userData.noOutline) meshes.push(o);
  });
  const mat = outlineMaterial(thickness);
  for (const m of meshes) {
    const geo = (m.geometry.userData.smooth as THREE.BufferGeometry | undefined) ?? m.geometry;
    const hull = new THREE.Mesh(geo, mat);
    hull.userData.isOutline = true;
    hull.raycast = () => undefined;
    m.add(hull);
  }
  return obj;
}

/** A toon-shaded mesh that casts and receives shadows. */
export function mesh(
  geometry: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  opts: ToonOptions = {},
): THREE.Mesh {
  const m = new THREE.Mesh(opts.flatShading ? faceted(geometry) : geometry, toon(color, opts));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Shorthand: create a mesh and position/rotate it in one go. */
export function part(
  geometry: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
  opts: ToonOptions = {},
): THREE.Mesh {
  const m = mesh(geometry, color, opts);
  m.position.set(...position);
  m.rotation.set(...rotation);
  return m;
}
