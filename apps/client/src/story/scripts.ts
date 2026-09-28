import { parseDialogue, type DialogueScript } from '@western/shared';

// Every dialogue file, bundled as text and parsed once.
const sources = import.meta.glob('../../../../content/story/*.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const scripts = new Map<string, DialogueScript>();
for (const source of Object.values(sources)) {
  const script = parseDialogue(source);
  scripts.set(script.id, script);
}

export function script(id: string): DialogueScript {
  const s = scripts.get(id);
  if (!s) throw new Error(`Unknown dialogue "${id}"`);
  return s;
}
