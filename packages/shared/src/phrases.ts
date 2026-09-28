/**
 * Preset phrases players can say to each other. Kids can't type free text, so
 * nothing unkind or personal can be sent. Each phrase is voiced (content/story/fraser.yaml,
 * line id "fraser.<id>"); the order here is the wire format, so only ever append.
 */
export const PHRASES = [
  { id: 'hej', text: 'Hej makker!' },
  { id: 'godt', text: 'Godt klaret!' },
  { id: 'hestesko', text: 'Skal vi spille hestesko?' },
  { id: 'foelg', text: 'Følg mig!' },
  { id: 'tak', text: 'Mange tak!' },
  { id: 'hjaelp', text: 'Kan du hjælpe mig?' },
  { id: 'jiha', text: 'Jiii-haa!' },
  { id: 'farvel', text: 'Farvel, makker!' },
] as const;

export function isValidPhrase(index: unknown): index is number {
  return (
    typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < PHRASES.length
  );
}
