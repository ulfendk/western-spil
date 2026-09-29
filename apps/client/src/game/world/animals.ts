import * as THREE from 'three';
import { ambience } from '../../audio/ambience.js';
import { mergeLocal } from './batch.js';
import { character } from '../models.js';
import { mulberry32 } from '../noise.js';
import { outline, part } from '../toon.js';
import type { Circle } from './colliders.js';
import { heightAt, inWater, walkHeightAt } from './terrain.js';

export interface Animated {
  update(dt: number, time: number): void;
}

/**
 * Kanel: a cinnamon-coloured horse with a white blaze and a red saddle blanket.
 * Faces −z. Idles with head nods, ear flicks and tail swishes.
 */
export type Horse = THREE.Group &
  Animated & {
    /** Walk towards the player and keep them company (null = stand still). */
    follow(target: THREE.Vector3 | null, heading: number): void;
  };

/** Sculpted horses by coat colour (buildHorse's `coat` option); Kanel by default. */
const HORSE_MODELS: Record<string, string> = {
  kanel: 'kanel',
  '#6b4423': 'horse-bay',
  '#e9dfc4': 'horse-white',
  '#3a2a1e': 'horse-black',
  '#a0703a': 'horse-dun',
};

export function buildHorse(opts: { saddle?: boolean; coat?: string } = {}): Horse {
  const coat = opts.coat ?? '#b5652b';
  const dark = '#4a2a14';
  const horse = new THREE.Group() as Horse;

  // Barrel body with a deeper chest in front and a rounded rump behind.
  const body = new THREE.Group();
  body.add(part(new THREE.CapsuleGeometry(0.44, 1.2, 6, 16), coat, [0, 0, 0], [Math.PI / 2, 0, 0]));
  body.add(part(new THREE.SphereGeometry(0.5, 16, 12), coat, [0, 0.05, -0.62]));
  body.add(part(new THREE.SphereGeometry(0.5, 16, 12), coat, [0, 0.08, 0.6]));
  body.position.y = 1.45;
  horse.add(body);

  // Legs: thick upper leg, slim cannon, fetlock and hoof.
  const legs: THREE.Object3D[] = [];
  for (const [x, z] of [
    [-0.26, -0.72],
    [0.26, -0.72],
    [-0.26, 0.7],
    [0.26, 0.7],
  ] as const) {
    const leg = new THREE.Group();
    leg.add(part(new THREE.CylinderGeometry(0.15, 0.1, 0.6, 10), coat, [0, -0.25, 0]));
    leg.add(part(new THREE.CylinderGeometry(0.075, 0.075, 0.5, 8), coat, [0, -0.78, 0]));
    leg.add(part(new THREE.SphereGeometry(0.095, 8, 6), coat, [0, -1.03, 0]));
    leg.add(part(new THREE.CylinderGeometry(0.1, 0.13, 0.14, 10), dark, [0, -1.13, 0]));
    // White socks on the front legs.
    if (z < 0)
      leg.add(part(new THREE.CylinderGeometry(0.085, 0.1, 0.2, 10), '#f5efe2', [0, -0.96, 0]));
    leg.position.set(x, 1.2, z);
    horse.add(leg);
    legs.push(leg);
  }

  // Neck rises forward from the chest; the head hangs from its top and can nod.
  const neck = new THREE.Group();
  neck.position.set(0, 1.62, -0.8);
  neck.add(
    part(new THREE.CylinderGeometry(0.2, 0.36, 1.0, 14), coat, [0, 0.38, -0.25], [-0.62, 0, 0]),
  );
  // Mane along the top of the neck, plus a forelock.
  neck.add(part(new THREE.BoxGeometry(0.08, 0.16, 1.0), dark, [0, 0.58, -0.08], [0.95, 0, 0]));

  const head = new THREE.Group();
  head.position.set(0, 0.82, -0.58);
  head.rotation.x = -0.75;
  // Skull/jaw, tapering face and a soft muzzle, all pointing along −z.
  const skull = part(new THREE.SphereGeometry(0.21, 14, 10), coat, [0, 0, 0]);
  skull.scale.set(0.85, 1, 1.1);
  head.add(skull);
  head.add(
    part(
      new THREE.CylinderGeometry(0.11, 0.17, 0.5, 12),
      coat,
      [0, -0.02, -0.3],
      [-Math.PI / 2, 0, 0],
    ),
  );
  const muzzle = part(new THREE.SphereGeometry(0.14, 12, 8), '#c98450', [0, -0.03, -0.56]);
  muzzle.scale.set(1, 0.9, 1.05);
  head.add(muzzle);
  head.add(
    part(new THREE.BoxGeometry(0.07, 0.02, 0.42), '#f5efe2', [0, 0.155, -0.26], [-0.12, 0, 0]),
  ); // blaze
  for (const side of [-1, 1]) {
    head.add(part(new THREE.SphereGeometry(0.04, 8, 6), '#141414', [side * 0.16, 0.07, -0.06])); // eyes
    head.add(
      part(
        new THREE.ConeGeometry(0.055, 0.2, 6),
        coat,
        [side * 0.09, 0.24, 0.08],
        [-0.25, 0, side * -0.25],
      ),
    );
    head.add(part(new THREE.SphereGeometry(0.028, 6, 4), '#1b1b1b', [side * 0.06, 0.02, -0.68])); // nostrils
  }
  head.add(part(new THREE.BoxGeometry(0.1, 0.1, 0.12), dark, [0, 0.2, 0.02], [0.3, 0, 0])); // forelock
  // Bridle: noseband and cheek straps.
  head.add(part(new THREE.TorusGeometry(0.15, 0.018, 4, 16), '#6b1f14', [0, -0.02, -0.42]));
  for (const side of [-1, 1])
    head.add(
      part(
        new THREE.BoxGeometry(0.02, 0.28, 0.03),
        '#6b1f14',
        [side * 0.17, 0.02, -0.2],
        [0.9, 0, 0],
      ),
    );
  neck.add(head);
  horse.add(neck);

  // Tail.
  const tail = new THREE.Group();
  tail.position.set(0, 1.62, 0.95);
  tail.add(
    part(new THREE.ConeGeometry(0.13, 0.9, 8), dark, [0, -0.4, 0.12], [Math.PI - 0.35, 0, 0]),
  );
  horse.add(tail);

  // Saddle blanket and saddle with horn and stirrups.
  const saddle = new THREE.Group();
  saddle.visible = opts.saddle !== false;
  horse.add(saddle);
  saddle.add(part(new THREE.BoxGeometry(0.9, 0.05, 0.75), '#c8553d', [0, 1.84, 0.02], [0, 0, 0]));
  saddle.add(part(new THREE.BoxGeometry(0.62, 0.14, 0.55), '#6b3a1a', [0, 1.92, 0.02]));
  saddle.add(part(new THREE.CylinderGeometry(0.04, 0.05, 0.16, 8), '#6b3a1a', [0, 2.05, -0.22]));
  for (const side of [-1, 1]) {
    saddle.add(part(new THREE.BoxGeometry(0.03, 0.55, 0.05), '#4a2a14', [side * 0.46, 1.62, 0.02]));
    saddle.add(
      part(
        new THREE.TorusGeometry(0.07, 0.02, 4, 10),
        '#3a3330',
        [side * 0.46, 1.33, 0.02],
        [0, Math.PI / 2, 0],
      ),
    );
  }

  // The sculpted horse (tools/models) is split at the same joints: swap its parts
  // in for the primitive ones and the animation below works unchanged.
  const sculpted = character(HORSE_MODELS[opts.coat ?? 'kanel'] ?? 'kanel');
  if (sculpted) {
    horse.updateMatrixWorld(true);
    sculpted.updateMatrixWorld(true);
    const groups: Record<string, THREE.Object3D> = { body, neck, head, tail, saddle };
    legs.forEach((leg, i) => (groups[`leg_${i}`] = leg));
    for (const [name, group] of Object.entries(groups)) {
      for (const child of [...group.children])
        if ((child as THREE.Mesh).isMesh) group.remove(child);
      const lod = sculpted.getObjectByName(`${name}_lod`);
      if (lod) group.attach(lod);
    }
  } else {
    outline(horse, 0.022);
    // Fewer draw calls: merge each moving part on its own (all of them move).
    for (const moving of [body, ...legs, head, tail, saddle])
      mergeLocal(moving).userData.moving = true;
    mergeLocal(neck).userData.moving = true;
  }

  let nextSwish = 2;
  let swish = 0;
  let followTarget: THREE.Vector3 | null = null;
  let followHeading = 0;
  let gait = 0;
  let stride = 0;
  horse.follow = (target, heading) => {
    followTarget = target;
    followHeading = heading;
  };
  horse.update = (dt, time) => {
    // Following: aim for a spot a little behind and to the left of the player.
    let speed = 0;
    if (followTarget) {
      const back = new THREE.Vector3(
        Math.sin(followHeading) * 3.5 - Math.cos(followHeading) * 2.5,
        0,
        Math.cos(followHeading) * 3.5 + Math.sin(followHeading) * 2.5,
      );
      const goal = followTarget.clone().add(back);
      const dx = goal.x - horse.position.x;
      const dz = goal.z - horse.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 25) {
        // Left far behind (e.g. after a minigame): catch up instantly.
        horse.position.set(goal.x, walkHeightAt(goal.x, goal.z), goal.z);
      } else if (dist > 1.2) {
        speed = Math.min(8, dist * 1.6);
        horse.position.x += (dx / dist) * speed * dt;
        horse.position.z += (dz / dist) * speed * dt;
        const want = Math.atan2(-dx, -dz);
        horse.rotation.y +=
          Math.atan2(Math.sin(want - horse.rotation.y), Math.cos(want - horse.rotation.y)) *
          Math.min(1, dt * 5);
      }
      horse.position.y = walkHeightAt(horse.position.x, horse.position.z);
    }
    gait += (Math.min(speed / 6, 1) - gait) * Math.min(1, dt * 6);
    stride += dt * (3 + speed * 1.2);
    if (gait > 0.02) {
      // Diagonal pairs swing together, like a trot.
      const swing = Math.sin(stride) * 0.55 * gait;
      legs[0]!.rotation.x = swing;
      legs[3]!.rotation.x = swing;
      legs[1]!.rotation.x = -swing;
      legs[2]!.rotation.x = -swing;
      body.position.y = 1.45 + Math.abs(Math.sin(stride)) * 0.08 * gait;
      neck.rotation.x = Math.sin(stride * 2) * 0.05;
      return;
    }
    // Mostly idle, now and then lowering the head to graze.
    neck.rotation.x = Math.sin(time * 0.6) * 0.04 - Math.max(0, Math.sin(time * 0.23)) * 0.55;
    head.rotation.z = Math.sin(time * 0.9) * 0.05;
    nextSwish -= dt;
    if (nextSwish < 0) {
      swish = 1;
      nextSwish = 2 + Math.random() * 4;
    }
    swish = Math.max(0, swish - dt * 1.5);
    tail.rotation.y = Math.sin(swish * Math.PI * 4) * 0.5 * swish;
    // Breathing.
    body.scale.set(1 + Math.sin(time * 1.8) * 0.012, 1 + Math.sin(time * 1.8) * 0.015, 1);
    body.position.y = 1.45;
    legs[1]!.rotation.x = legs[2]!.rotation.x = legs[3]!.rotation.x = 0;
    legs[0]!.rotation.x = Math.max(0, Math.sin(time * 0.23 + 1)) * 0.2;
  };
  return horse;
}

