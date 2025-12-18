import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';

import { loadConfig } from './core/config.js';
import { createLogger } from './core/logger.js';
import { openDb } from './infra/db.js';
import { HallState } from './core/state.js';
import { registerRoutes } from './api/routes.js';
import { startRepoWatcher } from './infra/watcher.js';
import type { HallEvent } from './core/types.js';
import type WebSocket from 'ws';

// Recent events ring buffer (efficient circular buffer)
class EventRing {
  private buffer: HallEvent[] = [];
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  push(evt: HallEvent): void {
    if (this.buffer.length >= this.maxSize) {
      this.buffer.shift();
    }
    this.buffer.push(evt);
  }

  toArray(): HallEvent[] {
    return [...this.buffer];
  }
}

async function main() {
  const cfg = loadConfig(process.env);
  const log = createLogger(cfg);
  const app = Fastify({ logger: log });

  // Websocket clients (shared room speakers)
  const wsClients = new Set<WebSocket>();
  const eventRing = new EventRing(500);

  function broadcast(evt: HallEvent) {
    eventRing.push(evt);
    for (const client of wsClients) {
      if (client.readyState === 1) {
        client.send(JSON.stringify(evt));
      }
    }
  }

  await app.register(helmet, { global: true });
  await app.register(rateLimit, { max: cfg.HALL_RATE_LIMIT_RPM, timeWindow: '1 minute' });
  await app.register(websocket);

  const db = openDb(cfg);
  const state = new HallState(db, log);

  await registerRoutes(app, state);

  // Minimal event read API for debugging
  app.get('/api/events', async () => ({ ok: true, data: eventRing.toArray() }));

  // Websocket endpoint
  app.get('/ws', { websocket: true }, (socket) => {
    wsClients.add(socket);
    socket.send(JSON.stringify({ type: 'hall.hello', ts: Date.now() }));

    socket.on('close', () => {
      wsClients.delete(socket);
    });
  });

  // Watch repo changes and broadcast them
  const watcher = startRepoWatcher(cfg.HALL_REPO_ROOT, log, broadcast);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    log.info({ signal }, 'Shutting down...');
    await watcher.close();
    await app.close();
    db.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  app.addHook('onClose', async () => {
    db.close();
  });

  const addr = await app.listen({ port: cfg.HALL_PORT, host: cfg.HALL_BIND });
  log.info({ addr }, 'HALL listening');
}

main().catch((err) => {
  console.error('Failed to start HALL:', err);
  process.exit(1);
});
