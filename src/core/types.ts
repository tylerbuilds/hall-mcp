export type TaskId = string;
export type IntentId = string;
export type EvidenceId = string;
export type ChangelogId = string;

export interface Task {
  id: TaskId;
  title: string;
  description?: string;
  createdAt: number;
}

export interface Intent {
  id: IntentId;
  taskId: TaskId;
  agentId: string;
  files: string[];
  boundaries?: string;
  acceptanceCriteria?: string;
  createdAt: number;
}

export interface Claim {
  agentId: string;
  files: string[];
  expiresAt: number;
  createdAt: number;
}

export interface Evidence {
  id: EvidenceId;
  taskId: TaskId;
  agentId: string;
  command: string;
  output: string;
  createdAt: number;
}

export type ChangeType = 'create' | 'modify' | 'delete';

export interface ChangelogEntry {
  id: ChangelogId;
  taskId?: TaskId;
  agentId: string;
  filePath: string;
  changeType: ChangeType;
  summary: string;
  diffSnippet?: string;
  commitHash?: string;
  createdAt: number;
}

export type HallEvent =
  | { type: 'file.changed'; path: string; ts: number }
  | { type: 'file.added'; path: string; ts: number }
  | { type: 'file.deleted'; path: string; ts: number }
  | { type: 'task.created'; taskId: string; ts: number }
  | { type: 'intent.posted'; intentId: string; taskId: string; ts: number }
  | { type: 'claim.created'; agentId: string; files: string[]; expiresAt: number; ts: number }
  | { type: 'claim.conflict'; agentId: string; files: string[]; conflictsWith: string[]; ts: number }
  | { type: 'evidence.attached'; evidenceId: string; taskId: string; ts: number }
  | { type: 'gate.result'; ok: boolean; summary: string; ts: number };
