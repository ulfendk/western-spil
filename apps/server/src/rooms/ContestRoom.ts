import { Room, ServerError, type Client, type Delayed } from '@colyseus/core';
import {
  canHitPoints,
  canSchedule,
  CLOCK_SLACK,
  CONTEST_COUNTDOWN,
  CONTEST_MAX_PLAYERS,
  CONTESTS,
  ERR_OUTDATED_CLIENT,
  isContestEvent,
  isContestKind,
  isValidNickname,
  plausibleProgress,
  POSTERS,
  PROTOCOL_VERSION,
  RACE,
  REGIONS,
  type CanTarget,
  type ContestEvent,
  type ContestKind,
} from '@western/shared';
import { ContestPlayer, ContestState } from './ContestState.js';

interface JoinOptions {
  protocol?: number;
  nickname?: string;
  townId?: string;
  kind?: string;
}

/** What the server remembers about each player during a game (not sent to clients). */
interface Tally {
  hits: Set<number>;
  found: Set<number>;
  lastFound: number;
  lastProgressAt: number;
}

/**
 * A town contest for 1–4 players who all play at the same time: tin cans, the
 * horse race or the wanted-poster hunt. Clients report what they did; the server
 * checks it against the shared rules and keeps the score.
 */
export class ContestRoom extends Room<{ state: ContestState }> {
  override maxClients = CONTEST_MAX_PLAYERS;
  override maxMessagesPerSecond = 20;
  override state = new ContestState();
  private kind: ContestKind = 'daaser';
  private cans: CanTarget[] = [];
  private tallies = new Map<string, Tally>();
  private timer: Delayed | null = null;
  /** Server time (ms) when play began. */
  private startedAt = 0;
  private finishers = 0;

  override onCreate(options: JoinOptions) {
    this.kind = isContestKind(options.kind) ? options.kind : 'daaser';
    this.state.kind = this.kind;
    this.onMessage('start', (client) => this.start(client));
    this.onMessage('event', (client, event: unknown) => this.event(client, event));
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
    if (!isContestKind(options.kind)) throw new ServerError(400, 'Ukendt spil');
    return true;
  }

  override onJoin(client: Client, options: JoinOptions) {
    const player = new ContestPlayer();
    player.nickname = options.nickname!;
    this.state.players.set(client.sessionId, player);
  }

  override onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.tallies.delete(client.sessionId);
    if (this.state.phase === 'playing' && this.allDone()) this.finish();
  }

  private start(client: Client) {
    if (this.state.phase !== 'lobby' || !this.state.players.has(client.sessionId)) return;
    // Nobody can join a game that has already begun.
    void this.lock();
    this.state.seed = Math.floor(Math.random() * 0xffffffff);
    this.cans = this.kind === 'daaser' ? canSchedule(this.state.seed) : [];
    this.tallies.clear();
    for (const [id, p] of this.state.players) {
      p.score = 0;
      p.progress = 0;
      p.place = 0;
      this.tallies.set(id, {
        hits: new Set(),
        found: new Set(),
        lastFound: -Infinity,
        lastProgressAt: 0,
      });
    }
    this.finishers = 0;
    this.state.winners.clear();
    this.state.phase = 'countdown';
    this.countDown(CONTEST_COUNTDOWN, () => {
      this.state.phase = 'playing';
      this.startedAt = Date.now();
      this.countDown(CONTESTS[this.kind].seconds, () => this.finish());
    });
  }

  /** Tick `secondsLeft` down once a second, then call `done`. */
  private countDown(seconds: number, done: () => void) {
    this.timer?.clear();
    this.state.secondsLeft = seconds;
    this.timer = this.clock.setInterval(() => {
      this.state.secondsLeft = Math.max(0, this.state.secondsLeft - 1);
      if (this.state.secondsLeft === 0) {
        this.timer?.clear();
        this.timer = null;
        done();
      }
    }, 1000);
  }

  /** Seconds since play began, by the server's clock. */
  private get elapsed(): number {
    return (Date.now() - this.startedAt) / 1000;
  }

  private event(client: Client, event: unknown) {
    if (this.state.phase !== 'playing' || !isContestEvent(event)) return;
    const player = this.state.players.get(client.sessionId);
    const tally = this.tallies.get(client.sessionId);
    if (!player || !tally) return;
    this.apply(event, player, tally);
    if (this.allDone()) this.finish();
  }

  private apply(event: ContestEvent, player: ContestPlayer, tally: Tally) {
    const now = this.elapsed;
    if (event.type === 'hit' && this.kind === 'daaser') {
      // The client's clock must roughly agree with ours, and each can counts once.
      if (Math.abs(event.t - now) > CLOCK_SLACK || tally.hits.has(event.id)) return;
      const points = canHitPoints(this.cans, event.id, event.t);
      if (points > 0) {
        tally.hits.add(event.id);
        player.score += points;
      }
    } else if (event.type === 'progress' && this.kind === 'loeb') {
      if (player.place > 0) return;
      const d = Math.min(event.d, RACE.length);
      if (!plausibleProgress(player.progress, d, now - tally.lastProgressAt)) return;
      player.progress = d;
      tally.lastProgressAt = now;
      if (d >= RACE.length) {
        player.place = ++this.finishers;
        player.score = 1;
      }
    } else if (event.type === 'found' && this.kind === 'plakater') {
      const p = event.poster;
      if (p < 0 || p >= POSTERS.count || tally.found.has(p)) return;
      if (now - tally.lastFound < POSTERS.minGap) return;
      tally.found.add(p);
      tally.lastFound = now;
      player.score += 1;
    }
  }

  /** The game can end early once nobody has anything left to do. */
  private allDone(): boolean {
    const players = [...this.state.players.values()];
    if (players.length === 0) return true;
    if (this.kind === 'loeb') return players.every((p) => p.place > 0);
    if (this.kind === 'plakater') return players.every((p) => p.score >= POSTERS.count);
    return false;
  }

  private finish() {
    if (this.state.phase !== 'playing') return;
    this.timer?.clear();
    this.timer = null;
    this.state.secondsLeft = 0;
    this.state.phase = 'done';
    this.state.winners.clear();
    const entries = [...this.state.players.entries()];
    if (this.kind === 'loeb') {
      // First over the line; if nobody made it, whoever got furthest.
      const first = entries.find(([, p]) => p.place === 1);
      if (first) this.state.winners.push(first[0]);
      else {
        const best = Math.max(...entries.map(([, p]) => p.progress));
        for (const [id, p] of entries)
          if (best > 0 && p.progress === best) this.state.winners.push(id);
      }
      return;
    }
    const best = Math.max(0, ...entries.map(([, p]) => p.score));
    for (const [id, p] of entries) if (best > 0 && p.score === best) this.state.winners.push(id);
  }

  /** "Spil igen": back to the lobby with the same players. */
  private reset() {
    if (this.state.phase !== 'done') return;
    for (const p of this.state.players.values()) {
      p.score = 0;
      p.progress = 0;
      p.place = 0;
    }
    this.state.winners.clear();
    this.state.phase = 'lobby';
    void this.unlock();
  }
}
