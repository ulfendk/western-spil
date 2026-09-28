import { SPEAKERS, type DialogueLine, type NarrationManifest } from '@western/shared';
import { settings } from '../settings.js';

/**
 * Plays Danish narration for dialogue lines. Prefers pre-rendered audio
 * (/narration/manifest.json), falls back to the server's runtime Piper
 * endpoint, and finally to text only.
 */
class Narrator {
  private manifest: Promise<NarrationManifest> | null = null;
  private current: HTMLAudioElement | null = null;

  private loadManifest(): Promise<NarrationManifest> {
    this.manifest ??= fetch('/narration/manifest.json')
      .then((r) => (r.ok ? (r.json() as Promise<NarrationManifest>) : {}))
      .catch(() => ({}));
    return this.manifest;
  }

  /** Resolves when the line has finished playing (or immediately if audio is unavailable). */
  async play(line: DialogueLine): Promise<void> {
    this.stop();
    if (!settings.narration) return;
    const url = await this.urlFor(line);
    if (!url) return;
    try {
      // Fetch as a blob: avoids range requests that don't mix well with service-worker caches.
      const res = await fetch(url);
      if (!res.ok) return;
      const src = URL.createObjectURL(await res.blob());
      const audio = new Audio(src);
      audio.volume = settings.volume;
      this.current = audio;
      await new Promise<void>((resolve) => {
        audio.onended = audio.onerror = audio.onpause = () => resolve();
        audio.play().catch(() => resolve());
      });
      URL.revokeObjectURL(src);
    } catch {
      /* narration is best-effort */
    }
  }

  stop() {
    this.current?.pause();
    this.current = null;
  }

  private async urlFor(line: DialogueLine): Promise<string | null> {
    const file = (await this.loadManifest())[line.id];
    if (file) return `/narration/${file}`;
    const rate = SPEAKERS[line.speaker].lengthScale ?? 1;
    return `/api/tts?text=${encodeURIComponent(line.say ?? line.text)}&rate=${rate}`;
  }
}

export const narrator = new Narrator();
