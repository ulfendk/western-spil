/** Kid-safe generated nicknames: no free text, no personal data. */
const ADJECTIVES = [
  'Hurtige',
  'Modige',
  'Kloge',
  'Stærke',
  'Glade',
  'Stille',
  'Seje',
  'Rappe',
  'Flinke',
  'Vilde',
];

const NAMES = [
  'Hans',
  'Maja',
  'Bo',
  'Ella',
  'Karl',
  'Liv',
  'Oskar',
  'Frida',
  'Emil',
  'Alma',
  'Viggo',
  'Ida',
];

export function randomNickname(rand: () => number = Math.random): string {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;
  return `${pick(ADJECTIVES)} ${pick(NAMES)}`;
}

/** Retired adjectives, mapped to their replacement. */
export const RENAMED_ADJECTIVES: Record<string, string> = { Snilde: 'Flinke' };

const ALLOWED = new Set(
  [...ADJECTIVES, ...Object.keys(RENAMED_ADJECTIVES)].flatMap((a) => NAMES.map((n) => `${a} ${n}`)),
);

/** Server-side check so a tampered client can't pick an arbitrary name. */
export function isValidNickname(name: string): boolean {
  return ALLOWED.has(name);
}
