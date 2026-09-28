import { schema, t, type SchemaType } from '@colyseus/schema';

export const HsPlayer = schema(
  {
    nickname: t.string().default(''),
    score: t.uint16().default(0),
  },
  'HsPlayer',
);
export type HsPlayer = SchemaType<typeof HsPlayer>;

/** The latest throw; clients animate it whenever `seq` changes. */
export const HsThrow = schema(
  {
    seq: t.uint16().default(0),
    by: t.string().default(''),
    x: t.float32().default(0),
    z: t.float32().default(0),
    points: t.uint8().default(0),
    label: t.string().default(''),
  },
  'HsThrow',
);
export type HsThrow = SchemaType<typeof HsThrow>;

export const HorseshoeState = schema(
  {
    /** lobby → playing → done */
    phase: t.string().default('lobby'),
    round: t.uint8().default(1),
    throwsLeft: t.uint8().default(0),
    /** Session id of the player whose turn it is. */
    turn: t.string().default(''),
    /** Seconds left of the current turn (updated every second). */
    turnSecondsLeft: t.uint8().default(0),
    players: t.map(HsPlayer),
    /** Turn order (session ids), fixed when the game starts. */
    order: t.array('string'),
    last: HsThrow,
    /** Session ids of the winner(s) once the game is done. */
    winners: t.array('string'),
  },
  'HorseshoeState',
);
export type HorseshoeState = SchemaType<typeof HorseshoeState>;
