import * as THREE from 'three';
import { markStatic, mergeLocal } from './batch.js';
import { mesh, outline, part } from '../toon.js';
import type { Animated } from './animals.js';
import type { Colliders } from './colliders.js';
import { RAIL_X, railHeight, WORLD_SIZE } from './terrain.js';

const GAUGE = 1.435;
const Z_START = WORLD_SIZE * 0.9;
const Z_END = -WORLD_SIZE * 0.9;

/** Track (ties + two rails), telegraph poles with sagging wires, and a passing steam train. */
export function buildRailway(
  colliders: Colliders,
  withTrain = true,
): THREE.Group & Animated & { trainCollider: { x: number; z: number; r: number }[] } {
  const group = new THREE.Group() as THREE.Group &
    Animated & { trainCollider: { x: number; z: number; r: number }[] };

  // Ties as one instanced mesh.
  const spacing = 0.75;
  const tieCount = Math.floor((Z_START - Z_END) / spacing);
  const ties = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2.5, 0.14, 0.26),
    new THREE.MeshToonMaterial({ color: '#5e4128' }),
    tieCount,
  );
  ties.receiveShadow = true;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < tieCount; i++) {
    const z = Z_START - i * spacing;
    dummy.position.set(RAIL_X, railHeight(z) + 0.07, z);
    dummy.rotation.set(0, Math.sin(i * 12.9898) * 0.5 * 0.04, 0);
    dummy.updateMatrix();
    ties.setMatrixAt(i, dummy.matrix);
  }
  group.add(ties);

  // Rails follow the graded bed in short straight pieces.
  const railGeo = new THREE.BoxGeometry(0.09, 0.14, 1);
  const railMat = new THREE.MeshToonMaterial({ color: '#6f7479' });
  const pieces = Math.floor((Z_START - Z_END) / 3);
  const rails = new THREE.InstancedMesh(railGeo, railMat, pieces * 2);
  for (let i = 0; i < pieces; i++) {
    const z0 = Z_START - i * 3;
    const z1 = z0 - 3;
    const y0 = railHeight(z0) + 0.21;
    const y1 = railHeight(z1) + 0.21;
    for (const [k, side] of [
      [0, -1],
      [1, 1],
    ] as const) {
      dummy.position.set(RAIL_X + (side * GAUGE) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      dummy.rotation.set(Math.atan2(y0 - y1, 3), 0, 0);
      dummy.scale.set(1, 1, 3.02);
      dummy.updateMatrix();
      rails.setMatrixAt(i * 2 + k, dummy.matrix);
    }
  }
  rails.castShadow = true;
  group.add(rails);

  // Telegraph poles every 30 m with wires sagging between them.
  const poleX = RAIL_X + 4.5;
  const poleTops: THREE.Vector3[] = [];
  for (let z = Z_START; z > Z_END; z -= 30) {
    const y = railHeight(z);
    const pole = new THREE.Group();
    pole.add(part(new THREE.CylinderGeometry(0.1, 0.14, 7, 7), '#6b4a2e', [0, 3.5, 0]));
    pole.add(part(new THREE.BoxGeometry(1.3, 0.12, 0.12), '#6b4a2e', [0, 6.6, 0]));
    for (const x of [-0.5, 0.5])
      pole.add(part(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 6), '#6fb3a8', [x, 6.73, 0]));
    pole.position.set(poleX, y, z);
    group.add(markStatic(outline(pole, 0.02)));
    colliders.add(poleX, z, 0.3);
    poleTops.push(new THREE.Vector3(poleX, y + 6.8, z));
  }
  const wirePts: number[] = [];
  for (const dx of [-0.5, 0.5]) {
    for (let i = 0; i < poleTops.length - 1; i++) {
      const a = poleTops[i]!;
      const b = poleTops[i + 1]!;
      for (let s = 0; s < 8; s++) {
        const t0 = s / 8;
        const t1 = (s + 1) / 8;
        const p = (t: number) => [
          a.x + dx,
          THREE.MathUtils.lerp(a.y, b.y, t) - Math.sin(t * Math.PI) * 0.7,
          THREE.MathUtils.lerp(a.z, b.z, t),
        ];
        wirePts.push(...p(t0), ...p(t1));
      }
    }
  }
  const wires = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(wirePts, 3),
    ),
    new THREE.LineBasicMaterial({ color: '#2a2320' }),
  );
  group.add(wires);

  // The train: locomotive + tender + cars, passing every couple of minutes.
  const train = buildTrain();
  group.add(train.group);
  const cycle = 150;
  const speed = 13;
  group.trainCollider = [];
  train.group.visible = withTrain;
  group.update = (dt, time) => {
    if (!withTrain) return;
    const t = time % cycle;
    const head = Z_START + 60 - t * speed;
    train.place(head);
    train.animate(dt, time, head > Z_END - 80 && head < Z_START + 50);
    group.trainCollider.length = 0;
    for (let i = 0; i < train.length; i += 4)
      group.trainCollider.push({ x: RAIL_X, z: head + i, r: 2 });
  };
  return group;
}

