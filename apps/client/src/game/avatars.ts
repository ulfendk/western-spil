import * as THREE from 'three';
import { heightAt } from './world/index.js';
import { outline, part } from './toon.js';

const HAT_COLORS = [
  '#8a5a2b',
  '#2f2f2f',
  '#e9dfc4',
  '#b5462f',
  '#3d6b8a',
  '#6b8a3d',
  '#8a3d6b',
  '#d9a441',
];
const SHIRT_COLORS = ['#c8553d', '#3d6b8a', '#d9a441', '#6b8a3d', '#8a3d6b', '#e8e0cc'];
const VEST_COLORS = ['#5e3a1a', '#2f2f2f', '#7a4e2d', '#3b4a3a'];
const BANDANA_COLORS = ['#c8553d', '#3d6b8a', '#d9a441', '#6b8a3d'];
const SKIN = '#f1c9a0';

/** A cowboy figure for other players, with a floating name tag and a simple walk cycle. */
export class RemoteAvatar {
  readonly root = new THREE.Group();
  private target = new THREE.Vector3();
  private targetYaw = 0;
  private body = new THREE.Group();
  private legs: THREE.Object3D[] = [];
  private arms: THREE.Object3D[] = [];
  private rightArm: THREE.Object3D;
  private walkPhase = 0;
  private emoteTime = 0;
  private emoteKind = '';
  private bubble: THREE.Sprite | null = null;
  private bubbleTime = 0;

