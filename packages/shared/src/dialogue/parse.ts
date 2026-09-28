import { parse } from 'yaml';
import {
  SPEAKERS,
  type DialogueChoice,
  type DialogueLine,
  type DialogueScript,
  type SpeakerId,
} from './types.js';

/** Parses and validates a dialogue YAML file. Throws with a readable message on bad input. */
export function parseDialogue(source: string): DialogueScript {
  const doc: unknown = parse(source);
  if (!isRecord(doc) || typeof doc.id !== 'string' || !Array.isArray(doc.lines)) {
    throw new Error('Dialogue must have an "id" and a "lines" list');
  }
  const scriptId = doc.id;
  const seen = new Set<string>();

  const parseLines = (raws: unknown[]): DialogueLine[] =>
    raws.map((raw, i) => {
      if (!isRecord(raw)) throw new Error(`${scriptId}: line ${i} is not an object`);
      const { id, speaker, text, say, choices } = raw;
      if (typeof id !== 'string' || typeof text !== 'string' || typeof speaker !== 'string') {
        throw new Error(`${scriptId}: line ${i} needs id, speaker and text`);
      }
      if (say !== undefined && typeof say !== 'string') {
        throw new Error(`${scriptId}: "say" must be text`);
      }
      if (!(speaker in SPEAKERS)) throw new Error(`${scriptId}: unknown speaker "${speaker}"`);
      const fullId = `${scriptId}.${id}`;
      if (seen.has(fullId)) throw new Error(`${scriptId}: duplicate line id "${id}"`);
      seen.add(fullId);
      const line: DialogueLine = { id: fullId, speaker: speaker as SpeakerId, text: text.trim() };
      if (say) line.say = say.trim();
      if (choices !== undefined) line.choices = parseChoices(fullId, choices);
      return line;
    });

  const parseChoices = (lineId: string, raw: unknown): DialogueChoice[] => {
    if (!Array.isArray(raw) || raw.length < 2) {
      throw new Error(`${lineId}: "choices" needs at least two answers`);
    }
    return raw.map((c, i) => {
      if (!isRecord(c) || typeof c.text !== 'string') {
        throw new Error(`${lineId}: choice ${i} needs a text`);
      }
      if (c.flag !== undefined && typeof c.flag !== 'string') {
        throw new Error(`${lineId}: choice ${i} flag must be text`);
      }
      if (c.say !== undefined && typeof c.say !== 'string') {
        throw new Error(`${lineId}: choice ${i} "say" must be text`);
      }
      const choice: DialogueChoice = {
        text: c.text.trim(),
        lines: Array.isArray(c.lines) ? parseLines(c.lines) : [],
      };
      if (c.flag) choice.flag = c.flag;
      if (c.say) {
        const say = c.say.trim();
        choice.prompt = { id: `${lineId}-valg${i + 1}`, speaker: 'fortaeller', text: say };
      }
      return choice;
    });
  };

  return { id: scriptId, lines: parseLines(doc.lines) };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
