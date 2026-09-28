import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface PiperConfig {
  /** Path to the piper executable. */
  bin: string;
  /** Path to the .onnx voice model (its .onnx.json must sit next to it). */
  voice: string;
}

export interface SynthOptions {
  lengthScale?: number;
}

export function piperConfigFromEnv(): PiperConfig {
  return {
    bin: process.env.PIPER_BIN ?? 'piper',
    voice: process.env.PIPER_VOICE ?? '/opt/piper/voices/da_DK-talesyntese-medium.onnx',
  };
}

/** Content hash used as the audio file name, so files can be cached forever. */
export function audioHash(text: string, cfg: PiperConfig, opts: SynthOptions = {}): string {
  return createHash('sha1')
    .update(`${cfg.voice.split('/').pop()}|${opts.lengthScale ?? 1}|${text}`)
    .digest('hex')
    .slice(0, 16);
}

export async function isPiperAvailable(cfg: PiperConfig): Promise<boolean> {
  try {
    await access(cfg.voice);
    await run(cfg.bin, ['--help'], '');
    return true;
  } catch {
    return false;
  }
}

/** Renders text to an MP3 file (piper -> wav -> lame). Writes atomically. */
export async function synthesizeMp3(
  text: string,
  outFile: string,
  cfg: PiperConfig,
  opts: SynthOptions = {},
): Promise<void> {
  await mkdir(dirname(outFile), { recursive: true });
  const wav = `${outFile}.${process.pid}.wav`;
  const tmp = `${outFile}.${process.pid}.tmp`;
  try {
    await run(
      cfg.bin,
      [
        '--model',
        cfg.voice,
        '--output_file',
        wav,
        '--length_scale',
        String(opts.lengthScale ?? 1),
        '--sentence_silence',
        '0.35',
      ],
      text.replace(/\s+/g, ' ').trim() + '\n',
    );
    await run('lame', ['--quiet', '-V', '5', wav, tmp], '');
    await rename(tmp, outFile);
  } finally {
    await rm(wav, { force: true });
    await rm(tmp, { force: true });
  }
}

function run(cmd: string, args: string[], stdin: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-500)}`)),
    );
    child.stdin.end(stdin);
  });
}
