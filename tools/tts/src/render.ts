/**
 * Pre-renders every dialogue line in content/story/*.yaml to MP3 with Piper
 * and writes manifest.json (line id -> file name) next to them.
 *
 *   OUT_DIR=path npm run tts
 *
 * Without Piper installed it only writes the manifest with no entries, so the
 * client falls back to the runtime /api/tts endpoint (or subtitles only).
 */
import { readdir, readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDialogue, SPEAKERS, type NarrationManifest } from '@western/shared';
import { audioHash, isPiperAvailable, piperConfigFromEnv, synthesizeMp3 } from './piper.js';

const root = resolve(fileURLToPath(import.meta.url), '../../../..');
const contentDir = join(root, 'content/story');
const outDir = resolve(process.env.OUT_DIR ?? join(root, 'apps/client/public/narration'));

const cfg = piperConfigFromEnv();
const piper = await isPiperAvailable(cfg);
if (!piper)
  console.warn(`[tts] Piper not found (${cfg.bin}, ${cfg.voice}); writing empty manifest`);

await mkdir(outDir, { recursive: true });
const manifest: NarrationManifest = {};
let rendered = 0;
let cached = 0;

for (const file of (await readdir(contentDir)).filter((f) => f.endsWith('.yaml')).sort()) {
  const script = parseDialogue(await readFile(join(contentDir, file), 'utf8'));
  for (const line of script.lines) {
    if (!piper) continue;
    const opts = { lengthScale: SPEAKERS[line.speaker].lengthScale };
    const name = `${audioHash(line.text, cfg, opts)}.mp3`;
    const target = join(outDir, name);
    if (await exists(target)) {
      cached++;
    } else {
      await synthesizeMp3(line.text, target, cfg, opts);
      rendered++;
    }
    manifest[line.id] = name;
  }
}

await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`[tts] ${rendered} rendered, ${cached} cached -> ${outDir}`);

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
