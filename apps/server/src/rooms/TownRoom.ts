import { Room, ServerError, type Client } from '@colyseus/core';
import {
  EMOTES,
  ERR_OUTDATED_CLIENT,
  PROTOCOL_VERSION,
  TOWN_MAX_PLAYERS,
  isValidNickname,
  type TownClientMessages,
  type TownJoinOptions,
} from '@western/shared';
import { TownPlayer, TownState } from './TownState.js';

/** Towns are small; keep everyone inside a generous square. */
const WORLD_HALF_SIZE = 200;

export class TownRoom extends Room<{ state: TownState }> {
  override maxClients = TOWN_MAX_PLAYERS;
  override maxMessagesPerSecond = 30;
  override state = new TownState();

  override onCreate(options: TownJoinOptions) {
    this.state.townId = options.townId;
    this.patchRate = 50;

    this.onMessage('move', (client, msg: TownClientMessages['move']) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !isFiniteAll(msg.x, msg.y, msg.z, msg.ry)) return;
      player.x = clamp(msg.x, -WORLD_HALF_SIZE, WORLD_HALF_SIZE);
      player.y = clamp(msg.y, -50, 200);
      player.z = clamp(msg.z, -WORLD_HALF_SIZE, WORLD_HALF_SIZE);
      player.ry = msg.ry;
    });

    this.onMessage('emote', (client, msg: TownClientMessages['emote']) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !EMOTES.includes(msg.emote)) return;
      player.emote = msg.emote;
      this.clock.setTimeout(() => {
        if (player.emote === msg.emote) player.emote = '';
      }, 2000);
    });
  }

  override onAuth(_client: Client, options: Partial<TownJoinOptions>) {
    if (options.protocol !== PROTOCOL_VERSION) {
      throw new ServerError(ERR_OUTDATED_CLIENT, 'Klienten er forældet – opdater spillet');
    }
    if (typeof options.nickname !== 'string' || !isValidNickname(options.nickname)) {
      throw new ServerError(400, 'Ugyldigt kaldenavn');
    }
    return true;
  }

  override onJoin(client: Client, options: TownJoinOptions) {
    const player = new TownPlayer();
    player.nickname = options.nickname;
    player.hat = clamp(Math.floor(Number(options.hat) || 0), 0, 7);
    player.emote = '';
    this.state.players.set(client.sessionId, player);
  }

  override onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function isFiniteAll(...values: unknown[]): boolean {
  return values.every((v) => typeof v === 'number' && Number.isFinite(v));
}
