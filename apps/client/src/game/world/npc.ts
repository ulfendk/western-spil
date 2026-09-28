import * as THREE from 'three';
import { outline, part } from '../toon.js';
import type { Animated } from './animals.js';

/** An NPC that turns to face the player when they come close. */
export type Npc = THREE.Group & Animated & { lookAtPlayer(p: THREE.Vector3 | null): void };

/**
 * Postmester Pind: old courier with a blue coat, postal cap, round spectacles,
 * a long white beard, a mail satchel and a walking cane.
 */
export function buildPind(): Npc {
  const coat = '#34507a';
  const skin = '#efc39c';
  const npc = new THREE.Group() as Npc;
  const body = new THREE.Group();
  npc.add(body);

  // Legs and boots.
  for (const side of [-1, 1]) {
    body.add(part(new THREE.CapsuleGeometry(0.1, 0.5, 4, 8), '#5a5a5e', [side * 0.12, 0.45, 0]));
    body.add(part(new THREE.BoxGeometry(0.16, 0.12, 0.3), '#2f2419', [side * 0.12, 0.08, -0.05]));
  }
  // Long coat flaring out at the bottom, with brass buttons.
  body.add(part(new THREE.CylinderGeometry(0.27, 0.36, 0.95, 14), coat, [0, 1.12, 0]));
  body.add(part(new THREE.SphereGeometry(0.29, 14, 10), coat, [0, 1.55, 0]));
  for (let i = 0; i < 4; i++)
    body.add(
      part(new THREE.SphereGeometry(0.03, 6, 4), '#e0b84a', [
        0,
        1.5 - i * 0.16,
        -0.285 + i * 0.012,
      ]),
    );
  // Mail satchel across the body.
  body.add(
    part(new THREE.BoxGeometry(0.34, 0.26, 0.12), '#7a4e2d', [0.3, 1.05, 0.02], [0, 0, 0.1]),
  );
  body.add(
    part(new THREE.BoxGeometry(0.05, 0.85, 0.04), '#5e3a1a', [0.05, 1.45, -0.02], [0, 0, 0.7]),
  );
  // Arms; the right hand rests on a cane.
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.34, 1.66, 0);
    arm.add(part(new THREE.CapsuleGeometry(0.08, 0.45, 4, 8), coat, [0, -0.26, 0]));
    arm.add(part(new THREE.SphereGeometry(0.07, 8, 6), skin, [0, -0.56, 0]));
    arm.rotation.set(side > 0 ? -0.35 : 0, 0, side * 0.1);
    body.add(arm);
  }
  body.add(part(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 6), '#5e3a1a', [0.38, 0.55, -0.22]));
  body.add(
    part(
      new THREE.TorusGeometry(0.06, 0.02, 4, 8, Math.PI),
      '#5e3a1a',
      [0.38, 1.1, -0.26],
      [0, Math.PI / 2, 0],
    ),
  );
  // Head: face, big nose, spectacles, white hair and beard.
  body.add(part(new THREE.SphereGeometry(0.22, 16, 12), skin, [0, 1.98, 0]));
  body.add(part(new THREE.SphereGeometry(0.065, 8, 6), '#e6a582', [0, 1.97, -0.22]));
  const beard = part(
    new THREE.ConeGeometry(0.2, 0.45, 12),
    '#f2f0ea',
    [0, 1.72, -0.1],
    [Math.PI + 0.25, 0, 0],
  );
  body.add(beard);
  body.add(
    part(
      new THREE.CapsuleGeometry(0.03, 0.2, 4, 6),
      '#f2f0ea',
      [0, 1.9, -0.2],
      [0, 0, Math.PI / 2],
    ),
  ); // moustache
  for (const side of [-1, 1]) {
    const lens = part(new THREE.TorusGeometry(0.055, 0.012, 6, 14), '#3a3330', [
      side * 0.08,
      2.03,
      -0.2,
    ]);
    body.add(lens);
    body.add(part(new THREE.SphereGeometry(0.022, 6, 4), '#1b1b1b', [side * 0.08, 2.03, -0.205]));
    body.add(part(new THREE.SphereGeometry(0.09, 8, 6), '#f2f0ea', [side * 0.19, 1.98, 0.02])); // side hair
  }
  // Postal cap (kepi) with a brass badge.
  body.add(part(new THREE.CylinderGeometry(0.2, 0.23, 0.2, 16), coat, [0, 2.2, 0.01], [0.1, 0, 0]));
  body.add(
    part(
      new THREE.CylinderGeometry(0.16, 0.16, 0.03, 16, 1, false, Math.PI / 2, Math.PI),
      '#1f2f4a',
      [0, 2.12, -0.12],
    ),
  );
  body.add(part(new THREE.SphereGeometry(0.04, 8, 6), '#e0b84a', [0, 2.22, -0.21]));

  outline(body, 0.02);

  let target: THREE.Vector3 | null = null;
  npc.lookAtPlayer = (p) => (target = p);
  npc.update = (dt, time) => {
    body.position.y = Math.sin(time * 1.3) * 0.01;
    beard.rotation.z = Math.sin(time * 0.8) * 0.04;
    let desired = 0;
    if (target) {
      const local = npc.worldToLocal(target.clone());
      desired = Math.atan2(-local.x, -local.z);
    }
    const diff = Math.atan2(
      Math.sin(desired - body.rotation.y),
      Math.cos(desired - body.rotation.y),
    );
    body.rotation.y += diff * (1 - Math.exp(-dt * 4));
  };
  return npc;
}