/** Stylised American bison: big shaggy front, hump, small horns, low head. */
function buildBison(): THREE.Object3D {
  const sculpted = character('bison');
  if (sculpted) return sculpted;
  const fur = '#5a3a22';
  const shag = '#3d2614';
  const b = new THREE.Group();
  b.add(
    part(new THREE.CapsuleGeometry(0.62, 1.1, 6, 12), fur, [0, 1.25, 0.25], [Math.PI / 2, 0, 0]),
  );
  const front = part(new THREE.SphereGeometry(0.95, 14, 10), shag, [0, 1.45, -0.55]);
  front.scale.set(0.9, 1.05, 1);
  b.add(front);
  b.add(part(new THREE.SphereGeometry(0.55, 12, 8), shag, [0, 2.05, -0.35])); // hump
  const head = part(new THREE.SphereGeometry(0.42, 12, 8), shag, [0, 1.0, -1.35]);
  head.scale.set(0.9, 1, 1.1);
  b.add(head);
  b.add(part(new THREE.ConeGeometry(0.2, 0.5, 8), shag, [0, 0.6, -1.3], [Math.PI, 0, 0])); // beard
  for (const side of [-1, 1]) {
    b.add(
      part(
        new THREE.ConeGeometry(0.06, 0.28, 6),
        '#e8dcc0',
        [side * 0.4, 1.28, -1.3],
        [0, 0, side * -1.1],
      ),
    );
    b.add(part(new THREE.SphereGeometry(0.05, 6, 4), '#111', [side * 0.24, 1.1, -1.66]));
  }
  for (const [x, z] of [
    [-0.3, -0.6],
    [0.3, -0.6],
    [-0.3, 0.8],
    [0.3, 0.8],
  ] as const) {
    b.add(part(new THREE.CapsuleGeometry(0.13, 0.7, 4, 8), fur, [x, 0.45, z]));
  }
  b.add(part(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 5), shag, [0, 1.3, 1.2], [0.5, 0, 0]));
  return mergeLocal(outline(b, 0.03));
}

