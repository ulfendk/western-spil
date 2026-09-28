import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allLines, parseDialogue, PHRASES } from './index.js';

const storyDir = join(import.meta.dirname, '../../../content/story');
const scripts = readdirSync(storyDir)
  .filter((f) => f.endsWith('.yaml'))
  .map((f) => parseDialogue(readFileSync(join(storyDir, f), 'utf8')));

describe('story content', () => {
  it('parses every dialogue file with unique script ids', () => {
    const ids = scripts.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has a voiced line for every preset phrase', () => {
    const fraser = scripts.find((s) => s.id === 'fraser')!;
    const lines = new Map(allLines(fraser).map((l) => [l.id, l.text]));
    for (const p of PHRASES) expect(lines.get(`fraser.${p.id}`)).toBe(p.text);
  });
});
