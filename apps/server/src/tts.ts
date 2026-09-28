import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { Request, Response } from 'express';
import { audioHash, isPiperAvailable, piperConfigFromEnv, synthesizeMp3 } from '@western/tts/piper';
import { config } from './config.js';

const MAX_TEXT_LENGTH = 300;
const cfg = piperConfigFromEnv();
const cacheDir = join(config.dataDir, 'tts');
const available = isPiperAvailable(cfg);

/** Serialise synthesis so a burst of requests can't starve the game server. */
let queue: Promise<unknown> = Promise.resolve();
const inFlight = new Map<string, Promise<void>>();

/** GET /api/tts?text=...&rate=1 — renders a dynamic line with Piper, cached on disk by content hash. */
export async function ttsHandler(req: Request, res: Response) {
  const text = typeof req.query.text === 'string' ? req.query.text.trim() : '';
  const rate = Number(req.query.rate ?? 1);
  if (!text || text.length > MAX_TEXT_LENGTH || !(rate >= 0.5 && rate <= 2)) {
    res.status(400).json({ error: 'text (max 300 tegn) og rate 0.5–2 kræves' });
    return;
  }
  if (!(await available)) {
    res.status(503).json({ error: 'Oplæsning er ikke tilgængelig' });
    return;
  }

  const opts = { lengthScale: rate };
  const file = join(cacheDir, `${audioHash(text, cfg, opts)}.mp3`);
  try {
    if (!(await exists(file))) {
      let job = inFlight.get(file);
      if (!job) {
        job = queue.then(() => synthesizeMp3(text, file, cfg, opts));
        queue = job.catch(() => undefined);
        inFlight.set(file, job);
        job.finally(() => inFlight.delete(file)).catch(() => undefined);
      }
      await job;
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(file);
  } catch (err) {
    console.error('[tts]', err);
    res.status(500).json({ error: 'Oplæsning fejlede' });
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
