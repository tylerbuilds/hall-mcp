import chokidar, { type FSWatcher } from 'chokidar';
import path from 'node:path';
import type { Logger } from 'pino';
import type { HallEvent } from '../core/types.js';

export type EventSink = (evt: HallEvent) => void;

export function startRepoWatcher(repoRoot: string, log: Logger, sink: EventSink): FSWatcher {
  const absRoot = path.resolve(repoRoot);

  const watcher = chokidar.watch(absRoot, {
    ignoreInitial: true,
    ignored: (p) => p.includes('/node_modules/') || p.includes('/.git/') || p.includes('/.hall/'),
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 }
  });

  watcher.on('add', (p) => {
    log.debug({ p }, 'file added');
    sink({ type: 'file.added', path: path.relative(absRoot, p), ts: Date.now() });
  });

  watcher.on('change', (p) => {
    log.debug({ p }, 'file changed');
    sink({ type: 'file.changed', path: path.relative(absRoot, p), ts: Date.now() });
  });

  watcher.on('unlink', (p) => {
    log.debug({ p }, 'file deleted');
    sink({ type: 'file.deleted', path: path.relative(absRoot, p), ts: Date.now() });
  });

  watcher.on('error', (err) => {
    log.error({ err }, 'watcher error');
  });

  return watcher;
}