/** A slowly grazing, wandering herd. */
/** A herd the photo minigame can look at and scare. */
export interface Herd extends THREE.Group, Animated {
  colliders: Circle[];
  center: THREE.Vector2;
  /** Current bison positions (ground level). */
  positions(): THREE.Vector3[];
  /** Everyone runs away from `from` for a few seconds, then settles again. */
  startle(from: THREE.Vector3): void;
}

/** A slowly grazing, wandering herd. */
export function buildBisonHerd(center: THREE.Vector2, count: number, spread = 1): Herd {
  const herd = new THREE.Group() as Herd;
  herd.center = center;
  // Two circles per bison (shaggy front + rump), refreshed as they wander.
  herd.colliders = [];
  const rand = mulberry32(77);
  const members = Array.from({ length: count }, () => {
    const bison = buildBison();
    const s = 0.85 + rand() * 0.35;
    bison.scale.setScalar(s);
    const state = {
      obj: bison,
      scale: s,
      x: center.x + (rand() - 0.5) * 40 * spread,
      z: center.y + (rand() - 0.5) * 30 * spread,
      heading: rand() * Math.PI * 2,
      walk: 0,
      timer: rand() * 5,
      flee: 0,
    };
    herd.add(bison);
    return state;
  });
  const roam = 30 * spread;
  herd.positions = () => members.map((m) => m.obj.position.clone());
  herd.startle = (from) => {
    for (const m of members) {
      m.heading =
        Math.atan2(-(m.x - from.x), -(m.z - from.z)) + Math.PI + (Math.random() - 0.5) * 0.6;
      m.walk = 7 + Math.random() * 2;
      m.flee = 3.5 + Math.random();
    }
  };
  herd.update = (dt, time) => {
    for (const m of members) {
      if (m.flee > 0) {
        // Stampede: run away, then calm down and graze where they stopped.
        m.flee -= dt;
        if (m.flee <= 0) {
          m.walk = 0;
          m.timer = 2 + Math.random() * 3;
        }
      } else {
        m.timer -= dt;
        if (m.timer < 0) {
          // Alternate between grazing and ambling a few metres.
          m.walk = m.walk > 0 ? 0 : 0.6 + Math.random() * 0.5;
          m.heading += (Math.random() - 0.5) * 1.6;
          // Drift back towards the herd centre.
          const back = Math.atan2(-(center.x - m.x), -(center.y - m.z));
          if (Math.hypot(center.x - m.x, center.y - m.z) > roam) m.heading = back;
          m.timer = 3 + Math.random() * 6;
        }
      }
      m.x -= Math.sin(m.heading) * m.walk * dt;
      m.z -= Math.cos(m.heading) * m.walk * dt;
      m.obj.position.set(m.x, heightAt(m.x, m.z), m.z);
      m.obj.rotation.y = m.heading;
      // Bob a little when running.
      if (m.flee > 0) m.obj.position.y += Math.abs(Math.sin(time * 10 + m.x)) * 0.25;
    }
    herd.colliders.length = 0;
    for (const m of members) {
      const fx = -Math.sin(m.heading);
      const fz = -Math.cos(m.heading);
      herd.colliders.push(
        { x: m.x + fx * 0.75 * m.scale, z: m.z + fz * 0.75 * m.scale, r: 0.95 * m.scale },
        { x: m.x - fx * 0.55 * m.scale, z: m.z - fz * 0.55 * m.scale, r: 0.75 * m.scale },
      );
    }
  };
  return herd;
}

