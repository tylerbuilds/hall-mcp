import { nanoid } from 'nanoid';
import type { Logger } from 'pino';
import type { HallDb } from '../infra/db';
import type { Claim, Evidence, Intent, Task } from './types';

const MAX_OUTPUT_CHARS = 20000;

// Database row types for type safety
interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  created_at: number;
}

interface IntentRow {
  id: string;
  task_id: string;
  agent_id: string;
  files_json: string;
  boundaries: string | null;
  acceptance_criteria: string | null;
  created_at: number;
}

interface ClaimRow {
  agent_id: string;
  file_path: string;
  expires_at: number;
  created_at: number;
}

interface EvidenceRow {
  id: string;
  task_id: string;
  agent_id: string;
  command: string;
  output: string;
  created_at: number;
}

interface CountRow {
  n: number;
}

function now() {
  return Date.now();
}

function clipOutput(s: string) {
  if (s.length <= MAX_OUTPUT_CHARS) return s;
  return s.slice(0, MAX_OUTPUT_CHARS) + `\n[clipped to ${MAX_OUTPUT_CHARS} chars]`;
}

export class HallState {
  constructor(private db: HallDb, private log: Logger) {}

  createTask(title: string, description?: string): Task {
    const task: Task = { id: nanoid(12), title, description, createdAt: now() };
    this.db
      .prepare('INSERT INTO tasks (id, title, description, created_at) VALUES (?, ?, ?, ?)')
      .run(task.id, task.title, task.description ?? null, task.createdAt);
    return task;
  }

  getTask(id: string): Task | null {
    const row = this.db
      .prepare('SELECT id, title, description, created_at FROM tasks WHERE id = ?')
      .get(id) as TaskRow | undefined;
    if (!row) return null;
    return { id: row.id, title: row.title, description: row.description ?? undefined, createdAt: row.created_at };
  }

  listTasks(limit = 50): Task[] {
    const rows = this.db
      .prepare('SELECT id, title, description, created_at FROM tasks ORDER BY created_at DESC LIMIT ?')
      .all(limit) as TaskRow[];
    return rows.map((r) => ({ id: r.id, title: r.title, description: r.description ?? undefined, createdAt: r.created_at }));
  }

  postIntent(input: {
    taskId: string;
    agentId: string;
    files: string[];
    boundaries?: string;
    acceptanceCriteria?: string;
  }): Intent {
    const task = this.getTask(input.taskId);
    if (!task) throw new Error(`Unknown taskId: ${input.taskId}`);

    const intent: Intent = {
      id: nanoid(12),
      taskId: input.taskId,
      agentId: input.agentId,
      files: input.files,
      boundaries: input.boundaries,
      acceptanceCriteria: input.acceptanceCriteria,
      createdAt: now()
    };

    this.db
      .prepare(
        'INSERT INTO intents (id, task_id, agent_id, files_json, boundaries, acceptance_criteria, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        intent.id,
        intent.taskId,
        intent.agentId,
        JSON.stringify(intent.files),
        intent.boundaries ?? null,
        intent.acceptanceCriteria ?? null,
        intent.createdAt
      );

    return intent;
  }

  listIntents(taskId: string): Intent[] {
    const rows = this.db
      .prepare('SELECT id, task_id, agent_id, files_json, boundaries, acceptance_criteria, created_at FROM intents WHERE task_id = ? ORDER BY created_at DESC')
      .all(taskId) as IntentRow[];
    return rows.map((r) => ({
      id: r.id,
      taskId: r.task_id,
      agentId: r.agent_id,
      files: JSON.parse(r.files_json) as string[],
      boundaries: r.boundaries ?? undefined,
      acceptanceCriteria: r.acceptance_criteria ?? undefined,
      createdAt: r.created_at
    }));
  }

  createClaim(agentId: string, files: string[], ttlSeconds: number): { claim: Claim; conflictsWith: string[] } {
    this.pruneExpiredClaims();

    const ttlMs = Math.max(5, ttlSeconds) * 1000;
    const createdAt = now();
    const expiresAt = createdAt + ttlMs;

    const conflicts = this.findConflicts(agentId, files);

    if (conflicts.length > 0) {
      this.log.warn({ agentId, files, conflicts }, 'claim.conflict');
      return {
        claim: { agentId, files, expiresAt, createdAt },
        conflictsWith: conflicts
      };
    }

    const stmt = this.db.prepare('INSERT OR REPLACE INTO claims (agent_id, file_path, expires_at, created_at) VALUES (?, ?, ?, ?)');
    const tx = this.db.transaction((paths: string[]) => {
      for (const p of paths) stmt.run(agentId, p, expiresAt, createdAt);
    });
    tx(files);

    return {
      claim: { agentId, files, expiresAt, createdAt },
      conflictsWith: []
    };
  }