interface Train {
  group: THREE.Group;
  length: number;
  place(headZ: number): void;
  animate(dt: number, time: number, visible: boolean): void;
}

/** Lucky-Luke-style steam locomotive with balloon stack, cowcatcher and red wheels. */
function buildTrain(): Train {
  const group = new THREE.Group();
  const cars: { obj: THREE.Object3D; offset: number }[] = [];
  const wheels: THREE.Object3D[] = [];

  const wheelSet = (parent: THREE.Object3D, z: number, r: number) => {
    for (const side of [-1, 1]) {
      const w = new THREE.Group();
      w.add(
        part(new THREE.CylinderGeometry(r, r, 0.14, 16), '#b8322a', [0, 0, 0], [0, 0, Math.PI / 2]),
      );
      w.add(part(new THREE.BoxGeometry(0.16, r * 1.8, 0.1), '#e8c35a', [0, 0, 0]));
      w.position.set((side * GAUGE) / 2 + side * 0.1, r + 0.2, z);
      w.userData.moving = true;
      parent.add(w);
      wheels.push(w);
    }
  };

  // Locomotive, facing −z.
  const loco = new THREE.Group();
  loco.add(part(new THREE.BoxGeometry(2.2, 0.3, 7), '#2a2a2a', [0, 0.9, 0]));
  loco.add(
    part(
      new THREE.CylinderGeometry(0.85, 0.85, 4.4, 20),
      '#2e4a3a',
      [0, 1.95, -1.1],
      [Math.PI / 2, 0, 0],
    ),
  );
  for (const z of [-2.6, -1.3, 0, 0.9])
    loco.add(part(new THREE.TorusGeometry(0.86, 0.05, 6, 20), '#d9a83a', [0, 1.95, z]));
  loco.add(
    part(
      new THREE.CylinderGeometry(0.87, 0.87, 0.2, 20),
      '#d9a83a',
      [0, 1.95, -3.3],
      [Math.PI / 2, 0, 0],
    ),
  );
  loco.add(part(new THREE.SphereGeometry(0.22, 12, 8), '#fff2b0', [0, 2.35, -3.45])); // headlamp
  loco.add(part(new THREE.BoxGeometry(0.5, 0.4, 0.45), '#d9a83a', [0, 2.35, -3.3]));
  // Balloon smokestack.
  loco.add(part(new THREE.CylinderGeometry(0.22, 0.28, 1.0, 12), '#2a2a2a', [0, 3.1, -2.6]));
  loco.add(part(new THREE.CylinderGeometry(0.62, 0.22, 0.95, 14), '#2a2a2a', [0, 4.0, -2.6]));
  loco.add(part(new THREE.CylinderGeometry(0.66, 0.66, 0.12, 14), '#d9a83a', [0, 4.5, -2.6]));
  loco.add(part(new THREE.SphereGeometry(0.35, 12, 8), '#d9a83a', [0, 2.9, -0.8])); // dome
  loco.add(part(new THREE.CylinderGeometry(0.12, 0.12, 0.4, 8), '#d9a83a', [0, 3.0, 0.3])); // whistle
  // Cab.
  loco.add(part(new THREE.BoxGeometry(2.1, 2.0, 2.0), '#8b2a22', [0, 2.3, 2.3]));
  loco.add(part(new THREE.BoxGeometry(2.5, 0.15, 2.4), '#2a2a2a', [0, 3.35, 2.3]));
  for (const side of [-1, 1])
    loco.add(part(new THREE.BoxGeometry(0.05, 0.7, 0.8), '#f6e7b0', [side * 1.06, 2.6, 2.2]));
  loco.add(buildCowcatcher('#b8322a', -3.45));
  wheelSet(loco, -2.4, 0.45);
  wheelSet(loco, -0.3, 0.8);
  wheelSet(loco, 1.5, 0.8);
  // Connecting rods.
  for (const side of [-1, 1])
    loco.add(part(new THREE.BoxGeometry(0.06, 0.1, 2.0), '#c0c0c0', [side * 0.95, 0.95, 0.6]));
  group.add(mergeLocal(outline(loco, 0.04)));
  cars.push({ obj: loco, offset: 0 });

  // Tender with firewood.
  const tender = new THREE.Group();
  tender.add(part(new THREE.BoxGeometry(2.2, 1.3, 3.2), '#8b2a22', [0, 1.6, 0]));
  for (let i = 0; i < 6; i++)
    tender.add(
      part(
        new THREE.CylinderGeometry(0.14, 0.14, 1.9, 7),
        '#7a5230',
        [0, 2.35 + (i % 2) * 0.2, -1.2 + i * 0.45],
        [0, 0, Math.PI / 2],
      ),
    );
  wheelSet(tender, -0.9, 0.45);
  wheelSet(tender, 0.9, 0.45);
  group.add(mergeLocal(outline(tender, 0.04)));
  cars.push({ obj: tender, offset: 5.9 });

  // Passenger cars and a freight car.
  const colors = ['#d9a441', '#3d6b8a', '#6b8a3d'];
  for (let c = 0; c < 3; c++) {
    const car = new THREE.Group();
    const isFreight = c === 2;
    car.add(part(new THREE.BoxGeometry(2.4, 2.2, 7.5), colors[c]!, [0, 2.05, 0]));
    car.add(part(new THREE.BoxGeometry(2.7, 0.18, 7.9), '#5b3a1d', [0, 3.2, 0]));
    if (!isFreight) {
      for (let w = 0; w < 5; w++) {
        for (const side of [-1, 1])
          car.add(
            part(new THREE.BoxGeometry(0.05, 0.7, 0.8), '#f6e7b0', [
              side * 1.21,
              2.4,
              -3 + w * 1.5,
            ]),
          );
      }
    } else {
      for (const side of [-1, 1])
        car.add(part(new THREE.BoxGeometry(0.05, 1.6, 2.0), '#5b3a1d', [side * 1.21, 2.0, 0]));
    }
    car.add(part(new THREE.BoxGeometry(2.0, 0.25, 7.2), '#2a2a2a', [0, 0.85, 0]));
    wheelSet(car, -2.6, 0.45);
    wheelSet(car, 2.6, 0.45);
    group.add(mergeLocal(outline(car, 0.04)));
    cars.push({ obj: car, offset: 5.9 + 5.8 + c * 8.1 });
  }
  const length = cars[cars.length - 1]!.offset + 4;

  // Smoke puffs from the stack.
  const smokeMat = new THREE.MeshToonMaterial({
    color: '#efeae0',
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });
  const puffs = Array.from({ length: 14 }, (_, i) => {
    const p = mesh(new THREE.IcosahedronGeometry(0.6, 3), '#f7f3ea');
    p.material = smokeMat.clone();
    p.castShadow = false;
    group.add(p);
    return { p, t: i / 14, x: 0, y: 0, z: 0 };
  });

  let headZ = 0;
  return {
    group,
    length,
    place(z: number) {
      headZ = z;
      for (const c of cars) {
        const cz = z + c.offset;
        const front = railHeight(cz - 2);
        const back = railHeight(cz + 2);
        c.obj.position.set(RAIL_X, (front + back) / 2 + 0.2, cz);
        c.obj.rotation.x = Math.atan2(front - back, 4);
      }
    },
    animate(dt, time, visible) {
      group.visible = visible;
      if (!visible) return;
      for (const w of wheels) w.rotation.x -= (dt * 13) / 0.6;
      const stack = new THREE.Vector3(RAIL_X, railHeight(headZ - 2.6) + 4.9, headZ - 2.6);
      for (const s of puffs) {
        s.t += dt * 0.45;
        if (s.t >= 1) {
          s.t -= 1;
          s.x = stack.x;
          s.y = stack.y;
          s.z = stack.z;
        }
        s.p.position.set(
          s.x + s.t * 2,
          s.y + s.t * 5 + Math.sin(time * 3 + s.t * 10) * 0.2,
          s.z + s.t * 3,
        );
        s.p.scale.setScalar(0.5 + s.t * 2.6);
        (s.p.material as THREE.MeshToonMaterial).opacity = 0.85 * (1 - s.t);
      }
    },
  };
}

