import type { TownId } from './protocol.js';

/** The journey's regions, east to west. Each has a chapter and a shared town. */
export const REGIONS = [
  { id: 'st-louis', name: 'St. Louis', chapter: 1, townId: 'st-louis' },
  { id: 'praerien', name: 'Prærien', chapter: 2, townId: 'stoevby' },
  { id: 'fortet', name: 'Fortet', chapter: 3, townId: 'fortet' },
] as const satisfies readonly { id: string; name: string; chapter: number; townId: TownId }[];

export type RegionId = (typeof REGIONS)[number]['id'];

export function isRegionId(v: unknown): v is RegionId {
  return REGIONS.some((r) => r.id === v);
}

export function regionInfo(id: RegionId) {
  return REGIONS.find((r) => r.id === id)!;
}