/** Texas longhorn cow for the cattle pens in Støvby. */
function buildCow(rand: () => number): THREE.Object3D {
  const sculpted = character(['cow-a', 'cow-b', 'cow-c'][Math.floor(rand() * 3)]!);
  if (sculpted) return sculpted;
  const coat = ['#b5652b', '#8a4b22', '#e9dfc4', '#5b3a22'][Math.floor(rand() * 4)]!;
  const patch = rand() < 0.5 ? '#f3ecdc' : '#3d2614';
  const c = new THREE.Group();
  c.add(part(new THREE.CapsuleGeometry(0.45, 1.1, 6, 12), coat, [0, 1.1, 0], [Math.PI / 2, 0, 0]));
  c.add(part(new THREE.SphereGeometry(0.3, 10, 8), patch, [0.3, 1.25, 0.3]));
  const head = part(new THREE.BoxGeometry(0.34, 0.36, 0.55), coat, [0, 1.2, -1.05], [0.3, 0, 0]);
  c.add(head);
  c.add(part(new THREE.BoxGeometry(0.3, 0.2, 0.2), '#e0b8a0', [0, 1.02, -1.32]));
  // The famous long horns.
  for (const side of [-1, 1]) {
    c.add(
      part(
        new THREE.CylinderGeometry(0.02, 0.05, 0.75, 6),
        '#efe6cf',
        [side * 0.42, 1.42, -0.95],
        [0, 0, side * -1.3],
      ),
    );
  }
  for (const [x, z] of [
    [-0.22, -0.5],
    [0.22, -0.5],
    [-0.22, 0.55],
    [0.22, 0.55],
  ] as const) {
    c.add(part(new THREE.CapsuleGeometry(0.08, 0.6, 4, 6), coat, [x, 0.4, z]));
  }
  return mergeLocal(outline(c, 0.025));
}

