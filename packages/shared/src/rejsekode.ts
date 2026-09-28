/**
 * "Rejsekode": a 6-word Danish code that identifies a save on the server.
 * Kids write it down (or keep the backup file) to restore progress on any device.
 * 64 words ^ 6 ≈ 6.9e10 combinations; the server also rate-limits lookups.
 */
export const REJSEKODE_WORDS = [
  'hest',
  'kaktus',
  'prærie',
  'sadel',
  'lasso',
  'vogn',
  'tog',
  'skinne',
  'bison',
  'fjer',
  'hat',
  'støvle',
  'sporer',
  'sheriff',
  'stjerne',
  'måne',
  'sol',
  'flod',
  'bjerg',
  'dal',
  'klippe',
  'sand',
  'guld',
  'sølv',
  'kobber',
  'lygte',
  'bål',
  'telt',
  'kløft',
  'ørn',
  'ulv',
  'ræv',
  'bjørn',
  'uglen',
  'slange',
  'damp',
  'fløjte',
  'kanon',
  'fort',
  'post',
  'brev',
  'kort',
  'kompas',
  'reb',
  'hammer',
  'søm',
  'spiger',
  'banjo',
  'kaffe',
  'bønner',
  'brød',
  'æble',
  'kanel',
  'mule',
  'ko',
  'kalv',
  'kvæg',
  'hegn',
  'brønd',
  'mølle',
  'vind',
  'sky',
  'regn',
  'lyn',
] as const;

export function generateRejsekode(randomInt: (max: number) => number): string {
  return Array.from({ length: 6 }, () => REJSEKODE_WORDS[randomInt(REJSEKODE_WORDS.length)]).join(
    '-',
  );
}

const WORD_SET = new Set<string>(REJSEKODE_WORDS);

/** Normalises user input ("Hest Kaktus, ...") to canonical form, or null if invalid. */
export function normalizeRejsekode(input: string): string | null {
  const words = input
    .toLowerCase()
    .split(/[\s,.\-_]+/)
    .filter(Boolean);
  if (words.length !== 6 || !words.every((w) => WORD_SET.has(w))) return null;
  return words.join('-');
}
