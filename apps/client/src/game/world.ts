import * as THREE from 'three';
import { fbm, mulberry32 } from './noise.js';
import { mesh, outline, toon } from './toon.js';

export const WORLD_SIZE = 400;
export const WORLD_HALF = WORLD_SIZE / 2 - 10;

/** The trail winds westward (−z) across the prairie. */
export function trailX(z: number): number {
  return Math.sin(z * 0.012) * 30 + Math.sin(z * 0.031) * 8;
}

export function heightAt(x: number, z: number): number {
  const hills = (fbm(x * 0.008, z * 0.008, 4, 7) - 0.5) * 26;
  const bumps = (fbm(x * 0.05, z * 0.05, 2, 3) - 0.5) * 1.6;
  // Flatten the trail so wagons (and kids) can follow it.
  const d = Math.abs(x - trailX(z));
  const flatten = THREE.MathUtils.smoothstep(d, 4, 18);
  return (hills + bumps) * (0.25 + 0.75 * flatten);
}

const COLORS = {
  grassLight: new THREE.Color('#d9c25a'),
  grassDark: new THREE.Color('#9fae4a'),
  dirt: new THREE.Color('#c9925a'),
  cactus: '#4f8a3c',
  rock: '#a0785a',
  mesa: '#c8553d',
  mesaTop: '#e08a4f',
  wood: '#8a5a2b',
  canvas: '#f3ead3',
};

export function buildWorld(scene: THREE.Scene) {
  scene.add(buildSky());
  scene.add(buildTerrain());
  scene.add(buildMesas());
  scene.add(buildProps());
  scene.add(buildWagon(trailX(-12) + 6, -12));
  scene.add(buildSign(trailX(8) - 5, 8));

  const hemi = new THREE.HemisphereLight('#fff6d8', '#b0764a', 1.6);
  const sun = new THREE.DirectionalLight('#fff1c9', 2.4);
  sun.position.set(-60, 90, -120);
  scene.add(hemi, sun);
  scene.fog = new THREE.Fog('#f6d38a', 180, 520);
}

function buildTerrain(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(WORLD_SIZE * 1.6, WORLD_SIZE * 1.6, 200, 200);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
    const trail = 1 - THREE.MathUtils.smoothstep(Math.abs(x - trailX(z)), 2.5, 5);
    c.copy(COLORS.grassDark).lerp(COLORS.grassLight, fbm(x * 0.03, z * 0.03, 2, 11));
    c.lerp(COLORS.dirt, trail);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, toon('#ffffff', { vertexColors: true }));
}

function buildSky(): THREE.Group {
  const group = new THREE.Group();
  const skyGeo = new THREE.SphereGeometry(900, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying float vH;
      void main() {
        vH = normalize(position).y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vH;
      void main() {
        vec3 horizon = vec3(0.98, 0.84, 0.55);
        vec3 mid = vec3(0.45, 0.78, 0.86);
        vec3 top = vec3(0.16, 0.50, 0.78);
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.25, vH));
        col = mix(col, top, smoothstep(0.25, 0.8, vH));
        // Banded like a printed comic sky.
        col = floor(col * 10.0) / 10.0;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  group.add(new THREE.Mesh(skyGeo, skyMat));

  // The big western sun, low in the west (−z).
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(60, 48),
    new THREE.MeshBasicMaterial({ color: '#fff3c4', fog: false }),
  );
  sun.position.set(-80, 120, -800);
  sun.lookAt(0, 0, 0);
  group.add(sun);

  const rand = mulberry32(42);
  const cloudMat = new THREE.MeshToonMaterial({
    color: '#ffffff',
    emissive: '#8a8a80',
    fog: false,
  });
  for (let i = 0; i < 14; i++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 4; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(8 + rand() * 8, 12, 8), cloudMat);
      puff.position.set(j * 12 - 18, rand() * 4, rand() * 6);
      puff.scale.y = 0.55;
      cloud.add(puff);
    }
    const angle = rand() * Math.PI * 2;
    const r = 350 + rand() * 250;
    cloud.position.set(Math.cos(angle) * r, 110 + rand() * 60, Math.sin(angle) * r);
    cloud.lookAt(0, cloud.position.y, 0);
    group.add(outline(cloud));
  }
  return group;
}

