import * as THREE from 'three';
import { beep, drum, note } from '../audio/sfx.js';
import type { Fort } from '../game/world/index.js';
import { h } from '../ui/dom.js';

const BPM = 96;
const BEAT = 60 / BPM;
/** Yankee Doodle, one note per beat (0 = rest): the fife plays it while you drum. */
const TUNE =
  'C5 C5 D5 E5 C5 E5 D5 G4 C5 C5 D5 E5 C5 0 B4 0 C5 C5 D5 E5 F5 E5 D5 C5 B4 G4 A4 B4 C5 0 C5 0'.split(
    ' ',
  );
/** Which beats have a drum note to hit (a little rest now and then). */
const PATTERN = TUNE.map((n, i) => n !== '0' && i % 8 !== 7);
const PERFECT = 0.09;
const GOOD = 0.18;

export interface ParadeResult {
  hits: number;
  total: number;
}

/**
 * The cavalry parade: drum notes slide towards a line; tap as each one reaches
 * it. Every good hit makes the soldiers take a crisp step forward; a miss makes
 * them stumble. Timing follows the clock, not frames.
 */
export function playParade(
  fort: Fort,
  setView: (x: number, z: number, yaw: number, pitch: number) => void,
): Promise<ParadeResult> {
  return new Promise((resolve) => {
    const lane = h('div', { class: 'parade-lane' }, h('div', { class: 'parade-line' }));
    const feedback = h('div', { class: 'parade-feedback' });
    const score = h('div', { class: 'photo-counter' });
    const tap = h('button', { class: 'btn btn-big parade-tap' }, '🥁 Tromme');
    const root = h('div', { class: 'parade' }, score, lane, feedback, tap);
    document.body.append(root);

    // Watch the soldiers from the side of the parade ground.
    const p = fort.parade;
    setView(p.x + 2, p.z + 9, 0.15, -0.12);
    const start0 = fort.paradeSoldiers.map((s) => s.position.clone());

    const lead = 2; // beats of count-in before the first note
    const startTime = performance.now() / 1000 + 0.3;
    const notes = PATTERN.map((on, i) => ({
      on,
      time: startTime + (lead + i) * BEAT,
      judged: false,
      el: null as HTMLElement | null,
    }));
    for (const n of notes) {
      if (!n.on) continue;
      n.el = h('div', { class: 'parade-note' }, '🥁');
      lane.append(n.el);
    }
    const total = notes.filter((n) => n.on).length;
    let hits = 0;
    let marched = 0;
    let stumble = 0;
    let nextSound = 0;
    let raf = 0;

    const judge = (now: number) => {
      const n = notes.find((x) => x.on && !x.judged && Math.abs(x.time - now) < GOOD);
      if (!n) {
        show('For tidligt!', 'miss');
        return;
      }
      n.judged = true;
      n.el?.classList.add('hit');
      hits++;
      marched++;
      drum('snare');
      show(Math.abs(n.time - now) < PERFECT ? 'Perfekt!' : 'Godt!', 'good');
    };
    const show = (text: string, kind: string) => {
      feedback.textContent = text;
      feedback.className = `parade-feedback ${kind}`;
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
        e.preventDefault();
        judge(performance.now() / 1000);
      }
    };
    tap.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      judge(performance.now() / 1000);
    });
    window.addEventListener('keydown', onKey);

    const tick = () => {
      const now = performance.now() / 1000;
      // Fife tune and bass drum, scheduled a beat at a time.
      while (nextSound < TUNE.length + lead && startTime + nextSound * BEAT < now + 0.1) {
        const delay = Math.max(0, startTime + nextSound * BEAT - now);
        if (nextSound % 2 === 0) drum('bass', delay);
        const t = TUNE[nextSound - lead];
        if (t && t !== '0') beep(note(t), BEAT * 0.8, 0.07, delay, 'triangle');
        nextSound++;
      }
      // Notes slide from the right edge to the line (at 15 %) over two beats.
      for (const n of notes) {
        if (!n.el) continue;
        const x = 15 + ((n.time - now) / (2 * BEAT)) * 85;
        n.el.style.left = `${x}%`;
        n.el.style.opacity = x > 100 ? '0' : '1';
        if (!n.judged && now - n.time > GOOD) {
          n.judged = true;
          n.el.classList.add('missed');
          stumble = 0.6;
          show('Ups!', 'miss');
        }
      }
      // Soldiers: step forward with each hit, march in place to the beat, wobble on a miss.
      const phase = ((now - startTime) / BEAT) * Math.PI;
      stumble = Math.max(0, stumble - 0.016);
      fort.paradeSoldiers.forEach((s, i) => {
        s.step(phase);
        s.position.x = THREE.MathUtils.lerp(s.position.x, start0[i]!.x + marched * 0.45, 0.1);
        s.rotation.z = Math.sin(now * 20 + i) * stumble * 0.15;
      });
      score.textContent = `🥁 ${hits} af ${total}`;
      if (now > notes[notes.length - 1]!.time + 1) {
        cancelAnimationFrame(raf);
        window.removeEventListener('keydown', onKey);
        root.remove();
        fort.paradeSoldiers.forEach((s, i) => {
          s.position.copy(start0[i]!);
          s.rotation.z = 0;
          s.step(0);
        });
        resolve({ hits, total });
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
}
