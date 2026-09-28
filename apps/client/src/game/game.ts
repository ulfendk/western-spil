import * as THREE from 'three';
import { PHRASES, regionInfo, type Emote, type RegionId } from '@western/shared';
import { TownConnection } from '../net/town.js';
import { settings } from '../settings.js';
import { RemoteAvatar } from './avatars.js';
import { Controls } from './controls.js';
import { autoQuality, ComicRenderer, qualityProfile, type QualityProfile } from './render.js';
import { buildWorld, heightAt, SUN_DIR, WORLD_HALF, type World } from './world/index.js';

const EYE_HEIGHT = 1.7;
const WALK_SPEED = 5;
const SPRINT_SPEED = 9;
const PLAYER_RADIUS = 0.4;
const SHADOW_RANGE = 45;

export interface GameHooks {
  onPause(): void;
  onPlayers(count: number, online: boolean): void;
  /** Called every frame while playing (story triggers, interaction prompts). */
  onFrame?(dt: number): void;
  /** A preset phrase was said nearby; `distance` is null for our own. */
  onSaid?(phrase: number, distance: number | null): void;
}

/** The first-person prairie scene (M0 playground) with shared-town presence. */
export class Game {
  private renderer: ComicRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(70, 1, 0.1, 2500);
  private timer = new THREE.Timer();
  private controls: Controls;
  private profile: QualityProfile;
  world: World;
  private player: { nickname: string; hat: number } | null = null;
  private inputLocked = false;
  private lookTarget: THREE.Vector3 | null = null;
  private marker: THREE.Sprite;
  private remotes = new Map<string, RemoteAvatar>();
  private town: TownConnection | null = null;
  private running = false;
  private bob = 0;
  /** Game time in seconds: sum of (clamped) frame deltas, so animations never jump. */
  time = 0;

  constructor(
    canvas: HTMLCanvasElement,
    private hooks: GameHooks,
    region: RegionId,
  ) {
    this.profile = qualityProfile(settings.quality === 'auto' ? autoQuality() : settings.quality);
    this.renderer = new ComicRenderer(canvas, this.profile);
    this.camera.rotation.order = 'YXZ';
    this.controls = new Controls(canvas, () => hooks.onPause());
    this.marker = buildMarker();
    this.world = this.buildRegion(region);

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.renderer.setAnimationLoop(() => this.frame());
  }

  get region(): RegionId {
    return this.world.region;
  }

  private buildRegion(region: RegionId): World {
    const world = buildWorld(this.scene, region, {
      vegetationDensity: this.profile.vegetationDensity,
    });
    this.world = world;
    this.configureShadows(this.profile.shadows);
    this.scene.add(this.marker);
    this.marker.visible = false;
    this.camera.position.copy(world.spawn).y += EYE_HEIGHT;
    // Look west along the trail.
    this.controls.yaw = region === 'st-louis' ? 0.25 : 0;
    this.controls.pitch = 0;
    this.lookTarget = null;
    return world;
  }

  /**
   * Travel to another region: tear down the current scene (freeing GPU memory),
   * build the new one and move to that region's shared town room.
   */
  loadRegion(region: RegionId) {
    this.leaveTown();
    const old = this.scene;
    this.scene = new THREE.Scene();
    disposeScene(old);
    this.buildRegion(region);
    if (this.running) this.joinTown();
  }

  /** Where the player stands (ground level). */
  get playerPosition(): THREE.Vector3 {
    const p = this.camera.position;
    return new THREE.Vector3(p.x, heightAt(p.x, p.z), p.z);
  }

