import { h } from '../ui/dom.js';

const PEGS = 6;
/** How close (radians) the red hole must be to the hammer. */
const TOLERANCE = 0.3;

export interface WheelResult {
  misses: number;
  seconds: number;
}

/**
 * "Slå pløkkerne i": a wagon wheel turns; tap when the red peg hole passes under
 * the hammer. Six pegs and the wheel is fixed. It speeds up a little after each hit.
 */
export function playWheel(): Promise<WheelResult> {
  return new Promise((resolve) => {
    const size = Math.min(
      360,
      Math.floor(window.innerWidth * 0.8),
      Math.floor(window.innerHeight * 0.55),
    );
    const canvas = h('canvas', { width: size * 2, height: size * 2 });
    canvas.style.width = canvas.style.height = `${size}px`;
    const status = h('p', { class: 'pack-status' });
    const hit = h('button', { class: 'btn btn-big' }, 'Slå! 🔨');
    const root = h(
      'div',
      { class: 'pack wheel-game' },
      h('h2', {}, 'Reparer hjulet'),
      h('p', { class: 'pack-help' }, 'Tryk, når det røde hul er lige under hammeren.'),
      canvas,
      status,
      hit,
    );
    document.body.append(root);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(2, 2);

    const pegged = Array<boolean>(PEGS).fill(false);
    let target = 0;
    let speed = 1.3;
    // The wheel's angle is a function of the clock (not of drawn frames), so a tap is
    // judged by where the wheel really is at that instant, even on a slow device.
    let baseAngle = 0;
    let baseTime = performance.now();
    const angleAt = (t: number) => baseAngle + (speed * (t - baseTime)) / 1000;
    const setSpeed = (s: number) => {
      const now = performance.now();
      baseAngle = angleAt(now);
      baseTime = now;
      speed = s;
    };
    let angle = 0;
    let misses = 0;
    let shake = 0;
    let hammer = 0;
    let done = false;
    const started = performance.now();
    let last = started;

    const holeAngle = (i: number) => (i / PEGS) * Math.PI * 2 + angle;
    /** Signed distance from the target hole to the top (where the hammer is). */
    const offset = () => {
      const a = holeAngle(target) + Math.PI / 2;
      return Math.atan2(Math.sin(a), Math.cos(a));
    };

    const strike = () => {
      if (done) return;
      angle = angleAt(performance.now());
      hammer = 1;
      if (Math.abs(offset()) < TOLERANCE) {
        pegged[target] = true;
        const next = pegged.indexOf(false);
        if (next < 0) {
          done = true;
          baseAngle = angle;
          speed = 0;
          status.textContent = 'Hjulet sidder fast! 🎉';
          setTimeout(() => {
            cleanup();
            resolve({ misses, seconds: (performance.now() - started) / 1000 });
          }, 1300);
        } else {
          target = next;
          setSpeed(speed + 0.15);
        }
      } else {
        misses++;
        shake = 1;
      }
      updateStatus();
    };

    const updateStatus = () => {
      if (!done)
        status.textContent = `${pegged.filter(Boolean).length} af ${PEGS} pløkker · ${misses} forbi`;
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (!e.repeat) strike();
      }
    };
    hit.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      strike();
    });
    window.addEventListener('keydown', onKey);

    let raf = 0;
    const draw = (now: number) => {
      const dt = Math.max(0, Math.min((now - last) / 1000, 0.25));
      last = now;
      if (!done) angle = angleAt(performance.now());
      shake = Math.max(0, shake - dt * 4);
      hammer = Math.max(0, hammer - dt * 5);
      const c = size / 2;
      const r = size * 0.36;
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.translate(c + Math.sin(now * 0.08) * shake * 6, c + 20);
      // Rim, spokes and hub.
      ctx.lineWidth = 14;
      ctx.strokeStyle = '#5e3a1a';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#1b1b1b';
      ctx.beginPath();
      ctx.arc(0, 0, r + 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#8a5a2b';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + angle;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 18, Math.sin(a) * 18);
        ctx.lineTo(Math.cos(a) * (r - 6), Math.sin(a) * (r - 6));
        ctx.stroke();
      }
      ctx.fillStyle = '#5e3a1a';
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.fill();
      // Peg holes: done ones get a peg, the target one glows red.
      for (let i = 0; i < PEGS; i++) {
        const a = holeAngle(i);
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.fillStyle = pegged[i] ? '#d9a441' : i === target ? '#e2463a' : '#2a1a0c';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#1b1b1b';
        ctx.stroke();
      }
      ctx.restore();
      // Hammer above the top of the wheel.
      ctx.save();
      ctx.translate(c, c + 20 - r - 28);
      ctx.rotate(-0.5 + hammer * 0.9);
      ctx.fillStyle = '#6b4a2e';
      ctx.fillRect(-4, -40, 8, 40);
      ctx.fillStyle = '#6f7479';
      ctx.fillRect(-18, -52, 36, 16);
      ctx.strokeStyle = '#1b1b1b';
      ctx.lineWidth = 2;
      ctx.strokeRect(-18, -52, 36, 16);
      ctx.restore();
      // Aim mark.
      ctx.fillStyle = '#1b1b1b';
      ctx.beginPath();
      ctx.moveTo(c - 8, c + 20 - r - 20);
      ctx.lineTo(c + 8, c + 20 - r - 20);
      ctx.lineTo(c, c + 20 - r - 10);
      ctx.fill();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    updateStatus();

    function cleanup() {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      root.remove();
    }
  });
}
