import type { RegionId } from '@western/shared';
import type { Mood } from '../game/world/sky.js';
import { settings } from '../settings.js';
import { narrator } from './narrator.js';

/** How windy each region is (0–1): open desert and high mountains howl more. */
const WIND: Record<RegionId, number> = {
  'st-louis': 0.25,
  praerien: 0.5,
  fortet: 0.45,
  lejren: 0.45,
  bjergene: 0.8,
  promontory: 0.65,
};
const LEVEL = 0.07;

/**
 * Quiet synthesized nature sounds under the story: a wind bed that gusts slowly,
 * birds by day, crickets at night and rain in a storm. Ducks while a line is read.
 */
class Ambience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private wind: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private rain: GainNode | null = null;
  private region: RegionId = 'st-louis';
  private mood: Mood = 'day';
  private time = 0;
  private nextCall = 2;

  setRegion(region: RegionId) {
    this.region = region;
  }

  setMood(mood: Mood) {
    this.mood = mood;
  }

  /** Call every frame. Starts lazily once the audio context has been unlocked. */
  update(dt: number) {
    const ctx = narrator.audioContext();
    if (!ctx || ctx.state !== 'running') return;
    if (!this.master) this.build(ctx);
    const t = ctx.currentTime;
    this.time += dt;

    const duck = narrator.speaking ? 0.4 : 1;
    this.master!.gain.setTargetAtTime(LEVEL * settings.volume * duck, t, 0.3);

    // Slow gusts: two sine waves at unrelated speeds.
    const base =
      WIND[this.region] * (this.mood === 'storm' ? 1.6 : this.mood === 'night' ? 0.6 : 1);
    const gust = 0.6 + 0.25 * Math.sin(this.time * 0.23) + 0.15 * Math.sin(this.time * 0.61 + 1);
    this.wind!.gain.gain.setTargetAtTime(base * gust, t, 0.5);
    this.wind!.filter.frequency.setTargetAtTime(250 + gust * 500 * base, t, 0.5);
    this.rain!.gain.setTargetAtTime(this.mood === 'storm' ? 0.9 : 0, t, 1);

    this.nextCall -= dt;
    if (this.nextCall <= 0) {
      if (this.mood === 'night') this.crickets(ctx);
      else if (this.mood !== 'storm') this.bird(ctx);
      this.nextCall = this.mood === 'night' ? 0.8 + Math.random() * 1.5 : 3 + Math.random() * 6;
    }
  }

  private build(ctx: AudioContext) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    // A few seconds of noise, looped, feeds both the wind and the rain.
    const noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const windSrc = ctx.createBufferSource();
    windSrc.buffer = noise;
    windSrc.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    filter.Q.value = 3;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSrc.connect(filter).connect(windGain).connect(this.master);
    windSrc.start();
    this.wind = { gain: windGain, filter };

    const rainSrc = ctx.createBufferSource();
    rainSrc.buffer = noise;
    rainSrc.loop = true;
    rainSrc.playbackRate.value = 0.8;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2000;
    this.rain = ctx.createGain();
    this.rain.gain.value = 0;
    rainSrc.connect(hp).connect(this.rain).connect(this.master);
    rainSrc.start(0, 1.3);
  }

  /**
   * A coyote howl: a rising, wavering glide that falls off at the end, then a few
   * yips. `loudness` 0..1 (quieter further away).
   */
  howl(loudness: number) {
    const ctx = narrator.audioContext();
    if (!ctx || ctx.state !== 'running' || !this.master || loudness <= 0.02) return;
    const t = ctx.currentTime;
    const base = 520 + Math.random() * 120;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(base * 0.7, t);
    o.frequency.exponentialRampToValueAtTime(base * 1.35, t + 0.6);
    o.frequency.setValueAtTime(base * 1.35, t + 1.4);
    o.frequency.exponentialRampToValueAtTime(base * 0.8, t + 2.1);
    // Vibrato: a slow wobble on the pitch.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 6;
    const depth = ctx.createGain();
    depth.gain.value = base * 0.025;
    lfo.connect(depth).connect(o.frequency);
    const g = ctx.createGain();
    // The master bus sits low for the ambience; a howl should stand out a little.
    const peak = 2.4 * loudness;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.35);
    g.gain.setValueAtTime(peak, t + 1.6);
    g.gain.linearRampToValueAtTime(0, t + 2.2);
    o.connect(g).connect(this.master);
    o.start(t);
    lfo.start(t);
    o.stop(t + 2.3);
    lfo.stop(t + 2.3);
    // Two or three yips after it.
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
      const y0 = t + 2.35 + i * 0.22;
      const y = ctx.createOscillator();
      y.type = 'triangle';
      y.frequency.setValueAtTime(base * 1.5, y0);
      y.frequency.exponentialRampToValueAtTime(base * 0.9, y0 + 0.12);
      const yg = ctx.createGain();
      yg.gain.setValueAtTime(0, y0);
      yg.gain.linearRampToValueAtTime(peak * 0.7, y0 + 0.02);
      yg.gain.linearRampToValueAtTime(0, y0 + 0.13);
      y.connect(yg).connect(this.master);
      y.start(y0);
      y.stop(y0 + 0.15);
    }
  }

  /** A short two- or three-note whistle, like a meadowlark far off. */
  private bird(ctx: AudioContext) {
    if (this.region === 'promontory' && Math.random() < 0.6) return;
    const t = ctx.currentTime;
    const base = 2200 + Math.random() * 1400;
    const notes = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < notes; i++) {
      const start = t + i * 0.16;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(base * (1 + i * 0.12), start);
      o.frequency.exponentialRampToValueAtTime(base * (0.8 + i * 0.2), start + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.25, start + 0.02);
      g.gain.setTargetAtTime(0, start + 0.08, 0.03);
      o.connect(g).connect(this.master!);
      o.start(start);
      o.stop(start + 0.25);
    }
  }

  /** A burst of quick high chirps. */
  private crickets(ctx: AudioContext) {
    const t = ctx.currentTime;
    const freq = 4200 + Math.random() * 500;
    for (let i = 0; i < 3; i++) {
      const start = t + i * 0.07;
      const o = ctx.createOscillator();
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.12, start + 0.01);
      g.gain.linearRampToValueAtTime(0, start + 0.045);
      o.connect(g).connect(this.master!);
      o.start(start);
      o.stop(start + 0.06);
    }
  }
}

export const ambience = new Ambience();
