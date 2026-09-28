import * as THREE from 'three';

/** 3-step gradient gives the flat, comic-book shading. */
const gradientMap = (() => {
  const data = new Uint8Array([90, 170, 255]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
})();

const cache = new Map<string, THREE.MeshToonMaterial>();

export function toon(color: THREE.ColorRepresentation, opts: { vertexColors?: boolean } = {}) {
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

/** Inverted-hull outline: backfaces pushed out along normals, drawn black. */
const outlineMaterial = new THREE.ShaderMaterial({
  uniforms: { thickness: { value: 0.035 } },
  side: THREE.BackSide,
  vertexShader: /* glsl */ `
    uniform float thickness;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      // Scale with distance a bit so far objects keep a visible line.
      float t = thickness * clamp(-mv.z * 0.04, 1.0, 4.0);
      vec3 n = normalize(normalMatrix * normal);
      mv.xyz += n * t;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    void main() { gl_FragColor = vec4(0.08, 0.06, 0.05, 1.0); }
  `,
});

/** Adds black comic outlines to every mesh in the object. */
export function outline<T extends THREE.Object3D>(obj: T): T {
  const meshes: THREE.Mesh[] = [];
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh && !o.userData.isOutline) meshes.push(o);
  });
  for (const mesh of meshes) {
    const hull = new THREE.Mesh(mesh.geometry, outlineMaterial);
    hull.userData.isOutline = true;
    hull.raycast = () => undefined;
    mesh.add(hull);
  }
  return obj;
}

export function mesh(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.Mesh {
  const m = new THREE.Mesh(geometry, toon(color));
  m.castShadow = false;
  return m;
}
