import * as THREE from 'three';
import type { Animated } from './animals.js';
import type { Colliders } from './colliders.js';
import { buildPerson, buildSoldier, type Npc } from './npc.js';
import { outline, part, toon } from '../toon.js';
import { heightAt } from './terrain.js';
import { barrel, buildPit, gableRoof, signTexture, type TownSpots } from './town.js';

export interface FortLayout {
  /** Centre of the parade ground. */
  x: number;
  z: number;
  /** Outer size of the stockade (x, z). */
  width: number;
  depth: number;
}

export interface Fort extends TownSpots {
  gate: THREE.Vector3;
  office: THREE.Vector3;
  parade: THREE.Vector3;
  flag: THREE.Vector3;
  sergeant: Npc;
  ruth: Npc;
  telegraphist: THREE.Vector3;
  /** Soldiers who march in the parade minigame. */
  paradeSoldiers: (Npc & { step(phase: number): void })[];
  animated: Animated[];
}

/** Horizontal log texture for cabins. */
function logTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < 128; y += 16) {
    const g = ctx.createLinearGradient(0, y, 0, y + 16);
    g.addColorStop(0, '#9a6a38');
    g.addColorStop(0.5, '#b07a42');
    g.addColorStop(1, '#6b4423');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, 128, 16);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** A log building whose door faces local +z. */
function logBuilding(w: number, d: number, h: number, sign?: string, color?: string): THREE.Group {
  const g = new THREE.Group();
  const tex = logTexture();
  tex.repeat.set(w / 3, h / 2);
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    color ? toon(color) : new THREE.MeshToonMaterial({ map: tex }),
  );
  body.position.set(0, h / 2, -d / 2);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  g.add(gableRoof(w, d, h, '#5e3a1a', 1.4));
  g.add(part(new THREE.BoxGeometry(1.2, 2.2, 0.1), '#3a2615', [0, 1.1, 0.02]));
  for (const side of [-1, 1]) {
    for (let i = 1; i < Math.floor(w / 4); i++) {
      g.add(part(new THREE.BoxGeometry(1, 0.9, 0.08), '#9fd0da', [side * (i * 2.2), 1.6, 0.02]));
    }
  }
  if (sign) {
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(Math.min(w * 0.7, 4.5), 0.7, 0.1),
      new THREE.MeshToonMaterial({ map: signTexture(sign, '#f3e2b3', '#3a2615') }),
    );
    board.position.set(0, h - 0.5, 0.08);
    g.add(board);
  }
  return outline(g, 0.025);
}

function blockhouse(): THREE.Group {
  const g = new THREE.Group();
  const tex = logTexture();
  const lower = new THREE.Mesh(
    new THREE.BoxGeometry(5, 4, 5),
    new THREE.MeshToonMaterial({ map: tex }),
  );
  lower.position.y = 2;
  const upper = new THREE.Mesh(
    new THREE.BoxGeometry(6.2, 3, 6.2),
    new THREE.MeshToonMaterial({ map: tex }),
  );
  upper.position.y = 5.5;
  for (const m of [lower, upper]) m.castShadow = m.receiveShadow = true;
  g.add(lower, upper);
  g.add(part(new THREE.ConeGeometry(5, 2.2, 4), '#5e3a1a', [0, 8.1, 0], [0, Math.PI / 4, 0]));
  for (const [x, z] of [
    [3.12, 0],
    [-3.12, 0],
    [0, 3.12],
    [0, -3.12],
  ] as const) {
    g.add(part(new THREE.BoxGeometry(x ? 0.1 : 1.2, 0.4, z ? 0.1 : 1.2), '#1b1b1b', [x, 5.6, z]));
  }
  return outline(g, 0.03);
}

/** 37-star US flag (1869) on a tall pole; waves in the wind. */
function flagpole(): THREE.Group & Animated {
  const g = new THREE.Group() as THREE.Group & Animated;
  g.add(part(new THREE.CylinderGeometry(0.08, 0.12, 12, 8), '#e9e4d6', [0, 6, 0]));
  g.add(part(new THREE.SphereGeometry(0.16, 8, 6), '#e0b84a', [0, 12.1, 0]));
  const c = document.createElement('canvas');
  c.width = 190;
  c.height = 100;
  const ctx = c.getContext('2d')!;
  for (let i = 0; i < 13; i++) {
    ctx.fillStyle = i % 2 ? '#f5f1e6' : '#b8322a';
    ctx.fillRect(0, (i * 100) / 13, 190, 100 / 13 + 1);
  }
  ctx.fillStyle = '#2f3f78';
  ctx.fillRect(0, 0, 80, 54);
  ctx.fillStyle = '#f5f1e6';
  for (let r = 0; r < 5; r++)
    for (let k = 0; k < 7; k++) ctx.fillRect(6 + k * 10.5, 6 + r * 10, 3, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(3.4, 1.8, 16, 4);
  geo.translate(1.7, 0, 0);
  const flag = new THREE.Mesh(
    geo,
    new THREE.MeshToonMaterial({ map: tex, side: THREE.DoubleSide }),
  );
  flag.position.y = 11.1;
  flag.castShadow = true;
  g.add(flag);
  const base = (geo.attributes.position as THREE.BufferAttribute).clone();
  g.update = (_dt, time) => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = base.getX(i);
      pos.setZ(i, Math.sin(x * 2.2 - time * 4) * 0.18 * (x / 3.4));
    }
    pos.needsUpdate = true;
  };
  return g;
}