  constructor(nickname: string, hat: number) {
    const h = hashString(nickname);
    const shirt = SHIRT_COLORS[h % SHIRT_COLORS.length]!;
    const vest = VEST_COLORS[(h >> 3) % VEST_COLORS.length]!;
    const bandana = BANDANA_COLORS[(h >> 5) % BANDANA_COLORS.length]!;
    const hatColor = HAT_COLORS[hat % HAT_COLORS.length]!;
    const b = this.body;

    // Legs (jeans + boots), pivoting at the hip.
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.13, 0.95, 0);
      leg.add(part(new THREE.CapsuleGeometry(0.11, 0.6, 4, 8), '#3d4f6b', [0, -0.38, 0]));
      leg.add(part(new THREE.CylinderGeometry(0.12, 0.13, 0.3, 10), '#5e3a1a', [0, -0.78, 0]));
      leg.add(part(new THREE.BoxGeometry(0.16, 0.1, 0.3), '#5e3a1a', [0, -0.9, -0.06]));
      b.add(leg);
      this.legs.push(leg);
    }
    // Belt with a buckle.
    b.add(part(new THREE.CylinderGeometry(0.27, 0.27, 0.08, 14), '#3a2615', [0, 0.98, 0]));
    b.add(part(new THREE.BoxGeometry(0.1, 0.08, 0.04), '#e0b84a', [0, 0.98, -0.27]));
    // Torso: shirt with an open vest.
    const torso = part(new THREE.CapsuleGeometry(0.26, 0.45, 4, 12), shirt, [0, 1.33, 0]);
    torso.scale.z = 0.8;
    b.add(torso);
    for (const side of [-1, 1]) {
      const panel = part(
        new THREE.BoxGeometry(0.2, 0.5, 0.05),
        vest,
        [side * 0.14, 1.32, -0.2],
        [0, side * 0.35, 0],
      );
      b.add(panel);
    }
    b.add(part(new THREE.BoxGeometry(0.42, 0.5, 0.06), vest, [0, 1.32, 0.21]));
    // Arms pivoting at the shoulder.
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(side * 0.34, 1.58, 0);
      arm.add(part(new THREE.CapsuleGeometry(0.08, 0.45, 4, 8), shirt, [0, -0.28, 0]));
      arm.add(part(new THREE.SphereGeometry(0.075, 8, 6), SKIN, [0, -0.6, 0]));
      arm.rotation.z = side * 0.12;
      b.add(arm);
      this.arms.push(arm);
    }
    this.rightArm = this.arms[1]!;
    // Head with bandana, face and hat.
    b.add(part(new THREE.CylinderGeometry(0.09, 0.1, 0.12, 10), SKIN, [0, 1.72, 0]));
    b.add(part(new THREE.ConeGeometry(0.19, 0.2, 12), bandana, [0, 1.72, -0.02], [Math.PI, 0, 0]));
    b.add(part(new THREE.SphereGeometry(0.21, 16, 12), SKIN, [0, 1.93, 0]));
    b.add(part(new THREE.SphereGeometry(0.05, 8, 6), '#e8b088', [0, 1.91, -0.21])); // nose
    for (const side of [-1, 1]) {
      b.add(part(new THREE.SphereGeometry(0.028, 6, 4), '#1b1b1b', [side * 0.075, 1.98, -0.185]));
      b.add(part(new THREE.SphereGeometry(0.045, 8, 6), SKIN, [side * 0.21, 1.93, 0])); // ears
    }
    if (h % 3 === 0) {
      const tache = part(
        new THREE.CapsuleGeometry(0.025, 0.14, 4, 6),
        '#5e3a1a',
        [0, 1.855, -0.195],
        [0, 0, Math.PI / 2],
      );
      b.add(tache);
    }
    // Cowboy hat: curled brim, pinched crown and a band.
    const brim = part(new THREE.CylinderGeometry(0.42, 0.42, 0.035, 24), hatColor, [0, 2.08, 0]);
    brim.scale.x = 1.15;
    b.add(brim);
    for (const side of [-1, 1]) {
      b.add(
        part(
          new THREE.TorusGeometry(0.1, 0.03, 6, 10, Math.PI),
          hatColor,
          [side * 0.42, 2.12, 0],
          [Math.PI / 2, 0, side > 0 ? 0 : Math.PI],
        ),
      );
    }
    const crown = part(new THREE.CylinderGeometry(0.19, 0.23, 0.3, 16), hatColor, [0, 2.24, 0]);
    crown.scale.x = 0.92;
    b.add(crown);
    b.add(part(new THREE.CylinderGeometry(0.235, 0.235, 0.06, 16), '#3a2615', [0, 2.13, 0]));
    b.add(part(new THREE.BoxGeometry(0.12, 0.05, 0.3), hatColor, [0, 2.38, 0])); // crease

    this.root.add(outline(b, 0.02));
    this.root.add(nameTag(nickname));
  }

  setTarget(x: number, z: number, ry: number) {
    this.target.set(x, heightAt(x, z), z);
    this.targetYaw = ry;
    if (this.root.position.lengthSq() === 0) this.root.position.copy(this.target);
  }

  emote(kind: string) {
    if (!kind) return;
    this.emoteKind = kind;
    this.emoteTime = 1.6;
  }

  /** Comic speech bubble over the head for a few seconds. */
  say(text: string) {
    this.bubble?.removeFromParent();
    this.bubble = speechBubble(text);
    this.root.add(this.bubble);
    this.bubbleTime = 4;
  }

  update(dt: number) {
    if (this.bubble) {
      this.bubbleTime -= dt;
      if (this.bubbleTime <= 0) {
        this.bubble.removeFromParent();
        this.bubble = null;
      }
    }
    const before = this.root.position.clone();
    const k = 1 - Math.exp(-dt * 10);
    this.root.position.lerp(this.target, k);
    this.body.rotation.y += shortestAngle(this.body.rotation.y, this.targetYaw) * k;

    // Walk cycle driven by actual movement speed.
    const speed = before.distanceTo(this.root.position) / Math.max(dt, 1e-3);
    const walking = Math.min(speed / 4, 1);
    this.walkPhase += dt * (4 + speed * 1.5) * (walking > 0.05 ? 1 : 0);
    const swing = Math.sin(this.walkPhase) * 0.6 * walking;
    this.legs[0]!.rotation.x = swing;
    this.legs[1]!.rotation.x = -swing;
    this.arms[0]!.rotation.x = -swing * 0.8;
    this.body.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.05 * walking;

    if (this.emoteTime > 0) {
      this.emoteTime = Math.max(0, this.emoteTime - dt);
      if (this.emoteKind === 'wave') {
        // Raise the right arm and wave it.
        this.rightArm.rotation.x = 0;
        this.rightArm.rotation.z = 2.6 + Math.sin(this.emoteTime * 14) * 0.35;
      } else if (this.emoteKind === 'hat') {
        // Tip the hat: a little bow with the hand to the brim.
        const bow = Math.sin(Math.min(1, (1.6 - this.emoteTime) / 1.6) * Math.PI);
        this.body.rotation.x = -bow * 0.35;
        this.rightArm.rotation.x = -bow * 2.4;
      } else {
        this.body.position.y = Math.abs(Math.sin(this.emoteTime * Math.PI * 3)) * 0.5;
      }
    } else {
      this.body.rotation.x = 0;
      this.rightArm.rotation.z = THREE.MathUtils.lerp(this.rightArm.rotation.z, 0.12, k);
      this.rightArm.rotation.x = swing * 0.8;
    }
  }

  dispose() {
    this.root.removeFromParent();
  }
}

function nameTag(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.font = '52px "Patrick Hand", sans-serif';
  const w = Math.min(500, ctx.measureText(text).width + 40);
  ctx.fillStyle = 'rgba(255, 248, 225, 0.95)';
  ctx.strokeStyle = '#1b1b1b';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect((512 - w) / 2, 8, w, 80, 24);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#1b1b1b';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 50);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(2.4, 0.45, 1);
  sprite.position.y = 2.85;
  return sprite;
}

function speechBubble(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 150;
  const ctx = canvas.getContext('2d')!;
  ctx.font = '56px "Patrick Hand", sans-serif';
  const w = Math.min(620, ctx.measureText(text).width + 60);
  const x0 = (640 - w) / 2;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#1b1b1b';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(x0, 6, w, 100, 40);
  ctx.moveTo(300, 104);
  ctx.lineTo(320, 140);
  ctx.lineTo(340, 104);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#1b1b1b';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 320, 58);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(3.2, 0.75, 1);
  sprite.position.y = 3.5;
  sprite.renderOrder = 11;
  return sprite;
}

function shortestAngle(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function hashString(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}
