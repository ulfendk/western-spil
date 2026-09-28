import * as THREE from 'three';
import type { Game } from '../game/game.js';
import { h } from '../ui/dom.js';
import { toast } from '../ui/toast.js';

const WALK = 1.3;
const STEER = 2.2;

export interface BridgeResult {
  wobbles: number;
}

/**
 * Crossing the rope bridge: you walk by yourself while the wind pushes you off
 * balance. Lean back with ◀▶. Lose your balance and you take two steps back —
 * nobody falls.
 */
export function playBridge(
  game: Game,
  start: THREE.Vector3,
  end: THREE.Vector3,
  sway: (amount: number) => void,
): Promise<BridgeResult> {
  return new Promise((resolve) => {
    const dir = end.clone().sub(start).setY(0);
    const length = dir.length();
    dir.normalize();
    const yaw = Math.atan2(-dir.x, -dir.z);
    let walked = 0;
    let balance = 0;
    let gust = 0;
    let gustTimer = 1;
    let wobbles = 0;
    let lean = 0;

    const meter = h(
      'div',
      { class: 'balance-meter' },
      h('div', { class: 'balance-safe' }),
      h('div', { class: 'balance-dot' }),
    );
    const dot = meter.lastChild as HTMLElement;
    const left = h('button', { class: 'btn hs-aim' }, '◀');
    const right = h('button', { class: 'btn hs-aim' }, '▶');
    for (const [btn, d] of [
      [left, -1],
      [right, 1],
    ] as const) {
      btn.addEventListener('pointerdown', () => (lean = d));
      btn.addEventListener('pointerup', () => (lean = 0));
      btn.addEventListener('pointerleave', () => (lean = 0));
    }
    const status = h('div', { class: 'photo-counter' }, 'Hold balancen!');
    const root = h(
      'div',
      { class: 'river-ui' },
      status,
      meter,
      h('div', { class: 'hs-row' }, left, right),
    );
    document.body.append(root);
    const keys = new Set<string>();
    const onKey = (e: KeyboardEvent) => {
      if (e.type === 'keydown') keys.add(e.code);
      else keys.delete(e.code);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);

    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      gustTimer -= dt;
      if (gustTimer < 0) {
        // A new gust of wind from one side or the other.
        gust = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.45);
        gustTimer = 1.2 + Math.random() * 1.8;
      }
      const keyLean =
        (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) -
        (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
      // The arrows move the dot (lean back towards the middle to counter the wind);
      // balance slowly tips further if left alone.
      balance += (gust + balance * 0.5 + (keyLean || lean) * STEER * 0.8) * dt;
      if (Math.abs(balance) > 1) {
        wobbles++;
        balance = 0;
        walked = Math.max(0, walked - 2);
        toast('Hov! To skridt tilbage.', 1200);
      }
      walked += WALK * dt * (1 - Math.min(Math.abs(balance), 0.8));
      const p = start.clone().addScaledVector(dir, walked);
      game.roll = -balance * 0.35;
      game.placePlayer(p.x, p.z, yaw, -0.1, Math.sin(now / 250) * 0.03);
      sway(balance);
      dot.style.left = `${50 + balance * 45}%`;
      status.textContent = `${Math.round((walked / length) * 100)} % over broen`;
      if (walked >= length) {
        cancelAnimationFrame(raf);
        game.roll = 0;
        sway(0);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('keyup', onKey);
        root.remove();
        resolve({ wobbles });
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
}
