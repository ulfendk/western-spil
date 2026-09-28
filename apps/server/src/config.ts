import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '../../..');

export const config = {
  port: Number(process.env.PORT ?? 2567),
  appVersion: process.env.APP_VERSION ?? 'dev',
  /** Built client (Vite output). */
  clientDir: resolve(process.env.CLIENT_DIR ?? resolve(repoRoot, 'apps/client/dist')),
  /** Pre-rendered narration (tools/tts output). */
  narrationDir: resolve(
    process.env.NARRATION_DIR ?? resolve(repoRoot, 'apps/client/public/narration'),
  ),
  /** Persistent data volume (runtime TTS cache, later saves). */
  dataDir: resolve(process.env.DATA_DIR ?? resolve(repoRoot, '.data')),
};