interface PersonOptions {
  /** Overall size (1 = adult, ~0.72 = child). */
  scale: number;
  dress: string;
  apron?: string;
  hair: string;
  braids?: boolean;
  bonnet?: string;
}

/** A pioneer in a long dress: used for Mor Jensen and Sofie. */
export function buildPerson(o: PersonOptions): Npc {
  const skin = '#f1c9a0';
  const npc = new THREE.Group() as Npc;
  const body = new THREE.Group();
  npc.add(body);
  // Long dress down to the boots, with an apron and a waist sash.
  body.add(part(new THREE.CylinderGeometry(0.22, 0.42, 1.15, 16), o.dress, [0, 0.6, 0]));
  body.add(part(new THREE.CapsuleGeometry(0.23, 0.35, 4, 12), o.dress, [0, 1.35, 0]));
  if (o.apron)
    body.add(part(new THREE.BoxGeometry(0.42, 0.85, 0.05), o.apron, [0, 0.75, -0.3], [0.2, 0, 0]));
  body.add(
    part(new THREE.CylinderGeometry(0.235, 0.235, 0.08, 14), o.apron ?? '#f3ecdc', [0, 1.16, 0]),
  );
  for (const side of [-1, 1]) {
    body.add(part(new THREE.BoxGeometry(0.12, 0.08, 0.22), '#3a2615', [side * 0.1, 0.04, -0.08]));
    const arm = new THREE.Group();
    arm.position.set(side * 0.3, 1.52, 0);
    arm.add(part(new THREE.CapsuleGeometry(0.07, 0.42, 4, 8), o.dress, [0, -0.25, 0]));
    arm.add(part(new THREE.SphereGeometry(0.065, 8, 6), skin, [0, -0.52, 0]));
    arm.rotation.z = side * 0.15;
    body.add(arm);
  }
  // Head, face and hair.
  body.add(part(new THREE.SphereGeometry(0.21, 16, 12), skin, [0, 1.84, 0]));
  body.add(part(new THREE.SphereGeometry(0.035, 6, 4), '#e8b088', [0, 1.82, -0.21]));
  for (const side of [-1, 1])
    body.add(part(new THREE.SphereGeometry(0.026, 6, 4), '#1b1b1b', [side * 0.07, 1.87, -0.185]));
  const hair = part(
    new THREE.SphereGeometry(0.225, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    o.hair,
    [0, 1.87, 0.02],
  );
  body.add(hair);
  if (o.braids) {
    for (const side of [-1, 1]) {
      body.add(
        part(
          new THREE.CapsuleGeometry(0.05, 0.35, 4, 6),
          o.hair,
          [side * 0.2, 1.62, 0.05],
          [0.1, 0, side * 0.15],
        ),
      );
      body.add(part(new THREE.SphereGeometry(0.05, 6, 4), '#c8553d', [side * 0.23, 1.42, 0.06]));
    }
  }
  if (o.bonnet) {
    // Prairie bonnet with a wide brim shading the face.
    body.add(
      part(
        new THREE.SphereGeometry(0.25, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6),
        o.bonnet,
        [0, 1.9, 0.04],
      ),
    );
    const brim = part(
      new THREE.CylinderGeometry(0.27, 0.3, 0.2, 16, 1, true, -Math.PI / 2, Math.PI),
      o.bonnet,
      [0, 1.86, -0.1],
      [Math.PI / 2 - 0.3, 0, 0],
    );
    body.add(brim);
  }
  body.scale.setScalar(o.scale);
  outline(body, 0.018);

  let target: THREE.Vector3 | null = null;
  npc.lookAtPlayer = (p) => (target = p);
  npc.update = (dt, time) => {
    body.position.y = Math.sin(time * 1.5) * 0.01;
    let desired = 0;
    if (target) {
      const local = npc.worldToLocal(target.clone());
      desired = Math.atan2(-local.x, -local.z);
    }
    const diff = Math.atan2(
      Math.sin(desired - body.rotation.y),
      Math.cos(desired - body.rotation.y),
    );
    body.rotation.y += diff * (1 - Math.exp(-dt * 4));
  };
  return npc;
}
