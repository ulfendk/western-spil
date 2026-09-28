import { SPEAKERS, type DialogueLine, type NarrationManifest } from '@western/shared';
import { settings } from '../settings.js';

/**
 * Plays Danish narration for dialogue lines. Prefers pre-rendered audio
 * (/narration/manifest.json), falls back to the server's runtime Piper
 * endpoint, and finally to text only.
 *
 * Uses the Web Audio API rather than <audio> elements: once the context has been
 * unlocked by a tap, tablets (iPad in particular) let it play every following line
 * automatically, whereas a new <audio> element started without a tap gets blocked.
 */
class Narrator {
  private manifest: Promise<NarrationManifest> | null = null;
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private current: { source: AudioBufferSourceNode; stopped: boolean } | null = null;
  /** Incremented on every play/stop so a slow load can't start an outdated line. */
  private generation = 0;

  constructor() {
    // Browsers only allow audio after a user gesture: unlock on the first one.
    const unlock = () => {
      this.context();
      void this.ctx?.resume().catch(() => undefined);
    };
    for (const type of ['pointerdown', 'keydown', 'touchend'] as const) {
      window.addEventListener(type, unlock, { capture: true, passive: true });
    }
  }

  /** Starts downloading and decoding lines ahead of time so there's no gap between them. */
  preload(lines: DialogueLine[]) {
    if (!settings.narration) return;
    for (const line of lines) {
      void this.urlFor(line).then((url) => (url ? this.buffer(url) : null));
    }
  }

  /**
   * Resolves when the line has finished playing: true if audio played to the end,
   * false if narration is off, unavailable or was stopped.
   */
  async play(line: DialogueLine): Promise<boolean> {
    this.stop();
    const generation = this.generation;
    if (!settings.narration) return false;
    const url = await this.urlFor(line);
    const buffer = url ? await this.buffer(url) : null;
    const ctx = this.context();
    if (!buffer || !ctx || !this.gain || generation !== this.generation) return false;
    if (ctx.state !== 'running') await ctx.resume().catch(() => undefined);
    if (ctx.state !== 'running' || generation !== this.generation) return false;

    this.gain.gain.value = settings.volume;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);
    const playback = { source, stopped: false };
    this.current = playback;
    return new Promise<boolean>((resolve) => {
      source.onended = () => {
        if (this.current === playback) this.current = null;
        resolve(!playback.stopped);
      };
      source.start();
    });
  }

  /**
   * Plays a short extra clip (a phrase someone said) on top of whatever else is going on,
   * quieter the further away it is. Skipped while a conversation is being narrated.
   */
  async playExtra(line: DialogueLine, loudness = 1): Promise<void> {
    if (!settings.narration || this.current || loudness <= 0) return;
    const url = await this.urlFor(line);
    const buffer = url ? await this.buffer(url) : null;
    const ctx = this.context();
    if (!buffer || !ctx || !this.gain || ctx.state !== 'running') return;
    const gain = ctx.createGain();
    gain.gain.value = settings.volume * Math.min(1, loudness);
    gain.connect(ctx.destination);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.start();
  }

  stop() {
    this.generation++;
    if (this.current) {
      this.current.stopped = true;
      try {
        this.current.source.stop();
      } catch {
        // Already stopped.
      }
      this.current = null;
    }
  }

  /** True while a story line is being read aloud (the ambience ducks under it). */
  get speaking(): boolean {
    return this.current !== null;
  }

  /** The shared (tap-unlocked) audio context, also used for sound effects. */
  audioContext(): AudioContext | null {
    return this.context();
  }

  private context(): AudioContext | null {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.gain = this.ctx.createGain();
        this.gain.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    return this.ctx;
  }

  private buffer(url: string): Promise<AudioBuffer | null> {
    let entry = this.buffers.get(url);
    if (!entry) {
      entry = fetch(url)
        .then((res) => (res.ok ? res.arrayBuffer() : null))
        .then((data) => {
          const ctx = this.context();
          return data && ctx ? ctx.decodeAudioData(data) : null;
        })
        .catch(() => null);
      // Don't cache failures, so a flaky network gets another chance.
      void entry.then((b) => !b && this.buffers.delete(url));
      this.buffers.set(url, entry);
    }
    return entry;
  }

  private loadManifest(): Promise<NarrationManifest> {
    this.manifest ??= fetch('/narration/manifest.json')
      .then((r) => (r.ok ? (r.json() as Promise<NarrationManifest>) : {}))
      .catch(() => ({}));
    return this.manifest;
  }

  private async urlFor(line: DialogueLine): Promise<string | null> {
    const file = (await this.loadManifest())[line.id];
    if (file) return `/narration/${file}`;
    const rate = SPEAKERS[line.speaker].lengthScale ?? 1;
    return `/api/tts?text=${encodeURIComponent(line.say ?? line.text)}&rate=${rate}`;
  }
}

export const narrator = new Narrator();
