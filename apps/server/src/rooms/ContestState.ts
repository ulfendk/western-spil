import { schema, t, type SchemaType } from '@colyseus/schema';

export const ContestPlayer = schema(
  {
    nickname: t.string().default(''),
    score: t.uint16().default(0),
    /** Race: metres run so far. */
    progress: t.float32().default(0),
    /** Race: 1st, 2nd … once over the finish line (0 = not yet). */
    place: t.uint8().default(0),
  },
  'ContestPlayer',
);
export type ContestPlayer = SchemaType<typeof ContestPlayer>;

export const ContestState = schema(
  {
    kind: t.string().default(''),
    /** lobby → countdown → playing → done */
    phase: t.string().default('lobby'),
    /** Everything random in the game comes from this, so all players get the same. */
    seed: t.uint32().default(0),
    /** Seconds left of the countdown or the game (updated every second). */
    secondsLeft: t.uint8().default(0),
    players: t.map(ContestPlayer),
    /** Session ids of the winner(s) once the game is done. */
    winners: t.array('string'),
  },
  'ContestState',
);
export type ContestState = SchemaType<typeof ContestState>;