/** Red sandstone mesas and buttes on the horizon (Monument Valley style). */
function buildMesas(): THREE.Group {
  const group = new THREE.Group();
  const rand = mulberry32(99);
  for (let i = 0; i < 22; i++) {
    const angle = rand() * Math.PI * 2;
    const r = 330 + rand() * 180;
    const w = 20 + rand() * 50;
    const h = 30 + rand() * 60;
    const mesa = new THREE.Group();
    const body = mesh(new THREE.CylinderGeometry(w * 0.8, w, h, 7), COLORS.mesa);
    body.position.y = h / 2;
    const top = mesh(new THREE.CylinderGeometry(w * 0.82, w * 0.8, 3, 7), COLORS.mesaTop);
    top.position.y = h + 1.5;
    mesa.add(body, top);
    mesa.position.set(Math.cos(angle) * r, -4, Math.sin(angle) * r);
    mesa.rotation.y = rand() * Math.PI;
    group.add(outline(mesa));
  }
  return group;
}

function buildCactus(rand: () => number): THREE.Group {
  const cactus = new THREE.Group();
  const h = 3 + rand() * 3;
  const trunk = mesh(new THREE.CapsuleGeometry(0.35, h, 4, 8), COLORS.cactus);
  trunk.position.y = h / 2;
  cactus.add(trunk);
  for (const side of [-1, 1]) {
    if (rand() < 0.3) continue;
    const armH = 1 + rand() * 1.4;
    const y = h * (0.35 + rand() * 0.3);
    const elbow = mesh(new THREE.CapsuleGeometry(0.25, 0.8, 4, 8), COLORS.cactus);
    elbow.rotation.z = Math.PI / 2;
    elbow.position.set(side * 0.7, y, 0);
    const arm = mesh(new THREE.CapsuleGeometry(0.25, armH, 4, 8), COLORS.cactus);
    arm.position.set(side * 1.15, y + armH / 2, 0);
    cactus.add(elbow, arm);
  }
  return outline(cactus);
}

function buildProps(): THREE.Group {
  const group = new THREE.Group();
  const rand = mulberry32(7);
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  for (let i = 0; i < 160; i++) {
    const x = (rand() - 0.5) * WORLD_SIZE;
    const z = (rand() - 0.5) * WORLD_SIZE;
    if (Math.abs(x - trailX(z)) < 8) continue;
    const isCactus = rand() < 0.45;
    const prop = isCactus ? buildCactus(rand) : outline(mesh(rockGeo, COLORS.rock));
    if (!isCactus) prop.scale.set(1 + rand() * 2, 0.6 + rand(), 1 + rand() * 2);
    prop.position.set(x, heightAt(x, z) - 0.2, z);
    prop.rotation.y = rand() * Math.PI * 2;
    group.add(prop);
  }
  return group;
}

/** A covered prairie wagon waiting by the trail. */
function buildWagon(x: number, z: number): THREE.Group {
  const wagon = new THREE.Group();
  const bed = mesh(new THREE.BoxGeometry(2.2, 0.8, 4.4), COLORS.wood);
  bed.position.y = 1.3;
  const cover = mesh(
    new THREE.CylinderGeometry(1.3, 1.3, 4, 16, 1, true, -Math.PI / 2, Math.PI),
    COLORS.canvas,
  );
  cover.material = new THREE.MeshToonMaterial({ color: COLORS.canvas, side: THREE.DoubleSide });
  cover.rotation.x = Math.PI / 2;
  cover.rotation.y = Math.PI / 2;
  cover.position.y = 1.7;
  wagon.add(bed, cover);
  const wheelGeo = new THREE.TorusGeometry(0.75, 0.1, 6, 16);
  for (const [wx, wz] of [
    [-1.2, 1.4],
    [1.2, 1.4],
    [-1.2, -1.4],
    [1.2, -1.4],
  ] as const) {
    const wheel = mesh(wheelGeo, '#5b3a1d');
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(wx, 0.8, wz);
    const hub = mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.5, 6), '#5b3a1d');
    hub.rotation.x = Math.PI / 2;
    hub.position.copy(wheel.position);
    wagon.add(wheel, hub);
  }
  wagon.position.set(x, heightAt(x, z), z);
  wagon.rotation.y = 0.3;
  return outline(wagon);
}

/** A wooden sign post pointing west, with Danish text painted on it. */
function buildSign(x: number, z: number): THREE.Group {
  const sign = new THREE.Group();
  const post = mesh(new THREE.BoxGeometry(0.2, 2.6, 0.2), COLORS.wood);
  post.position.y = 1.3;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#b07a42';
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#2a1a0c';
  ctx.font = '64px Rye, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VESTPÅ →', 256, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.6, 0.12),
    new THREE.MeshToonMaterial({ map: tex }),
  );
  board.position.y = 2.2;
  sign.add(post, board);
  sign.position.set(x, heightAt(x, z), z);
  sign.rotation.y = Math.PI / 2;
  return outline(sign);
}
