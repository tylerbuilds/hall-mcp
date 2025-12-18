import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { HallConfig } from '../core/config';

export type HallDb = Database.Database;

export function openDb(cfg: HallConfig): HallDb {
  const dbPath = cfg.HALL_DB_PATH;
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  migrate(db);
  return db;
}

function migrate(db: HallDb) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS intents (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      files_json TEXT NOT NULL,
      boundaries TEXT,
      acceptance_criteria TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS claims (
      agent_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(agent_id, file_path)
    );

    CREATE TABLE IF NOT EXISTS evidence (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      command TEXT NOT NULL,
      output TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    -- Performance indexes
    CREATE INDEX IF NOT EXISTS idx_intents_task_id ON intents(task_id);
    CREATE INDEX IF NOT EXISTS idx_evidence_task_id ON evidence(task_id);
    CREATE INDEX IF NOT EXISTS idx_claims_expires_at ON claims(expires_at);
    CREATE INDEX IF NOT EXISTS idx_claims_file_path ON claims(file_path);
  `);
}
