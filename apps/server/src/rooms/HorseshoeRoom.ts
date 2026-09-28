import { Room, ServerError, type Client, type Delayed } from '@colyseus/core';
import {
  ERR_OUTDATED_CLIENT,
  HORSESHOE,
  PROTOCOL_VERSION,
  isValidNickname,
  isValidThrow,
  REGIONS,
  resolveThrow,
  type ThrowInput,
} from '@western/shared';
import { HorseshoeState, HsPlayer, HsThrow } from './HorseshoeState.js';

interface JoinOptions {
  protocol?: number;
  nickname?: string;
  townId?: string;
}

/**
 * One horseshoe game for 1–4 players at a town's pit. Players gather in the
 * lobby, anyone can start, then they take turns. The server decides every throw.
 */
export class HorseshoeRoom extends Room<{ state: HorseshoeState }> {
  override maxClients = HORSESHOE.maxPlayers;
  override maxMessagesPerSecond = 10;
  override state = new HorseshoeState();
  private turnTimer: Delayed | null = null;

  override onCreate() {
    this.state.last = new HsThrow();
    this.onMessage('start', (client) => this.start(client));
    this.onMessage('throw', (client, input: ThrowInput) => this.throw(client, input));
    this.onMessage('again', () => this.reset());
  }

  override onAuth(_client: Client, options: JoinOptions) {
    if (options.protocol !== PROTOCOL_VERSION) {
      throw new ServerError(ERR_OUTDATED_CLIENT, 'Klienten er forældet – opdater spillet');
    }
    if (typeof options.nickname !== 'string' || !isValidNickname(options.nickname)) {
      throw new ServerError(400, 'Ugyldigt kaldenavn');
    }
    if (!REGIONS.some((r) => r.townId === options.townId)) {
      throw new ServerError(400, 'Ukendt by');
    }
    return true;
  }

  override onJoin(client: Client, options: JoinOptions) {
    const player = new HsPlayer();
    player.nickname = options.nickname!;
    this.state.players.set(client.sessionId, player);
  }

  override onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    const i = this.state.order.indexOf(client.sessionId);
    if (i >= 0) {
      const wasTurn = this.state.turn === client.sessionId;
      this.state.order.splice(i, 1);
      if (this.state.phase === 'playing') {
        if (this.state.order.length === 0) this.finish();
        else if (wasTurn) this.nextPlayer(i - 1);
      }
    }
  }

  private start(client: Client) {
    if (this.state.phase !== 'lobby' || !this.state.players.has(client.sessionId)) return;
    // Nobody can join a game that has already begun.
    void this.lock();
    this.state.order.clear();
    for (const id of this.state.players.keys()) this.state.order.push(id);
    this.state.phase = 'playing';
    this.state.round = 1;
    this.beginTurn(this.state.order[0]!);
  }

  private throw(client: Client, input: ThrowInput) {
    if (this.state.phase !== 'playing' || this.state.turn !== client.sessionId) return;
    if (!isValidThrow(input)) return;
    this.applyThrow(client.sessionId, resolveThrow(input, Math.random));
  }

  private applyThrow(by: string, result: ReturnType<typeof resolveThrow>) {
    const player = this.state.players.get(by);
    if (player) player.score += result.points;
    const last = this.state.last;
    last.seq = (last.seq + 1) % 65536;
    last.by = by;
    last.x = result.x;
    last.z = result.z;
    last.points = result.points;
    last.label = result.label;

    this.state.throwsLeft -= 1;
    if (this.state.throwsLeft > 0) {
      this.startTurnTimer();
      return;
    }
    // Give everyone a moment to watch the horseshoe land before the turn moves on.
    this.stopTurnTimer();
    this.state.turn = '';
    this.clock.setTimeout(() => this.nextPlayer(this.state.order.indexOf(by)), 2200);
  }

  private nextPlayer(prevIndex: number) {
    if (this.state.phase !== 'playing') return;
    const next = prevIndex + 1;
    if (next < this.state.order.length) {
      this.beginTurn(this.state.order[next]!);
    } else if (this.state.round < HORSESHOE.rounds) {
      this.state.round += 1;
      this.beginTurn(this.state.order[0]!);
    } else {
      this.finish();
    }
  }

  private beginTurn(id: string) {
    this.state.turn = id;
    this.state.throwsLeft = HORSESHOE.throwsPerTurn;
    this.startTurnTimer();
  }

  /** A player who wanders off doesn't hold up the game: their turn is skipped. */
  private startTurnTimer() {
    this.stopTurnTimer();
    this.state.turnSecondsLeft = HORSESHOE.turnTimeout;
    this.turnTimer = this.clock.setInterval(() => {
      this.state.turnSecondsLeft = Math.max(0, this.state.turnSecondsLeft - 1);
      if (this.state.turnSecondsLeft === 0) {
        this.stopTurnTimer();
        const current = this.state.turn;
        this.state.turn = '';
        this.nextPlayer(this.state.order.indexOf(current));
      }
    }, 1000);
  }

  private stopTurnTimer() {
    this.turnTimer?.clear();
    this.turnTimer = null;
  }

  private finish() {
    this.stopTurnTimer();
    this.state.turn = '';
    this.state.phase = 'done';
    let best = -1;
    this.state.winners.clear();
    for (const [id, p] of this.state.players) {
      if (p.score > best) {
        best = p.score;
        this.state.winners.clear();
      }
      if (p.score === best) this.state.winners.push(id);
    }
  }

  /** "Spil igen": back to the lobby with the same players. */
  private reset() {
    if (this.state.phase !== 'done') return;
    for (const p of this.state.players.values()) p.score = 0;
    this.state.order.clear();
    this.state.winners.clear();
    this.state.phase = 'lobby';
    void this.unlock();
  }
}
