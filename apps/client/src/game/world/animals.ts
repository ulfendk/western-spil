import * as THREE from 'three';
import { mulberry32 } from '../noise.js';
import { outline, part } from '../toon.js';
import { heightAt } from './terrain.js';

export interface Animated {
  update(dt: number, time: number): void;
}

/**
 * Kanel: a cinnamon-coloured horse with a white blaze and a red saddle blanket.
 * Faces −z. Idles with head nods, ear flicks and tail swishes.
 */
export function buildHorse(): THREE.Group & Animated {
  const coat = '#b5652b';
  const dark = '#4a2a14';
  const horse = new THREE.Group() as THREE.Group & Animated;

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
  horse.add(part(new THREE.BoxGeometry(0.9, 0.05, 0.75), '#c8553d', [0, 1.84, 0.02], [0, 0, 0]));
  horse.add(part(new THREE.BoxGeometry(0.62, 0.14, 0.55), '#6b3a1a', [0, 1.92, 0.02]));
  horse.add(part(new THREE.CylinderGeometry(0.04, 0.05, 0.16, 8), '#6b3a1a', [0, 2.05, -0.22]));
  for (const side of [-1, 1]) {
    horse.add(part(new THREE.BoxGeometry(0.03, 0.55, 0.05), '#4a2a14', [side * 0.46, 1.62, 0.02]));
    horse.add(
      part(
        new THREE.TorusGeometry(0.07, 0.02, 4, 10),
        '#3a3330',
        [side * 0.46, 1.33, 0.02],
        [0, Math.PI / 2, 0],
      ),
    );
  }

  outline(horse, 0.022);

  let nextSwish = 2;
  let swish = 0;
  horse.update = (dt, time) => {
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
    legs[0]!.rotation.x = Math.max(0, Math.sin(time * 0.23 + 1)) * 0.2;
  };
  return horse;
}

/** Stylised American bison: big shaggy front, hump, small horns, low head. */
function buildBison(): THREE.Group {
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
  return outline(b, 0.03);
}

/** A slowly grazing, wandering herd. */
export function buildBisonHerd(center: THREE.Vector2, count: number): THREE.Group & Animated {
  const herd = new THREE.Group() as THREE.Group & Animated;
  const rand = mulberry32(77);
  const members = Array.from({ length: count }, () => {
    const bison = buildBison();
    const s = 0.85 + rand() * 0.35;
    bison.scale.setScalar(s);
    const state = {
      obj: bison,
      x: center.x + (rand() - 0.5) * 40,
      z: center.y + (rand() - 0.5) * 30,
      heading: rand() * Math.PI * 2,
      walk: 0,
      timer: rand() * 5,
    };
    herd.add(bison);
    return state;
  });
  herd.update = (dt) => {
    for (const m of members) {
      m.timer -= dt;
      if (m.timer < 0) {
        // Alternate between grazing and ambling a few metres.
        m.walk = m.walk > 0 ? 0 : 0.6 + Math.random() * 0.5;
        m.heading += (Math.random() - 0.5) * 1.6;
        // Drift back towards the herd centre.
        const back = Math.atan2(-(center.x - m.x), -(center.y - m.z));
        if (Math.hypot(center.x - m.x, center.y - m.z) > 30) m.heading = back;
        m.timer = 3 + Math.random() * 6;
      }
      m.x -= Math.sin(m.heading) * m.walk * dt;
      m.z -= Math.cos(m.heading) * m.walk * dt;
      m.obj.position.set(m.x, heightAt(m.x, m.z), m.z);
      m.obj.rotation.y = m.heading;
    }
  };
  return herd;
}

/** Vultures lazily circling high above. */
export function buildVultures(center: THREE.Vector3): THREE.Group & Animated {
  const group = new THREE.Group() as THREE.Group & Animated;
  const birds = Array.from({ length: 3 }, (_, i) => {
    const bird = new THREE.Group();
    const wingL = part(new THREE.BoxGeometry(1.4, 0.05, 0.4), '#1f1a17', [-0.7, 0, 0]);
    const wingR = part(new THREE.BoxGeometry(1.4, 0.05, 0.4), '#1f1a17', [0.7, 0, 0]);
    bird.add(
      wingL,
      wingR,
      part(new THREE.CapsuleGeometry(0.12, 0.5, 4, 6), '#1f1a17', [0, 0, 0], [Math.PI / 2, 0, 0]),
    );
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
      b.bird.rotation.set(0, -a, 0.35);
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
    group.add(w);
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
