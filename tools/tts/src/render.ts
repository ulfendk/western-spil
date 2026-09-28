/**
 * Collects narration for every dialogue line into OUT_DIR (served at /narration/).
 *
 *   OUT_DIR=path npm run tts
 *
 * 1. Lines pre-rendered with Røst-v3 (content/narration, see tools/voice) are copied
 *    as long as their text still matches the script.
 * 2. Anything missing or outdated falls back to Piper, if installed.
 * 3. Otherwise the line is left out and the client falls back to /api/tts or text only.
 */
import { access, copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allLines, parseDialogue, SPEAKERS, type NarrationManifest } from '@western/shared';
import { audioHash, isPiperAvailable, piperConfigFromEnv, synthesizeMp3 } from './piper.js';

interface PrerenderedEntry {
  file: string;
  text: string;
}

const root = resolve(fileURLToPath(import.meta.url), '../../../..');
const contentDir = join(root, 'content/story');
const prerenderedDir = join(root, 'content/narration');
const outDir = resolve(process.env.OUT_DIR ?? join(root, 'apps/client/public/narration'));

const prerendered = await readJson<Record<string, PrerenderedEntry>>(
  join(prerenderedDir, 'manifest.json'),
  {},
);
const cfg = piperConfigFromEnv();
const piper = await isPiperAvailable(cfg);

await mkdir(outDir, { recursive: true });
const manifest: NarrationManifest = {};
const stats = { roest: 0, piper: 0, missing: 0 };

for (const file of (await readdir(contentDir)).filter((f) => f.endsWith('.yaml')).sort()) {
  const script = parseDialogue(await readFile(join(contentDir, file), 'utf8'));
  for (const line of allLines(script)) {
    const pre = prerendered[line.id];
    if (
      pre &&
      pre.text === line.text.replace(/\s+/g, ' ') &&
      (await exists(join(prerenderedDir, pre.file)))
    ) {
      await copyFile(join(prerenderedDir, pre.file), join(outDir, pre.file));
      manifest[line.id] = pre.file;
      stats.roest++;
      continue;
    }
    if (pre)
      console.warn(`[tts] ${line.id}: text changed since it was voiced — run "npm run voice"`);
    if (!piper) {
      stats.missing++;
      continue;
    }
    const opts = { lengthScale: SPEAKERS[line.speaker].lengthScale };
    const name = `${audioHash(line.text, cfg, opts)}.mp3`;
    if (!(await exists(join(outDir, name))))
      await synthesizeMp3(line.text, join(outDir, name), cfg, opts);
    manifest[line.id] = name;
    stats.piper++;
  }
}

await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(
  `[tts] ${stats.roest} from Røst, ${stats.piper} from Piper, ${stats.missing} without audio -> ${outDir}`,
);

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}
