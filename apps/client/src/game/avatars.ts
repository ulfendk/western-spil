import * as THREE from 'three';
import { heightAt } from './world.js';
import { mesh, outline } from './toon.js';

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
const SHIRT_COLORS = ['#c8553d', '#3d6b8a', '#d9a441', '#6b8a3d', '#8a3d6b'];

/** A simple cowboy figure for other players, with a floating name tag. */
export class RemoteAvatar {
  readonly root = new THREE.Group();
  private target = new THREE.Vector3();
  private targetYaw = 0;
  private body: THREE.Group;
  private emoteTime = 0;

  constructor(nickname: string, hat: number) {
    this.body = new THREE.Group();
    const shirt = SHIRT_COLORS[hashString(nickname) % SHIRT_COLORS.length]!;
    const torso = mesh(new THREE.CapsuleGeometry(0.35, 0.8, 4, 10), shirt);
    torso.position.y = 1.0;
    const head = mesh(new THREE.SphereGeometry(0.28, 14, 10), '#f1c9a0');
    head.position.y = 1.75;
    const hatColor = HAT_COLORS[hat % HAT_COLORS.length]!;
    const brim = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 20), hatColor);
    brim.position.y = 1.95;
    const crown = mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.32, 16), hatColor);
    crown.position.y = 2.12;
    const legs = mesh(new THREE.BoxGeometry(0.45, 0.6, 0.25), '#3d4f6b');
    legs.position.y = 0.3;
    this.body.add(torso, head, brim, crown, legs);
    this.root.add(outline(this.body));
    this.root.add(nameTag(nickname));
  }

  setTarget(x: number, z: number, ry: number) {
    this.target.set(x, heightAt(x, z), z);
    this.targetYaw = ry;
    if (this.root.position.lengthSq() === 0) this.root.position.copy(this.target);
  }

  emote(kind: string) {
    if (kind) this.emoteTime = 1;
  }

  update(dt: number) {
    const k = 1 - Math.exp(-dt * 10);
    this.root.position.lerp(this.target, k);
    this.body.rotation.y += shortestAngle(this.body.rotation.y, this.targetYaw) * k;
    if (this.emoteTime > 0) {
      this.emoteTime = Math.max(0, this.emoteTime - dt);
      this.body.position.y = Math.abs(Math.sin(this.emoteTime * Math.PI * 3)) * 0.5;
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
  sprite.position.y = 2.7;
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
