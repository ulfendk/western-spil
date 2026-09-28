import * as THREE from 'three';
import { mulberry32 } from '../noise.js';
import { outline } from '../toon.js';

/** Direction the sun shines *from* (low in the west, afternoon light). */
export const SUN_DIR = new THREE.Vector3(-0.35, 0.42, -0.84).normalize();

export function buildSky(): THREE.Group {
  const group = new THREE.Group();
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { sunDir: { value: SUN_DIR } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 horizon = vec3(0.99, 0.82, 0.55);
        vec3 mid = vec3(0.50, 0.80, 0.88);
        vec3 top = vec3(0.17, 0.48, 0.80);
        vec3 col = mix(horizon, mid, smoothstep(-0.02, 0.22, h));
        col = mix(col, top, smoothstep(0.22, 0.85, h));
        // Posterise into printed-comic bands.
        col = floor(col * 12.0 + 0.5) / 12.0;
        float d = dot(normalize(vDir), sunDir);
        // Warm glow rings around the sun.
        col = mix(col, vec3(1.0, 0.88, 0.60), step(0.990, d) * 0.3);
        col = mix(col, vec3(1.0, 0.93, 0.72), step(0.9955, d) * 0.45);
        // Sun disk with an ink outline.
        col = mix(col, vec3(0.12, 0.08, 0.05), step(0.99865, d));
        col = mix(col, vec3(1.0, 0.97, 0.82), step(0.99888, d));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  group.add(new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), skyMat));

  // Flat-bottomed cumulus clouds with outlines.
  const rand = mulberry32(42);
  const cloudMat = new THREE.MeshToonMaterial({
    color: '#ffffff',
    emissive: '#9a948a',
    fog: false,
  });
  const shadeMat = new THREE.MeshToonMaterial({
    color: '#d9d4e8',
    emissive: '#6d6880',
    fog: false,
  });
  for (let i = 0; i < 18; i++) {
    const cloud = new THREE.Group();
    const puffs = 4 + Math.floor(rand() * 4);
    for (let j = 0; j < puffs; j++) {
      const r = 10 + rand() * 12;
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(r, 16, 10),
        j === 0 ? shadeMat : cloudMat,
      );
      puff.position.set((j - puffs / 2) * 13 + rand() * 6, r * 0.35 + rand() * 6, rand() * 10);
      puff.scale.y = 0.62;
      cloud.add(puff);
    }
    // Flatten the underside.
    const base = new THREE.Mesh(new THREE.CylinderGeometry(puffs * 7, puffs * 7, 2, 20), shadeMat);
    base.scale.z = 0.35;
    cloud.add(base);
    const angle = rand() * Math.PI * 2;
    const dist = 450 + rand() * 450;
    cloud.position.set(Math.cos(angle) * dist, 130 + rand() * 110, Math.sin(angle) * dist);
    cloud.lookAt(0, cloud.position.y, 0);
    group.add(outline(cloud, 0.5));
  }
  return group;
}
