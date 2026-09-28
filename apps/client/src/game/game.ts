import * as THREE from 'three';
import type { Emote } from '@western/shared';
import { TownConnection } from '../net/town.js';
import { settings } from '../settings.js';
import { RemoteAvatar } from './avatars.js';
import { Controls } from './controls.js';
import { autoQuality, ComicRenderer, qualityProfile } from './render.js';
import { buildWorld, heightAt, SUN_DIR, WORLD_HALF, type World } from './world/index.js';

const EYE_HEIGHT = 1.7;
const WALK_SPEED = 5;
const SPRINT_SPEED = 9;
const PLAYER_RADIUS = 0.4;
const SHADOW_RANGE = 45;

export interface GameHooks {
  onPause(): void;
  onPlayers(count: number, online: boolean): void;
}

/** The first-person prairie scene (M0 playground) with shared-town presence. */
export class Game {
  private renderer: ComicRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(70, 1, 0.1, 2500);
  private timer = new THREE.Timer();
  private controls: Controls;
  private world: World;
  private remotes = new Map<string, RemoteAvatar>();
  private town: TownConnection | null = null;
  private running = false;
  private bob = 0;
  /** Game time in seconds: sum of (clamped) frame deltas, so animations never jump. */
  time = 0;

  constructor(
    canvas: HTMLCanvasElement,
    private hooks: GameHooks,
  ) {
    const profile = qualityProfile(settings.quality === 'auto' ? autoQuality() : settings.quality);
    this.renderer = new ComicRenderer(canvas, profile);
    this.world = buildWorld(this.scene, { vegetationDensity: profile.vegetationDensity });
    this.configureShadows(profile.shadows);

    this.camera.position.copy(this.world.spawn).y += EYE_HEIGHT;
    this.camera.rotation.order = 'YXZ';
    this.controls = new Controls(canvas, () => hooks.onPause());
    // Start by looking along the trail towards the camp and the west.
    this.controls.yaw = 0.25;

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.renderer.setAnimationLoop(() => this.frame());
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

  /** Debug helper: place the camera somewhere and look in a direction. */
  debugView(x: number, z: number, yaw: number, pitch = 0) {
    this.camera.position.set(x, heightAt(x, z) + EYE_HEIGHT, z);
    this.controls.yaw = yaw;
    this.controls.pitch = pitch;
  }

  pause() {
    this.running = false;
    this.controls.setEnabled(false);
  }

  emote(emote: Emote) {
    this.town?.sendEmote(emote);
  }

  private configureShadows(size: number) {
    const sun = this.world.sun;
    if (!size) return;
    sun.castShadow = true;
    sun.shadow.mapSize.set(size, size);
    const cam = sun.shadow.camera;
    cam.left = cam.bottom = -SHADOW_RANGE;
    cam.right = cam.top = SHADOW_RANGE;
    cam.near = 1;
    cam.far = 260;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
  }

  /** Keep the shadow box centred on the player, snapped to texels to avoid shimmering. */
  private followSun() {
    const sun = this.world.sun;
    const p = this.camera.position;
    const texel = (SHADOW_RANGE * 2) / Math.max(sun.shadow.mapSize.x, 1);
    const cx = Math.round(p.x / texel) * texel;
    const cz = Math.round(p.z / texel) * texel;
    sun.target.position.set(cx, heightAt(cx, cz), cz);
    sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 120);
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private frame() {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.1);
    this.time += dt;
    const time = this.time;
    if (this.running) this.updatePlayer(dt);
    else this.controls.yaw += dt * 0.03;

    this.world.update(dt, time);
    this.camera.rotation.set(this.controls.pitch, this.controls.yaw, 0);
    for (const avatar of this.remotes.values()) avatar.update(dt);
    this.followSun();
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
    const obstacles = [...this.world.dynamicColliders()];
    // Other players are solid too.
    for (const avatar of this.remotes.values()) {
      obstacles.push({ x: avatar.root.position.x, z: avatar.root.position.z, r: 0.35 });
    }
    this.world.colliders.resolve(pos, PLAYER_RADIUS, obstacles);
    pos.x = THREE.MathUtils.clamp(pos.x, -WORLD_HALF, WORLD_HALF);
    pos.z = THREE.MathUtils.clamp(pos.z, -WORLD_HALF, WORLD_HALF);

    const moving = move.lengthSq() > 0.01;
    this.bob = moving ? this.bob + dt * speed * 1.6 : 0;
    const ground = heightAt(pos.x, pos.z);
    pos.y = ground + EYE_HEIGHT + Math.sin(this.bob) * 0.06;

    this.town?.sendMove(pos.x, ground, pos.z, yaw);
  }
}
