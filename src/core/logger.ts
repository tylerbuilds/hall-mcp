import pino from 'pino';
import type { HallConfig } from './config';

export function createLogger(cfg: HallConfig) {
  return pino({
    level: cfg.HALL_LOG_LEVEL,
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie'],
      remove: true
    }
  });
}