/** A few longhorns mooching around inside a pen (radius r). */
export function buildCattle(
  center: THREE.Vector2,
  count: number,
  r: number,
): THREE.Group & Animated {
  const g = new THREE.Group() as THREE.Group & Animated;
  const rand = mulberry32(55);
  const cows = Array.from({ length: count }, () => {
    const cow = buildCow(rand);
    g.add(cow);
    return {
      cow,
      x: center.x + (rand() - 0.5) * r,
      z: center.y + (rand() - 0.5) * r,
      h: rand() * 6,
      t: rand() * 4,
    };
  });
  g.update = (dt) => {
    for (const c of cows) {
      c.t -= dt;
      if (c.t < 0) {
        c.h += (Math.random() - 0.5) * 2;
        c.t = 3 + Math.random() * 5;
      }
      const walking = c.t % 4 > 2.5;
      if (walking) {
        c.x -= Math.sin(c.h) * 0.5 * dt;
        c.z -= Math.cos(c.h) * 0.5 * dt;
      }
      // Stay in the pen.
      const dx = c.x - center.x;
      const dz = c.z - center.y;
      const d = Math.hypot(dx, dz);
      if (d > r * 0.8) {
        c.x = center.x + (dx / d) * r * 0.8;
        c.z = center.y + (dz / d) * r * 0.8;
        c.h += Math.PI;
      }
      c.cow.position.set(c.x, heightAt(c.x, c.z), c.z);
      c.cow.rotation.y = c.h;
    }
  };
  return g;
}

