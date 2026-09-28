/**
 * Bump whenever client/server messages or room state change incompatibly.
 * Clients with a different version are rejected and forced to update.
 */
export const PROTOCOL_VERSION = 2;

/** Close/error code the server uses when the client's protocol is outdated. */
export const ERR_OUTDATED_CLIENT = 4400;

export const ROOM_TOWN = 'town';
export const ROOM_HORSESHOE = 'hestesko';

export type TownId = 'st-louis' | 'stoevby' | 'fortet' | 'soelvkloeften' | 'promontory';

export const TOWN_MAX_PLAYERS = 16;

export interface TownJoinOptions {
  protocol: number;
  townId: TownId;
  nickname: string;
  hat: number;
}

/** Messages sent from client to server in a town room. */
export interface TownClientMessages {
  move: { x: number; y: number; z: number; ry: number };
  emote: { emote: Emote };
  /** A preset phrase (index into PHRASES); there is no free text chat. */
  say: { phrase: number };
}

/** Broadcast by the town room when someone says a preset phrase. */
export interface TownSaid {
  id: string;
  phrase: number;
}

export const EMOTES = ['wave', 'hat', 'jump'] as const;
export type Emote = (typeof EMOTES)[number];

export interface VersionInfo {
  version: string;
  protocol: number;
}
