import { settings } from '../settings.js';
import { narrator } from './narrator.js';

/** Small synthesized sound effects (no audio files needed). */

function ctx(): AudioContext | null {
  const c = narrator.audioContext();
  if (c && c.state !== 'running') void c.resume().catch(() => undefined);
  return c && c.state === 'running' ? c : null;
}

function out(c: AudioContext, volume: number): GainNode {
  const g = c.createGain();
  g.gain.value = volume * settings.volume;
  g.connect(c.destination);
  return g;
}

/** A held telegraph tone. Call the returned function to stop it. */
export function startTone(freq = 700): () => void {
  const c = ctx();
  if (!c) return () => undefined;
  const g = out(c, 0.18);
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime);
  g.gain.linearRampToValueAtTime(0.18 * settings.volume, c.currentTime + 0.01);
  o.connect(g);
  o.start();
  return () => {
    g.gain.setTargetAtTime(0, c.currentTime, 0.01);
    o.stop(c.currentTime + 0.05);
  };
}

/** A short beep at an optional future time (seconds from now). */
export function beep(
  freq: number,
  duration: number,
  volume = 0.15,
  delay = 0,
  type: OscillatorType = 'square',
) {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + delay;
  const g = out(c, 0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(volume * settings.volume, t + 0.01);
  g.gain.setTargetAtTime(0, t + duration * 0.7, duration * 0.2);
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.connect(g);
  o.start(t);
  o.stop(t + duration + 0.1);
}

/** Drum hit: a thump (bass) or a noisy rattle (snare). */
export function drum(kind: 'bass' | 'snare', delay = 0) {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + delay;
  if (kind === 'bass') {
    const g = out(c, 0);
    g.gain.setValueAtTime(0.5 * settings.volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    const o = c.createOscillator();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.25);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.35);
    return;
  }
  const len = Math.floor(c.sampleRate * 0.18);
  const buffer = c.createBuffer(1, len, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 1200;
  const g = out(c, 0.35);
  src.connect(filter).connect(g);
  src.start(t);
}

/** Frequency of a note name like "C5", "F#4". */
export function note(name: string): number {
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  if (!m) return 0;
  const steps: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  const semis = steps[m[1]!]! + (m[2] ? 1 : 0) + (Number(m[3]) - 4) * 12;
  return 440 * 2 ** (semis / 12);
}

/** Rolling thunder: filtered noise that swells and fades. Farther = later and quieter. */
export function thunder(distance = 1) {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + distance * 0.8;
  const len = Math.floor(c.sampleRate * 2.5);
  const buffer = c.createBuffer(1, len, c.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    // Brown-ish noise for a deep rumble.
    last = (last + (Math.random() * 2 - 1) * 0.08) * 0.985;
    data[i] = last * 6;
  }
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 300;
  const g = c.createGain();
  const peak = (0.5 / (0.6 + distance)) * settings.volume;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.15);
  g.gain.exponentialRampToValueAtTime(0.001, t + 2.4);
  src.connect(filter).connect(g).connect(c.destination);
  src.start(t);
}
