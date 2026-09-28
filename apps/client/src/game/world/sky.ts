import * as THREE from 'three';
import { mulberry32 } from '../noise.js';
import { outline } from '../toon.js';

/** Direction the sun shines *from* (low in the west, afternoon light). */
export const SUN_DIR = new THREE.Vector3(-0.35, 0.42, -0.84).normalize();

/** Weather and time of day. */
export type Mood = 'day' | 'storm' | 'night' | 'sunset';

interface SkyColors {
  horizon: THREE.Color;
  mid: THREE.Color;
  top: THREE.Color;
  sun: number;
  stars: boolean;
  cloud: THREE.Color;
  cloudShade: THREE.Color;
}

export const SKY_MOODS: Record<Mood, SkyColors> = {
  day: {
    horizon: new THREE.Color(0.99, 0.82, 0.55),
    mid: new THREE.Color(0.5, 0.8, 0.88),
    top: new THREE.Color(0.17, 0.48, 0.8),
    sun: 1,
    stars: false,
    cloud: new THREE.Color('#9a948a'),
    cloudShade: new THREE.Color('#6d6880'),
  },
  storm: {
    horizon: new THREE.Color(0.42, 0.44, 0.48),
    mid: new THREE.Color(0.3, 0.33, 0.4),
    top: new THREE.Color(0.18, 0.2, 0.27),
    sun: 0,
    stars: false,
    cloud: new THREE.Color('#2a2c33'),
    cloudShade: new THREE.Color('#1c1d22'),
  },
  sunset: {
    horizon: new THREE.Color(1.0, 0.5, 0.25),
    mid: new THREE.Color(0.85, 0.42, 0.4),
    top: new THREE.Color(0.3, 0.24, 0.5),
    sun: 1,
    stars: false,
    cloud: new THREE.Color('#b0604a'),
    cloudShade: new THREE.Color('#6a3a4a'),
  },
  night: {
    horizon: new THREE.Color(0.16, 0.2, 0.36),
    mid: new THREE.Color(0.07, 0.1, 0.24),
    top: new THREE.Color(0.02, 0.03, 0.1),
    sun: 0,
    stars: true,
    cloud: new THREE.Color('#1a1d2c'),
    cloudShade: new THREE.Color('#12141f'),
  },
};

export interface Sky {
  group: THREE.Group;
  setMood(mood: Mood): void;
  /** Briefly brighten the sky (lightning). */
  flash(amount: number): void;
}

export function buildSky(): Sky {
  const group = new THREE.Group();
  const uniforms = {
    sunDir: { value: SUN_DIR },
    horizon: { value: SKY_MOODS.day.horizon.clone() },
    mid: { value: SKY_MOODS.day.mid.clone() },
    top: { value: SKY_MOODS.day.top.clone() },
    sunAmount: { value: 1 },
    flash: { value: 0 },
  };
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir;
      uniform vec3 horizon;
      uniform vec3 mid;
      uniform vec3 top;
      uniform float sunAmount;
      uniform float flash;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        // Printed-comic bands: step the gradient itself (stepping each colour channel
        // separately shifts the hue of dark night and storm skies).
        float a = floor(smoothstep(-0.02, 0.22, h) * 5.0 + 0.5) / 5.0;
        float b = floor(smoothstep(0.22, 0.85, h) * 7.0 + 0.5) / 7.0;
        vec3 col = mix(mix(horizon, mid, a), top, b);
        float d = dot(normalize(vDir), sunDir);
        // Warm glow rings around the sun, and the sun disk with an ink outline.
        col = mix(col, vec3(1.0, 0.88, 0.60), step(0.990, d) * 0.3 * sunAmount);
        col = mix(col, vec3(1.0, 0.93, 0.72), step(0.9955, d) * 0.45 * sunAmount);
        col = mix(col, vec3(0.12, 0.08, 0.05), step(0.99865, d) * sunAmount);
        col = mix(col, vec3(1.0, 0.97, 0.82), step(0.99888, d) * sunAmount);
        col = mix(col, vec3(0.85, 0.88, 1.0), flash);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  group.add(new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), skyMat));

  // Stars and a moon for the night.
  const rand = mulberry32(42);
  const starPos: number[] = [];
  for (let i = 0; i < 900; i++) {
    const a = rand() * Math.PI * 2;
    const y = 0.05 + rand() * 0.95;
    const r = Math.sqrt(1 - y * y);
    starPos.push(Math.cos(a) * r * 1400, y * 1400, Math.sin(a) * r * 1400);
  }
  const stars = new THREE.Points(
    new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(starPos, 3),
    ),
    new THREE.PointsMaterial({ color: '#fff8e0', size: 2.2, sizeAttenuation: false, fog: false }),
  );
  stars.visible = false;
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(38, 32),
    new THREE.MeshBasicMaterial({ color: '#f5f0d8', fog: false }),
  );
  moon.position.set(500, 700, 700);
  moon.lookAt(0, 0, 0);
  moon.visible = false;
  group.add(stars, moon);

  // Flat-bottomed cumulus clouds with outlines.
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

  return {
    group,
    setMood(mood) {
      const m = SKY_MOODS[mood];
      uniforms.horizon.value.copy(m.horizon);
      uniforms.mid.value.copy(m.mid);
      uniforms.top.value.copy(m.top);
      uniforms.sunAmount.value = m.sun;
      stars.visible = moon.visible = m.stars;
      cloudMat.emissive.copy(m.cloud);
      shadeMat.emissive.copy(m.cloudShade);
      const bright = mood === 'day' || mood === 'sunset';
      cloudMat.color.set(bright ? '#ffffff' : '#555a66');
      shadeMat.color.set(bright ? '#d9d4e8' : '#3a3d48');
    },
    flash(amount) {
      uniforms.flash.value = amount;
    },
  };
}
