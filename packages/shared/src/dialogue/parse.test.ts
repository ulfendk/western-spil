import { describe, expect, it } from 'vitest';
import { parseDialogue } from './parse.js';

describe('parseDialogue', () => {
  it('prefixes line ids with the script id', () => {
    const script = parseDialogue(`
id: titel
lines:
  - id: hej
    speaker: kanel
    text: "Hej, grønskolling!"
`);
    expect(script.lines).toEqual([
      { id: 'titel.hej', speaker: 'kanel', text: 'Hej, grønskolling!' },
    ]);
  });

  it('rejects unknown speakers and duplicate ids', () => {
    expect(() => parseDialogue('id: a\nlines:\n  - {id: x, speaker: bob, text: hi}')).toThrow(
      /unknown speaker/,
    );
    expect(() =>
      parseDialogue(
        'id: a\nlines:\n  - {id: x, speaker: kanel, text: hi}\n  - {id: x, speaker: kanel, text: yo}',
      ),
    ).toThrow(/duplicate/);
  });
});
