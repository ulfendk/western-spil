import { parse } from 'yaml';
import { SPEAKERS, type DialogueLine, type DialogueScript, type SpeakerId } from './types.js';

/** Parses and validates a dialogue YAML file. Throws with a readable message on bad input. */
export function parseDialogue(source: string): DialogueScript {
  const doc: unknown = parse(source);
  if (!isRecord(doc) || typeof doc.id !== 'string' || !Array.isArray(doc.lines)) {
    throw new Error('Dialogue must have an "id" and a "lines" list');
  }
  const scriptId = doc.id;
  const seen = new Set<string>();
  const lines = doc.lines.map((raw, i) => {
    if (!isRecord(raw)) throw new Error(`${scriptId}: line ${i} is not an object`);
    const { id, speaker, text, say } = raw;
    if (typeof id !== 'string' || typeof text !== 'string' || typeof speaker !== 'string') {
      throw new Error(`${scriptId}: line ${i} needs id, speaker and text`);
    }
    if (say !== undefined && typeof say !== 'string')
      throw new Error(`${scriptId}: "say" must be text`);
    if (!(speaker in SPEAKERS)) throw new Error(`${scriptId}: unknown speaker "${speaker}"`);
    const fullId = `${scriptId}.${id}`;
    if (seen.has(fullId)) throw new Error(`${scriptId}: duplicate line id "${id}"`);
    seen.add(fullId);
    const line: DialogueLine = { id: fullId, speaker: speaker as SpeakerId, text: text.trim() };
    if (say) line.say = say.trim();
    return line;
  });
  return { id: scriptId, lines };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