  listActiveClaims(): Claim[] {
    this.pruneExpiredClaims();
    const rows = this.db.prepare('SELECT agent_id, file_path, expires_at, created_at FROM claims ORDER BY created_at DESC').all() as ClaimRow[];
    const byAgent = new Map<string, { files: string[]; expiresAt: number; createdAt: number }>();
    for (const r of rows) {
      let entry = byAgent.get(r.agent_id);
      if (!entry) {
        entry = { files: [], expiresAt: r.expires_at, createdAt: r.created_at };
        byAgent.set(r.agent_id, entry);
      }
      entry.files.push(r.file_path);
      entry.expiresAt = Math.max(entry.expiresAt, r.expires_at);
      entry.createdAt = Math.min(entry.createdAt, r.created_at);
    }
    return [...byAgent.entries()].map(([agentId, v]) => ({ agentId, files: v.files, expiresAt: v.expiresAt, createdAt: v.createdAt }));
  }

  attachEvidence(input: { taskId: string; agentId: string; command: string; output: string }): Evidence {
    const task = this.getTask(input.taskId);
    if (!task) throw new Error(`Unknown taskId: ${input.taskId}`);

    const ev: Evidence = {
      id: nanoid(12),
      taskId: input.taskId,
      agentId: input.agentId,
      command: input.command,
      output: clipOutput(input.output),
      createdAt: now()
    };

    this.db
      .prepare('INSERT INTO evidence (id, task_id, agent_id, command, output, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(ev.id, ev.taskId, ev.agentId, ev.command, ev.output, ev.createdAt);

    return ev;
  }

  listEvidence(taskId: string): Evidence[] {
    const rows = this.db
      .prepare('SELECT id, task_id, agent_id, command, output, created_at FROM evidence WHERE task_id = ? ORDER BY created_at DESC')
      .all(taskId) as EvidenceRow[];
    return rows.map((r) => ({
      id: r.id,
      taskId: r.task_id,
      agentId: r.agent_id,
      command: r.command,
      output: r.output,
      createdAt: r.created_at
    }));
  }

  releaseClaims(agentId: string, files?: string[]): number {
    if (files && files.length > 0) {
      const placeholders = files.map(() => '?').join(',');
      const info = this.db
        .prepare(`DELETE FROM claims WHERE agent_id = ? AND file_path IN (${placeholders})`)
        .run(agentId, ...files);
      return info.changes;
    }
    const info = this.db.prepare('DELETE FROM claims WHERE agent_id = ?').run(agentId);
    return info.changes;
  }

  status() {
    this.pruneExpiredClaims();
    const taskCount = (this.db.prepare('SELECT COUNT(1) AS n FROM tasks').get() as CountRow | undefined)?.n ?? 0;
    const intentCount = (this.db.prepare('SELECT COUNT(1) AS n FROM intents').get() as CountRow | undefined)?.n ?? 0;
    const claimCount = (this.db.prepare('SELECT COUNT(1) AS n FROM claims').get() as CountRow | undefined)?.n ?? 0;
    const evidenceCount = (this.db.prepare('SELECT COUNT(1) AS n FROM evidence').get() as CountRow | undefined)?.n ?? 0;

    return {
      tasks: taskCount,
      intents: intentCount,
      claims: claimCount,
      evidence: evidenceCount,
      now: now()
    };
  }

  private pruneExpiredClaims() {
    const t = now();
    const info = this.db.prepare('DELETE FROM claims WHERE expires_at <= ?').run(t);
    if (info.changes > 0) this.log.debug({ changes: info.changes }, 'Pruned expired claims');
  }

  private findConflicts(agentId: string, files: string[]): string[] {
    if (files.length === 0) return [];
    const t = now();
    const placeholders = files.map(() => '?').join(',');
    const rows = this.db
      .prepare(
        `SELECT DISTINCT agent_id FROM claims WHERE agent_id != ? AND expires_at > ? AND file_path IN (${placeholders})`
      )
      .all(agentId, t, ...files) as Array<{ agent_id: string }>;
    return rows.map((r) => r.agent_id);
  }
}
