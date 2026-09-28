import { describe, expect, it } from 'vitest';
import { parseDialogue } from './parse.js';
import { allLines } from './types.js';

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

  it('keeps an optional spoken wording', () => {
    const script = parseDialogue(
      'id: a\nlines:\n  - {id: x, speaker: kanel, text: "Hej, makker", say: "Hej makker"}',
    );
    expect(script.lines[0]).toMatchObject({ text: 'Hej, makker', say: 'Hej makker' });
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

describe('parseDialogue choices', () => {
  const script = parseDialogue(`
id: pind
lines:
  - id: spoerg
    speaker: pind
    text: Pas på kassen.
    choices:
      - text: Hvem er de?
        flag: spurgte-om-broedrene
        say: Tryk på nummer et for at spørge hvem de er.
        lines:
          - { id: svar1, speaker: pind, text: Bøvl-brødrene! }
      - text: Jeg passer på den!
  - { id: slut, speaker: pind, text: Farvel. }
`);

  it('parses answers with follow-up lines and flags', () => {
    const choices = script.lines[0]!.choices!;
    expect(choices.map((c) => c.text)).toEqual(['Hvem er de?', 'Jeg passer på den!']);
    expect(choices[0]!.flag).toBe('spurgte-om-broedrene');
    expect(choices[0]!.lines[0]!.id).toBe('pind.svar1');
    expect(choices[1]!.lines).toEqual([]);
  });

  it('lists nested lines for voicing', () => {
    expect(allLines(script).map((l) => l.id)).toEqual([
      'pind.spoerg',
      'pind.spoerg-valg1',
      'pind.svar1',
      'pind.slut',
    ]);
    expect(script.lines[0]!.choices![0]!.prompt).toMatchObject({
      speaker: 'fortaeller',
      text: 'Tryk på nummer et for at spørge hvem de er.',
    });
  });

  it('rejects a single answer', () => {
    expect(() =>
      parseDialogue('id: a\nlines:\n  - {id: x, speaker: kanel, text: hi, choices: [{text: ok}]}'),
    ).toThrow(/at least two/);
  });
});