/** Vultures lazily circling high above. */
export function buildVultures(center: THREE.Vector3): THREE.Group & Animated {
  const group = new THREE.Group() as THREE.Group & Animated;
  const birds = Array.from({ length: 3 }, (_, i) => {
    const bird = new THREE.Group();
    // The sculpted vulture flaps its own wings (hinged at the shoulders).
    const sculpted = character('vulture');
    let wingL: THREE.Object3D;
    let wingR: THREE.Object3D;
    if (sculpted) {
      bird.add(sculpted);
      wingL = sculpted.getObjectByName('wing_l')!;
      wingR = sculpted.getObjectByName('wing_r')!;
    } else {
      wingL = part(new THREE.BoxGeometry(1.4, 0.05, 0.4), '#1f1a17', [-0.7, 0, 0]);
      wingR = part(new THREE.BoxGeometry(1.4, 0.05, 0.4), '#1f1a17', [0.7, 0, 0]);
      bird.add(
        wingL,
        wingR,
        part(new THREE.CapsuleGeometry(0.12, 0.5, 4, 6), '#1f1a17', [0, 0, 0], [Math.PI / 2, 0, 0]),
      );
    }
    group.add(bird);
    return { bird, wingL, wingR, phase: (i / 3) * Math.PI * 2, radius: 14 + i * 5, height: i * 4 };
  });
  group.update = (_dt, time) => {
    for (const b of birds) {
      const a = time * 0.18 + b.phase;
      b.bird.position.set(
        center.x + Math.cos(a) * b.radius,
        center.y + b.height,
        center.z + Math.sin(a) * b.radius,
      );
      // Face along the circle (the model faces −z) and bank into the turn (the
      // centre is on the bird's right, so the right wing dips).
      b.bird.rotation.set(0, Math.PI - a, -0.35);
      const flap = Math.sin(time * 2 + b.phase) * 0.15;
      b.wingL.rotation.z = flap;
      b.wingR.rotation.z = -flap;
    }
  };
  return group;
}

/** Tumbleweeds bouncing across the prairie with the wind. */
export function buildTumbleweeds(): THREE.Group & Animated {
  const group = new THREE.Group() as THREE.Group & Animated;
  const rand = mulberry32(31);
  const twig = new THREE.MeshToonMaterial({ color: '#a8824a' });
  const twigDark = new THREE.MeshToonMaterial({ color: '#7e5f33' });
  const ring = new THREE.TorusGeometry(0.5, 0.018, 3, 18);
  const smallRing = new THREE.TorusGeometry(0.34, 0.016, 3, 14);
  const weeds = Array.from({ length: 6 }, (_, i) => {
    const w = new THREE.Group();
    // A tangle of randomly oriented twig rings reads as a dry bush.
    for (let k = 0; k < 14; k++) {
      const m = new THREE.Mesh(k % 2 ? ring : smallRing, k % 3 ? twig : twigDark);
      m.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
      m.castShadow = true;
      w.add(m);
    }
    group.add(mergeLocal(w));
    return { w, x: -150 + i * 55, z: -40 + i * 30, phase: i * 1.3, speed: 2.6 + rand() * 1.4 };
  });
  group.update = (dt, time) => {
    for (const t of weeds) {
      t.x += dt * t.speed;
      t.z -= dt * t.speed * 0.35;
      if (t.x > 160) t.x = -160;
      if (t.z < -160) t.z = 160;
      const bounce = Math.abs(Math.sin(time * 2.2 + t.phase)) * 0.6;
      t.w.position.set(t.x, heightAt(t.x, t.z) + 0.5 + bounce, t.z);
      t.w.rotation.z -= dt * t.speed * 1.8;
      t.w.rotation.x += dt * 0.8;
    }
  };
  return group;
}