function cannon(): THREE.Group {
  const g = new THREE.Group();
  g.add(
    part(
      new THREE.CylinderGeometry(0.16, 0.24, 2.2, 12),
      '#3a3330',
      [0, 0.9, 0.2],
      [Math.PI / 2 - 0.1, 0, 0],
    ),
  );
  for (const side of [-1, 1]) {
    const w = part(
      new THREE.TorusGeometry(0.5, 0.07, 6, 16),
      '#6b4423',
      [side * 0.45, 0.55, 0.6],
      [0, Math.PI / 2, 0],
    );
    g.add(w);
  }
  g.add(part(new THREE.BoxGeometry(0.5, 0.3, 1.6), '#6b4423', [0, 0.45, 1]));
  return outline(g, 0.02);
}

/**
 * Fort Kearny: a log stockade with an open gate towards the trail (east), corner
 * blockhouses and a parade ground with the flag, barracks, the telegraph office
 * and a horseshoe pit where the soldiers play in their free time.
 */
export function buildFort(scene: THREE.Scene, colliders: Colliders, L: FortLayout): Fort {
  const g = new THREE.Group();
  const animated: Animated[] = [];
  const hw = L.width / 2;
  const hd = L.depth / 2;
  const ground = heightAt(L.x, L.z);
  const at = (x: number, z: number) =>
    new THREE.Vector3(L.x + x, heightAt(L.x + x, L.z + z), L.z + z);

  // Stockade: pointed logs, instanced. The gate (east wall, middle) stays open.
  const gateHalf = 3.2;
  const spots: THREE.Vector3[] = [];
  const pushWall = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.floor(len / 0.46);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      if (Math.abs(x - hw) < 0.1 && Math.abs(z) < gateHalf) continue;
      spots.push(new THREE.Vector3(x, 0, z));
    }
  };
  pushWall(-hw, -hd, hw, -hd);
  pushWall(-hw, hd, hw, hd);
  pushWall(-hw, -hd, -hw, hd);
  pushWall(hw, -hd, hw, hd);
  const logGeo = new THREE.CylinderGeometry(0.24, 0.26, 4.6, 7);
  logGeo.translate(0, 2.3, 0);
  const tipGeo = new THREE.ConeGeometry(0.24, 0.6, 7);
  tipGeo.translate(0, 4.9, 0);
  const logs = new THREE.InstancedMesh(logGeo, toon('#8a5a2b'), spots.length);
  const tips = new THREE.InstancedMesh(tipGeo, toon('#6b4423'), spots.length);
  logs.castShadow = logs.receiveShadow = tips.castShadow = true;
  const m = new THREE.Object3D();
  spots.forEach((s, i) => {
    const wx = L.x + s.x;
    const wz = L.z + s.z;
    m.position.set(wx, heightAt(wx, wz) - 0.3 + ((i * 37) % 7) * 0.05, wz);
    m.rotation.set(0, i * 1.7, 0);
    m.updateMatrix();
    logs.setMatrixAt(i, m.matrix);
    tips.setMatrixAt(i, m.matrix);
  });
  g.add(logs, tips);
  // A dark band along the top reads as the ink outline for the whole wall.
  colliders.addBox(L.x, L.z - hd, L.width, 1, 0);
  colliders.addBox(L.x, L.z + hd, L.width, 1, 0);
  colliders.addBox(L.x - hw, L.z, 1, L.depth, 0);
  colliders.addBox(L.x + hw, L.z - (hd + gateHalf) / 2, 1, hd - gateHalf, 0);
  colliders.addBox(L.x + hw, L.z + (hd + gateHalf) / 2, 1, hd - gateHalf, 0);

  // Open gate doors and a sign above the gate.
  for (const side of [-1, 1]) {
    const door = part(new THREE.BoxGeometry(0.25, 4.4, gateHalf), '#7a5230', [0, 2.2, 0]);
    door.position.set(
      L.x + hw + gateHalf / 2 + 0.1,
      ground + 2.2,
      L.z + side * (gateHalf + gateHalf / 2 - 0.2),
    );
    door.rotation.y = side * 1.3;
    g.add(outline(door, 0.02));
  }
  const gateSign = new THREE.Mesh(
    new THREE.BoxGeometry(5.6, 1, 0.15),
    new THREE.MeshToonMaterial({ map: signTexture('FORT KEARNY', '#b07a42', '#2a1a0c') }),
  );
  gateSign.position.set(L.x + hw + 0.2, ground + 5.3, L.z);
  // The painted side faces the trail (+x).
  gateSign.rotation.y = Math.PI / 2;
  g.add(outline(gateSign, 0.02));
  for (const side of [-1, 1]) {
    g.add(
      part(new THREE.BoxGeometry(0.35, 6, 0.35), '#6b4423', [
        L.x + hw,
        ground + 3,
        L.z + side * (gateHalf + 0.1),
      ]),
    );
  }

  // Corner blockhouses.
  for (const [x, z] of [
    [hw - 1, -hd + 1],
    [-hw + 1, hd - 1],
  ] as const) {
    const b = blockhouse();
    b.position.copy(at(x, z));
    g.add(b);
    colliders.addBox(L.x + x, L.z + z, 6.4, 6.4, 0);
  }

  // Buildings inside, doors facing the parade ground.
  const place = (obj: THREE.Object3D, x: number, z: number, rotY: number, w: number, d: number) => {
    obj.position.copy(at(x, z));
    obj.rotation.y = rotY;
    g.add(obj);
    // Body extends backwards from the door (local −z).
    const back = new THREE.Vector3(0, 0, -d / 2).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    colliders.addBox(L.x + x + back.x, L.z + z + back.z, w + 0.3, d + 0.3, rotY);
  };
  place(logBuilding(20, 7, 3.4, 'KASERNE'), -2, -hd + 9, 0, 20, 7);
  place(logBuilding(9, 8, 3.6, 'KOMMANDANT', '#efe9dc'), -hw + 10, 2, Math.PI / 2, 9, 8);
  const office = logBuilding(7, 6, 3.2, 'TELEGRAF');
  place(office, hw - 9, hd - 8, Math.PI, 7, 6);
  place(logBuilding(12, 6, 3, 'STALD'), -4, hd - 7, Math.PI, 12, 6);
  const flag = flagpole();
  flag.position.copy(at(0, 0));
  g.add(flag);
  animated.push(flag);
  colliders.add(L.x, L.z, 0.4);
  const cn = cannon();
  cn.position.copy(at(4, -3));
  cn.rotation.y = -Math.PI / 2;
  g.add(cn);
  colliders.add(L.x + 4.6, L.z - 3, 1.2);
  for (const [x, z] of [
    [hw - 3, hd - 12],
    [hw - 4.2, hd - 12.6],
    [-hw + 4, -hd + 13],
  ] as const) {
    const b = barrel();
    b.position.copy(at(x, z));
    g.add(b);
    colliders.add(L.x + x, L.z + z, 0.45);
  }
  // Telegraph wire from the office roof out through the gate towards the railway poles.
  const officeWorld = at(hw - 9, hd - 8 - 3);

  // Horseshoe pit on the north-west part of the parade ground.
  const pitStart = at(-6, 8);
  const pitDir = new THREE.Vector3(-1, 0, 0);
  const pitStake = pitStart.clone().addScaledVector(pitDir, 12);
  pitStake.y = heightAt(pitStake.x, pitStake.z);
  g.add(buildPit(pitStart, pitStake));

  // People: the sergeant at the gate, guards, and soldiers who drill for the parade.
  const sergeant = buildSoldier({ sergeant: true, moustache: true });
  sergeant.position.copy(at(hw + 3, -5));
  g.add(sergeant);
  animated.push(sergeant);
  colliders.add(L.x + hw + 3, L.z - 5, 0.45);
  for (const [x, z] of [
    [hw + 1.5, gateHalf + 1.2],
    [hw - 1.5, -hd + 6],
  ] as const) {
    const guard = buildSoldier();
    guard.position.copy(at(x, z));
    guard.rotation.y = -Math.PI / 2;
    g.add(guard);
    animated.push(guard);
    colliders.add(L.x + x, L.z + z, 0.45);
  }
  const paradeSoldiers = Array.from({ length: 6 }, (_, i) => {
    const s = buildSoldier({ moustache: i % 3 === 0 });
    s.position.copy(at(-8 + i * 1.6, -4));
    s.rotation.y = Math.PI;
    g.add(s);
    return s;
  });

  // Ruth, the telegraphist, outside her office.
  const telegraphist = at(hw - 9 + 2, hd - 8 - 1.8);
  const ruth = buildPerson({ scale: 1, dress: '#6b3a5a', apron: '#f3ecdc', hair: '#5e3a1a' });
  ruth.position.copy(telegraphist);
  g.add(ruth);
  animated.push(ruth);
  colliders.add(telegraphist.x, telegraphist.z, 0.45);

  scene.add(g);

  return {
    config: {
      name: 'FORT KEARNY',
      zStart: L.z - hd,
      zEnd: L.z + hd,
      arch: 'start',
      west: [],
      east: [],
      squareZ: L.z,
      waterTowerZ: L.z,
      seed: 1,
    },
    contains: (p) => Math.abs(p.x - L.x) < hw && Math.abs(p.z - L.z) < hd,
    center: at(0, 0),
    pitStart,
    pitStake,
    pitDir,
    gate: at(hw + 4, 0),
    office: officeWorld,
    parade: at(0, -6),
    flag: at(0, 0),
    sergeant,
    ruth,
    telegraphist,
    paradeSoldiers,
    animated,
  };
}