/**
 * An 1860s cowcatcher ("pilot"): a V of slanted bars below the smokebox, from a
 * buffer beam at the front of the frame (z = backZ) down to a point at rail level.
 * In the locomotive's frame (it faces −z).
 */
export function buildCowcatcher(color: string, backZ: number): THREE.Group {
  const g = new THREE.Group();
  const bar = (a: THREE.Vector3, b: THREE.Vector3, r: number) => {
    const len = a.distanceTo(b);
    const m = part(new THREE.CylinderGeometry(r, r, len, 6), color, [0, 0, 0]);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.add(m);
  };
  const halfW = 1.0;
  const topY = 1.05;
  const lowY = 0.28;
  const reach = 1.0; // how far the point sticks out in front of the beam
  // Buffer beam across the front of the frame.
  g.add(part(new THREE.BoxGeometry(2.3, 0.3, 0.2), '#2a2a2a', [0, topY + 0.08, backZ]));
  // Top rail and the V along the bottom.
  const top = (t: number) => new THREE.Vector3(t * halfW, topY, backZ - 0.05);
  const low = (t: number) => new THREE.Vector3(t * halfW, lowY, backZ - reach * (1 - Math.abs(t)));
  bar(top(-1), top(1), 0.045);
  bar(low(-1), low(0), 0.05);
  bar(low(0), low(1), 0.05);
  // Slanted bars from the top rail down to the V, fanning out from the point.
  for (let i = -4; i <= 4; i++) {
    const t = i / 4;
    bar(top(t), low(t), 0.035);
  }
  // The nose post at the point.
  bar(new THREE.Vector3(0, topY, backZ - 0.1), low(0), 0.05);
  return outline(g, 0.02);
}
