import { Callbacks, Client, type Room } from '@colyseus/sdk';
import {
  ERR_OUTDATED_CLIENT,
  PROTOCOL_VERSION,
  ROOM_TOWN,
  type Emote,
  type TownId,
  type TownJoinOptions,
} from '@western/shared';
import { updater } from '../pwa/updater.js';
import { colyseusEndpoint } from './endpoint.js';

export interface RemotePlayer {
  nickname: string;
  hat: number;
  x: number;
  y: number;
  z: number;
  ry: number;
  emote: string;
}

/** Decoded via schema reflection; the server's TownState defines the real shape. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TownRoom = Room<any, any>;

export interface TownEvents {
  onJoin(id: string, p: RemotePlayer): void;
  onChange(id: string, p: RemotePlayer): void;
  onLeave(id: string): void;
  onStatus(status: 'online' | 'offline', count: number): void;
}

/** Connection to a shared frontier town. The game keeps working solo if this fails. */
export class TownConnection {
  private room: TownRoom | null = null;
  private lastSent = 0;
  private closed = false;

  constructor(private events: TownEvents) {}

  async join(townId: TownId, nickname: string, hat: number) {
    const client = new Client(colyseusEndpoint());
    const options: TownJoinOptions = { protocol: PROTOCOL_VERSION, townId, nickname, hat };
    try {
      const room = await client.joinOrCreate(ROOM_TOWN, options);
      if (this.closed) {
        void room.leave();
        return;
      }
      this.room = room;
      this.bind(room);
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code === ERR_OUTDATED_CLIENT) void updater.forceUpdate();
      console.warn('[town] offline:', err);
      this.events.onStatus('offline', 0);
    }
  }

  private bind(room: TownRoom) {
    const cb = Callbacks.get(room);
    const count = (): number => room.state?.players?.size ?? 0;
    cb.onAdd('players', (value, key) => {
      const player = value as RemotePlayer;
      const id = String(key);
      this.events.onStatus('online', count());
      if (id === room.sessionId) return;
      this.events.onJoin(id, player);
      cb.onChange(player, () => this.events.onChange(id, player));
    });
    cb.onRemove('players', (_value, key) => {
      const id = String(key);
      this.events.onStatus('online', count());
      this.events.onLeave(id);
    });
    room.onLeave(() => this.events.onStatus('offline', 0));
  }

  /** Sends our position at most 10 times per second. */
  sendMove(x: number, y: number, z: number, ry: number) {
    const now = performance.now();
    if (!this.room || now - this.lastSent < 100) return;
    this.lastSent = now;
    this.room.send('move', { x, y, z, ry });
  }

  sendEmote(emote: Emote) {
    this.room?.send('emote', { emote });
  }

  leave() {
    this.closed = true;
    void this.room?.leave();
    this.room = null;
  }
}
