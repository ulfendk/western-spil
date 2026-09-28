import * as THREE from 'three';
import type { Emote } from '@western/shared';
import { TownConnection } from '../net/town.js';
import { RemoteAvatar } from './avatars.js';
import { Controls } from './controls.js';
import { buildWorld, heightAt, trailX, WORLD_HALF } from './world.js';

const EYE_HEIGHT = 1.7;
const WALK_SPEED = 5;
const SPRINT_SPEED = 9;

export interface GameHooks {
  onPause(): void;
  onPlayers(count: number, online: boolean): void;
}

/** The first-person prairie scene (M0 playground) with shared-town presence. */
export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(70, 1, 0.1, 2000);
  private timer = new THREE.Timer();
  private controls: Controls;
  private remotes = new Map<string, RemoteAvatar>();
  private town: TownConnection | null = null;
  private running = false;
  private bob = 0;

  constructor(
    canvas: HTMLCanvasElement,
    private hooks: GameHooks,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    buildWorld(this.scene);

    const startZ = 40;
    this.camera.position.set(trailX(startZ), heightAt(trailX(startZ), startZ) + EYE_HEIGHT, startZ);
    this.camera.rotation.order = 'YXZ';

    this.controls = new Controls(canvas, () => hooks.onPause());
    window.addEventListener('resize', () => this.resize());
    this.resize();
    // Idle title-screen backdrop: slowly pan across the prairie.
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /** Enter first-person play and join the shared town. */
  start(nickname: string, hat: number) {
    this.running = true;
    this.controls.setEnabled(true);
    if (!this.town) {
      this.town = new TownConnection({
        onJoin: (id, p) => {
          const avatar = new RemoteAvatar(p.nickname, p.hat);
          avatar.setTarget(p.x, p.z, p.ry);
          this.remotes.set(id, avatar);
          this.scene.add(avatar.root);
        },
        onChange: (id, p) => {
          const avatar = this.remotes.get(id);
          avatar?.setTarget(p.x, p.z, p.ry);
          if (p.emote) avatar?.emote(p.emote);
        },
        onLeave: (id) => {
          this.remotes.get(id)?.dispose();
          this.remotes.delete(id);
        },
        onStatus: (status, count) => this.hooks.onPlayers(count, status === 'online'),
      });
      // M0: the prairie playground stands in for the St. Louis town hub.
      void this.town.join('st-louis', nickname, hat);
    }
  }

  pause() {
    this.running = false;
    this.controls.setEnabled(false);
  }

  emote(emote: Emote) {
    this.town?.sendEmote(emote);
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private frame() {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.1);
    if (this.running) this.updatePlayer(dt);
    else this.controls.yaw += dt * 0.03;

    this.camera.rotation.set(this.controls.pitch, this.controls.yaw, 0);
    for (const avatar of this.remotes.values()) avatar.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private updatePlayer(dt: number) {
    this.controls.update();
    const { move, sprint, yaw } = this.controls;
    const speed = sprint ? SPRINT_SPEED : WALK_SPEED;
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const pos = this.camera.position;
    pos.addScaledVector(forward, move.y * speed * dt).addScaledVector(right, move.x * speed * dt);
    pos.x = THREE.MathUtils.clamp(pos.x, -WORLD_HALF, WORLD_HALF);
    pos.z = THREE.MathUtils.clamp(pos.z, -WORLD_HALF, WORLD_HALF);

    const moving = move.lengthSq() > 0.01;
    this.bob = moving ? this.bob + dt * speed * 1.6 : 0;
    const ground = heightAt(pos.x, pos.z);
    pos.y = ground + EYE_HEIGHT + Math.sin(this.bob) * 0.06;

    this.town?.sendMove(pos.x, ground, pos.z, yaw);
  }
}