/**
 * A small coyote pack: they trot between spots around `center`, sit now and then,
 * keep their distance from the player (trotting off if you come close), and at
 * night sit down and howl at the sky.
 */
export function buildCoyotes(
  center: THREE.Vector2,
  count: number,
  radius: number,
  player: () => THREE.Vector3,
  night: () => boolean,
): THREE.Group & Animated {
  const group = new THREE.Group() as THREE.Group & Animated;
  const rand = mulberry32(Math.floor(center.x * 31 + center.y * 17));
  type Mode = 'trot' | 'sit' | 'howl';
  const pack = Array.from({ length: count }, () => {
    const model = character('coyote') ?? primitiveCoyote();
    const root = new THREE.Group();
    root.add(model);
    group.add(root);
    const a = rand() * Math.PI * 2;
    let x = center.x + Math.cos(a) * radius * rand();
    let z = center.y + Math.sin(a) * radius * rand();
    if (inWater(x, z, 3)) [x, z] = [center.x, center.y];
    root.position.set(x, heightAt(x, z), z);
    const get = (n: string) => model.getObjectByName(n) ?? new THREE.Object3D();
    return {
      root,
      body: get('body'),
      head: get('head'),
      tail: get('tail'),
      legs: [0, 1, 2, 3].map((i) => get(`leg_${i}`)),
      goal: new THREE.Vector2(x, z),
      mode: 'sit' as Mode,
      timer: rand() * 4,
      stride: rand() * 10,
      heading: rand() * Math.PI * 2,
      howled: false,
    };
  });
  const pickGoal = (c: (typeof pack)[number], away?: THREE.Vector3) => {
    // Coyotes keep their paws dry: try a few goals until one is on dry land.
    for (let tries = 0; tries < 10; tries++) {
      if (away && tries < 5) {
        // Trot off, away from the player (turning a bit more each try).
        const dx = c.root.position.x - away.x;
        const dz = c.root.position.z - away.z;
        const a = Math.atan2(dz, dx) + (tries % 2 ? 1 : -1) * tries * 0.4;
        c.goal.set(c.root.position.x + Math.cos(a) * 16, c.root.position.z + Math.sin(a) * 16);
      } else {
        const a = rand() * Math.PI * 2;
        const r = radius * Math.sqrt(rand());
        c.goal.set(center.x + Math.cos(a) * r, center.y + Math.sin(a) * r);
      }
      if (!inWater(c.goal.x, c.goal.y, 3)) return;
    }
    c.goal.set(center.x, center.y);
  };
  group.update = (dt, time) => {
    const p = player();
    const isNight = night();
    for (const c of pack) {
      const pos = c.root.position;
      const near = Math.hypot(p.x - pos.x, p.z - pos.z);
      c.timer -= dt;
      if (near < 12 && c.mode !== 'trot') {
        c.mode = 'trot';
        pickGoal(c, p);
      } else if (c.timer <= 0) {
        // Choose what to do next: at night mostly sit and howl.
        const r = rand();
        c.mode = isNight ? (r < 0.6 ? 'howl' : r < 0.8 ? 'sit' : 'trot') : r < 0.6 ? 'trot' : 'sit';
        c.timer = c.mode === 'howl' ? 3.2 : 3 + rand() * 5;
        c.howled = false;
        if (c.mode === 'trot') pickGoal(c);
      }
      let speed = 0;
      if (c.mode === 'trot') {
        const dx = c.goal.x - pos.x;
        const dz = c.goal.y - pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.8) {
          c.mode = 'sit';
          c.timer = 2 + rand() * 4;
        } else {
          speed = near < 12 ? 6 : 3;
          pos.x += (dx / d) * speed * dt;
          pos.z += (dz / d) * speed * dt;
          const want = Math.atan2(-dx, -dz);
          c.heading +=
            Math.atan2(Math.sin(want - c.heading), Math.cos(want - c.heading)) *
            Math.min(1, dt * 6);
        }
      }
      pos.y = heightAt(pos.x, pos.z);
      c.root.rotation.y = c.heading;
      // Pose: trotting legs, sitting (front up, hind legs folded), howling (nose to the sky).
      const sitting = c.mode !== 'trot';
      const ease = Math.min(1, dt * 5);
      c.body.rotation.x += ((sitting ? 0.42 : 0) - c.body.rotation.x) * ease;
      c.body.position.y +=
        ((sitting ? 0.04 : Math.abs(Math.sin(c.stride)) * 0.03) - c.body.position.y) * ease;
      if (speed > 0) {
        c.stride += dt * speed * 3.2;
        const swing = Math.sin(c.stride) * 0.6;
        c.legs[0]!.rotation.x = swing;
        c.legs[3]!.rotation.x = swing;
        c.legs[1]!.rotation.x = -swing;
        c.legs[2]!.rotation.x = -swing;
      } else {
        c.legs[0]!.rotation.x = c.legs[1]!.rotation.x = -0.42;
        c.legs[2]!.rotation.x = c.legs[3]!.rotation.x = -1.3;
      }
      const howling = c.mode === 'howl';
      c.head.rotation.x += ((howling ? 0.75 : sitting ? -0.15 : 0.1) - c.head.rotation.x) * ease;
      c.head.rotation.y = sitting && !howling ? Math.sin(time * 0.7 + c.stride) * 0.4 : 0;
      c.tail.rotation.x = sitting ? -0.4 : Math.sin(c.stride * 2) * 0.15;
      if (howling && !c.howled && c.timer < 2.9) {
        c.howled = true;
        ambience.howl(Math.max(0, 1 - near / 120));
      }
    }
  };
  return group;
}

