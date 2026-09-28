import { schema, t, type SchemaType } from '@colyseus/schema';

export const TownPlayer = schema(
  {
    nickname: t.string().default(''),
    hat: t.uint8().default(0),
    x: t.float32().default(0),
    y: t.float32().default(0),
    z: t.float32().default(0),
    ry: t.float32().default(0),
    emote: t.string().default(''),
  },
  'TownPlayer',
);
export type TownPlayer = SchemaType<typeof TownPlayer>;

export const TownState = schema(
  {
    townId: t.string(),
    players: t.map(TownPlayer),
  },
  'TownState',
);
export type TownState = SchemaType<typeof TownState>;
