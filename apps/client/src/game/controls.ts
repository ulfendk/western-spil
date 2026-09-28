import * as THREE from 'three';
import { settings } from '../settings.js';

/**
 * First-person input for desktop (pointer lock + WASD) and touch
 * (virtual joystick on the left half, drag-to-look on the right half).
 */
export class Controls {
  yaw = 0;
  pitch = 0;
  /** Movement intent in local space: x = strafe right, y = forward. Range −1..1. */
  readonly move = new THREE.Vector2();
  sprint = false;
  enabled = false;

  private keys = new Set<string>();
  private joystickId: number | null = null;
  private joystickOrigin = new THREE.Vector2();
  private lookId: number | null = null;
  private lookLast = new THREE.Vector2();
  private joystickEl: HTMLElement;
  private knobEl: HTMLElement;

  constructor(
    private canvas: HTMLCanvasElement,
    private onPauseRequest: () => void,
  ) {
    this.joystickEl = document.createElement('div');
    this.joystickEl.className = 'joystick hidden';
    this.knobEl = document.createElement('div');
    this.knobEl.className = 'joystick-knob';
    this.joystickEl.append(this.knobEl);
    document.body.append(this.joystickEl);

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      this.keys.add(e.code);
      if (e.code === 'Escape' || e.code === 'KeyP') this.onPauseRequest();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('click', () => {
      if (this.enabled && matchMedia('(pointer: fine)').matches) {
        void canvas.requestPointerLock?.();
      }
    });
    document.addEventListener('pointerlockchange', () => {
      // Losing pointer lock (Esc) on desktop is the natural "pause" gesture.
      if (!document.pointerLockElement && this.enabled && matchMedia('(pointer: fine)').matches) {
        this.onPauseRequest();
      }
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled || document.pointerLockElement !== canvas) return;
      this.look(e.movementX * 0.0022, e.movementY * 0.0022);
    });

    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e));
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) {
      this.keys.clear();
      this.joystickId = this.lookId = null;
      this.move.set(0, 0);
      this.joystickEl.classList.add('hidden');
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }

  /** Called every frame; merges keyboard into the movement vector. */
  update() {
    if (this.joystickId !== null) return;
    const k = (...codes: string[]) => codes.some((c) => this.keys.has(c));
    this.move.set(
      (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0),
      (k('KeyW', 'ArrowUp') ? 1 : 0) - (k('KeyS', 'ArrowDown') ? 1 : 0),
    );
    if (this.move.lengthSq() > 1) this.move.normalize();
    this.sprint = k('ShiftLeft', 'ShiftRight');
  }

  private look(dx: number, dy: number) {
    const s = settings.lookSensitivity;
    this.yaw -= dx * s;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * s, -1.3, 1.3);
  }

  private onPointerDown(e: PointerEvent) {
    if (!this.enabled || e.pointerType === 'mouse') return;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Not capturable (e.g. synthetic events); tracking still works without it.
    }
    if (e.clientX < window.innerWidth / 2 && this.joystickId === null) {
      this.joystickId = e.pointerId;
      this.joystickOrigin.set(e.clientX, e.clientY);
      this.joystickEl.style.left = `${e.clientX}px`;
      this.joystickEl.style.top = `${e.clientY}px`;
      this.knobEl.style.transform = 'translate(-50%, -50%)';
      this.joystickEl.classList.remove('hidden');
    } else if (this.lookId === null) {
      this.lookId = e.pointerId;
      this.lookLast.set(e.clientX, e.clientY);
    }
  }

  private onPointerMove(e: PointerEvent) {
    if (e.pointerId === this.joystickId) {
      const radius = 60;
      const d = new THREE.Vector2(e.clientX, e.clientY).sub(this.joystickOrigin);
      if (d.length() > radius) d.setLength(radius);
      this.knobEl.style.transform = `translate(calc(-50% + ${d.x}px), calc(-50% + ${d.y}px))`;
      this.move.set(d.x / radius, -d.y / radius);
      this.sprint = d.length() > radius * 0.95;
    } else if (e.pointerId === this.lookId) {
      this.look((e.clientX - this.lookLast.x) * 0.005, (e.clientY - this.lookLast.y) * 0.005);
      this.lookLast.set(e.clientX, e.clientY);
    }
  }

  private onPointerUp(e: PointerEvent) {
    if (e.pointerId === this.joystickId) {
      this.joystickId = null;
      this.move.set(0, 0);
      this.sprint = false;
      this.joystickEl.classList.add('hidden');
    } else if (e.pointerId === this.lookId) {
      this.lookId = null;
    }
  }
}
