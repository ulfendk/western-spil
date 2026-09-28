import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ROOM_TOWN } from '@western/shared';
import { config } from './config.js';
import { scheduleBackups } from './db.js';
import { configureHttp } from './http.js';
import { TownRoom } from './rooms/TownRoom.js';

const server = new Server({
  transport: new WebSocketTransport({
    // Keep idle town connections alive through reverse proxies.
    pingInterval: 15_000,
    pingMaxRetries: 3,
  }),
  express: configureHttp,
  greet: false,
});

// One room per town; filterBy shards players of the same town into rooms of up to 16.
server.define(ROOM_TOWN, TownRoom).filterBy(['townId']);

scheduleBackups();

await server.listen(config.port, '0.0.0.0');
console.log(
  `[server] Kanel og Grønskollingen ${config.appVersion} listening on :${config.port} (client: ${config.clientDir})`,
);