  /** Horizontal direction the player is looking in. */
  get playerForward(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.controls.yaw), 0, -Math.cos(this.controls.yaw));
  }

  /** Freeze movement and look controls (during conversations and minigames). */
  lockInput(locked: boolean) {
    this.inputLocked = locked;
    this.controls.setEnabled(this.running && !locked);
    if (!locked) this.lookTarget = null;
  }

  /** Smoothly turn the camera towards a point (e.g. whoever is talking). */
  faceTowards(point: THREE.Vector3 | null) {
    this.lookTarget = point?.clone() ?? null;
  }

  /** Bouncing "!" above the next objective, or hidden with null. */
  setMarker(position: THREE.Vector3 | null) {
    this.marker.visible = !!position;
    if (position) this.marker.userData.base = position.clone();
  }

  /** Enter first-person play and join the shared town. */
  start(nickname: string, hat: number) {
    this.running = true;
    this.controls.setEnabled(!this.inputLocked);
    this.player = { nickname, hat };
    if (!this.town) this.joinTown();
  }

  private leaveTown() {
    this.town?.leave();
    this.town = null;
    for (const avatar of this.remotes.values()) avatar.dispose();
    this.remotes.clear();
    this.hooks.onPlayers(0, false);
  }

  /** Join the shared town room of the current region. */
  private joinTown() {
    if (!this.player) return;
    {
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
        onSaid: (id, phrase, self) => {
          // Our own phrase was already shown when we said it.
          if (self) return;
          const avatar = this.remotes.get(id);
          if (!avatar) return;
          avatar.say(PHRASES[phrase]!.text);
          this.hooks.onSaid?.(phrase, avatar.root.position.distanceTo(this.camera.position));
        },
      });
      void this.town.join(
        regionInfo(this.world.region).townId,
        this.player.nickname,
        this.player.hat,
      );
    }
  }

  /** Put the player somewhere (minigames, debug) and tell the other players right away. */
  setView(x: number, z: number, yaw: number, pitch = 0) {
    const ground = heightAt(x, z);
    this.camera.position.set(x, ground + EYE_HEIGHT, z);
    this.controls.yaw = yaw;
    this.controls.pitch = pitch;
    this.lookTarget = null;
    this.town?.sendMove(x, ground, z, yaw, true);
  }

  /** Move the player every frame during a scripted sequence (network updates stay throttled). */
  placePlayer(x: number, z: number, yaw: number, pitch = 0, eyeOffset = 0) {
    const ground = heightAt(x, z);
    this.camera.position.set(x, ground + EYE_HEIGHT + eyeOffset, z);
    this.controls.yaw = yaw;
    this.controls.pitch = pitch;
    this.town?.sendMove(x, ground, z, yaw);
  }

  /** Where a world point appears on screen: x/y in −1…1 (NDC), and whether it's in front. */
  project(point: THREE.Vector3): { x: number; y: number; inFront: boolean; distance: number } {
    const v = point.clone().project(this.camera);
    const toPoint = point.clone().sub(this.camera.position);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    return { x: v.x, y: v.y, inFront: toPoint.dot(forward) > 0, distance: toPoint.length() };
  }

  /** A small JPEG of the current view (for the photo album). */
  snapshot(width = 320): string {
    this.camera.rotation.set(this.controls.pitch, this.controls.yaw, 0);
    this.renderer.render(this.scene, this.camera);
    const src = this.renderer.renderer.domElement;
    const c = document.createElement('canvas');
    c.width = width;
    c.height = Math.round((width * src.height) / src.width);
    c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.72);
  }

  /** Turn the view (e.g. aiming in a minigame) without moving. */
  setYaw(yaw: number) {
    this.controls.yaw = yaw;
    const p = this.playerPosition;
    this.town?.sendMove(p.x, p.y, p.z, yaw);
  }

  get yaw(): number {
    return this.controls.yaw;
  }

  /** Debug helper: place the camera somewhere and look in a direction. */
  debugView(x: number, z: number, yaw: number, pitch = 0) {
    this.setView(x, z, yaw, pitch);
  }

  /** Add something (e.g. a flying horseshoe) to the 3D scene. */
  addToScene(obj: THREE.Object3D) {
    this.scene.add(obj);
  }

  /** Say a preset phrase: shown and heard locally right away, then sent to the others. */
  say(phrase: number) {
    this.hooks.onSaid?.(phrase, null);
    this.town?.sendSay(phrase);
  }

  /** Walking around freely (not paused and not locked by a conversation or minigame). */
  get isPlaying(): boolean {
    return this.running && !this.inputLocked;
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
    if (this.running && !this.inputLocked) this.updatePlayer(dt);
    else if (!this.running) this.controls.yaw += dt * 0.03;
    if (this.lookTarget) this.turnTowards(this.lookTarget, dt);
    this.world.setPlayerPosition(this.playerPosition, this.controls.yaw);
    if (this.marker.visible) {
      const base = this.marker.userData.base as THREE.Vector3;
      this.marker.position.set(base.x, base.y + Math.abs(Math.sin(time * 3)) * 0.35, base.z);
    }
    if (this.running) this.hooks.onFrame?.(dt);

    this.world.update(dt, time);
    this.camera.rotation.set(this.controls.pitch, this.controls.yaw, 0);
    for (const avatar of this.remotes.values()) avatar.update(dt);
    this.followSun();
    this.renderer.render(this.scene, this.camera);
  }

  private turnTowards(target: THREE.Vector3, dt: number) {
    const p = this.camera.position;
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.atan2(target.y - p.y, Math.hypot(dx, dz));
    const k = 1 - Math.exp(-dt * 4);
    this.controls.yaw +=
      Math.atan2(Math.sin(yaw - this.controls.yaw), Math.cos(yaw - this.controls.yaw)) * k;
    this.controls.pitch += (pitch - this.controls.pitch) * k;
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

/** Comic-style "!" sign that bounces above the current objective. */
function buildMarker(): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f4c95d';
  ctx.strokeStyle = '#1b1b1b';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#1b1b1b';
  ctx.font = 'bold 84px Rye, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.setScalar(0.8);
  sprite.renderOrder = 10;
  sprite.visible = false;
  return sprite;
}

/** Frees the GPU resources (geometries, materials, textures) of a scene we're leaving. */
function disposeScene(scene: THREE.Scene) {
  const materials = new Set<THREE.Material>();
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const m = mesh.material;
    if (Array.isArray(m)) m.forEach((x) => materials.add(x));
    else if (m) materials.add(m);
  });
  for (const m of materials) {
    for (const value of Object.values(m)) {
      if (value instanceof THREE.Texture) value.dispose();
    }
    m.dispose();
  }
}
