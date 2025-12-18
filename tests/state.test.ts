import { describe, it, expect } from 'vitest';
import pino from 'pino';
import Database from 'better-sqlite3';
import { HallState } from '../src/core/state';
import type { HallDb } from '../src/infra/db';

function makeDb(): HallDb {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE intents (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, agent_id TEXT NOT NULL, files_json TEXT NOT NULL, boundaries TEXT, acceptance_criteria TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE claims (agent_id TEXT NOT NULL, file_path TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(agent_id, file_path));
    CREATE TABLE evidence (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, agent_id TEXT NOT NULL, command TEXT NOT NULL, output TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE INDEX idx_intents_task_id ON intents(task_id);
    CREATE INDEX idx_evidence_task_id ON evidence(task_id);
    CREATE INDEX idx_claims_expires_at ON claims(expires_at);
    CREATE INDEX idx_claims_file_path ON claims(file_path);
  `);
  return db;
}

describe('HallState', () => {
  describe('tasks', () => {
    it('creates and retrieves tasks', () => {
      const db = makeDb();
      const state = new HallState(db, pino({ level: 'silent' }));

      const task = state.createTask('Test task', 'Description');
      expect(task.title).toBe('Test task');
      expect(task.description).toBe('Description');
      expect(task.id).toBeDefined();

      const retrieved = state.getTask(task.id);
      expect(retrieved).toEqual(task);
    });

    it('lists tasks in descending order', async () => {
      const db = makeDb();
      const state = new HallState(db, pino({ level: 'silent' }));

      const first = state.createTask('First');
      // Small delay to ensure different timestamps
      await new Promise(r => setTimeout(r, 5));
      const second = state.createTask('Second');

      const tasks = state.listTasks();
      expect(tasks.length).toBe(2);
      // Most recent (second) should be first in descending order
      expect(tasks[0].id).toBe(second.id);
      expect(tasks[1].id).toBe(first.id);
    });

    it('returns null for non-existent task', () => {
      const db = makeDb();
      const state = new HallState(db, pino({ level: 'silent' }));

      expect(state.getTask('nonexistent')).toBeNull();
    });
  });

  describe('claims', () => {
    it('detects conflicts when a different agent has an active claim', () => {
      const db = makeDb();
      const state = new HallState(db, pino({ level: 'silent' }));

      const a = state.createClaim('agentA', ['src/a.ts'], 900);
      expect(a.conflictsWith).toEqual([]);

      const b = state.createClaim('agentB', ['src/a.ts'], 900);
      expect(b.conflictsWith.length).toBe(1);
      expect(b.conflictsWith).toContain('agentA');
    });

    it('allows same agent to extend claim', () => {
      const db = makeDb();
      const state = new HallState(db, pino({ level: 'silent' }));

      state.createClaim('agentA', ['src/a.ts'], 900);
      const b = state.createClaim('agentA', ['src/a.ts'], 900);
      expect(b.conflictsWith).toEqual([]);
    });

    it('releases claims', () => {
      const db = makeDb();
      const state = new HallState(db, pino({ level: 'silent' }));

      state.createClaim('agentA', ['src/a.ts', 'src/b.ts'], 900);

      // Release specific file
      const released = state.releaseClaims('agentA', ['src/a.ts']);
      expect(released).toBe(1);

      // agentB can now claim src/a.ts
      const b = state.createClaim('agentB', ['src/a.ts'], 900);
      expect(b.conflictsWith).toEqual([]);

      // But not src/b.ts
      const c = state.createClaim('agentB', ['src/b.ts'], 900);
      expect(c.conflictsWith).toContain('agentA');
    });

    it('releases all claims for agent', () => {
      const db = makeDb();
      const state = new HallState(db, pino({ level: 'silent' }));

      state.createClaim('agentA', ['src/a.ts', 'src/b.ts'], 900);

      const released = state.releaseClaims('agentA');
      expect(released).toBe(2);

      const claims = state.listActiveClaims();
      expect(claims.length).toBe(0);
    });

    it('handles empty files array gracefully', () => {
      const db = makeDb();
      const state = new HallState(db, pino({ level: 'silent' }));

      // This should not throw
      const result = state.createClaim('agentA', [], 900);
      expect(result.conflictsWith).toEqual([]);
    });
  });

  describe('intents', () => {
    it('posts and lists intents', () => {
      const db = makeDb();
      const state = new HallState(db, pino({ level: 'silent' }));
      const task = state.createTask('Test');

      const intent = state.postIntent({
        taskId: task.id,
        agentId: 'claude-code',
        files: ['src/main.ts'],
        boundaries: 'Do not touch tests',
        acceptanceCriteria: 'Tests pass'
      });

      expect(intent.taskId).toBe(task.id);
      expect(intent.files).toEqual(['src/main.ts']);

      const intents = state.listIntents(task.id);
      expect(intents.length).toBe(1);
      expect(intents[0].id).toBe(intent.id);
    });

    it('throws for invalid taskId', () => {
      const db = makeDb();
      const state = new HallState(db, pino({ level: 'silent' }));

      expect(() => state.postIntent({
        taskId: 'nonexistent',
        agentId: 'test',
        files: ['a.ts']
      })).toThrow('Unknown taskId');
    });
  });

  describe('evidence', () => {
    it('attaches and lists evidence', () => {
      const db = makeDb();
      const state = new HallState(db, pino({ level: 'silent' }));
      const task = state.createTask('Test');

      const ev = state.attachEvidence({
        taskId: task.id,
        agentId: 'agentA',
        command: 'npm test',
        output: 'All tests passed'
      });

      expect(ev.taskId).toBe(task.id);
      expect(ev.command).toBe('npm test');

      const evidence = state.listEvidence(task.id);
      expect(evidence.length).toBe(1);
      expect(evidence[0].id).toBe(ev.id);
    });

    it('clips long output', () => {
      const db = makeDb();
      const state = new HallState(db, pino({ level: 'silent' }));
      const task = state.createTask('Test');

      const longOutput = 'x'.repeat(25000);
      const ev = state.attachEvidence({
        taskId: task.id,
        agentId: 'agentA',
        command: 'cat bigfile',
        output: longOutput
      });

      expect(ev.output.length).toBeLessThan(longOutput.length);
      expect(ev.output).toContain('[clipped');
    });
  });

  describe('status', () => {
    it('returns correct counts', () => {
      const db = makeDb();
      const state = new HallState(db, pino({ level: 'silent' }));

      const task = state.createTask('Test');
      state.postIntent({ taskId: task.id, agentId: 'a', files: ['x.ts'] });
      state.createClaim('a', ['x.ts'], 900);
      state.attachEvidence({ taskId: task.id, agentId: 'a', command: 'test', output: 'ok' });

      const status = state.status();
      expect(status.tasks).toBe(1);
      expect(status.intents).toBe(1);
      expect(status.claims).toBe(1);
      expect(status.evidence).toBe(1);
      expect(status.now).toBeGreaterThan(0);
    });
  });
});