/** A simple stand-in coyote with the same parts, for when the models can't load. */
function primitiveCoyote(): THREE.Group {
  const fur = '#9c8062';
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);
  body.add(
    part(new THREE.CapsuleGeometry(0.16, 0.6, 4, 8), fur, [0, 0.58, 0], [Math.PI / 2, 0, 0]),
  );
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 0.8, -0.5);
  head.add(part(new THREE.ConeGeometry(0.1, 0.3, 8), fur, [0, 0.05, -0.12], [-Math.PI / 2, 0, 0]));
  for (const s of [-1, 1])
    head.add(part(new THREE.ConeGeometry(0.04, 0.14, 4), fur, [s * 0.05, 0.14, 0.02]));
  body.add(head);
  const tail = new THREE.Group();
  tail.name = 'tail';
  tail.position.set(0, 0.6, 0.48);
  tail.add(part(new THREE.CapsuleGeometry(0.05, 0.3, 4, 6), fur, [0, -0.15, 0.1], [-0.6, 0, 0]));
  body.add(tail);
  [
    [-0.09, -0.3],
    [0.09, -0.3],
    [-0.09, 0.34],
    [0.09, 0.34],
  ].forEach(([x, z], i) => {
    const leg = new THREE.Group();
    leg.name = `leg_${i}`;
    leg.position.set(x!, 0.5, z!);
    leg.add(part(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), fur, [0, -0.25, 0]));
    body.add(leg);
  });
  return outline(root, 0.015);
}
