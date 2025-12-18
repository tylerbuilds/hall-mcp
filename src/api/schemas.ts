import { z } from 'zod';

export const TaskCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional()
});

export const IntentPostSchema = z.object({
  taskId: z.string().min(4),
  agentId: z.string().min(1).max(120),
  files: z.array(z.string().min(1)).min(1).max(200),
  boundaries: z.string().max(4000).optional(),
  acceptanceCriteria: z.string().max(4000).optional()
});

export const ClaimCreateSchema = z.object({
  agentId: z.string().min(1).max(120),
  files: z.array(z.string().min(1)).min(1).max(200),
  ttlSeconds: z.coerce.number().int().positive().max(3600).default(900)
});

export const EvidenceAttachSchema = z.object({
  taskId: z.string().min(4),
  agentId: z.string().min(1).max(120),
  command: z.string().min(1).max(2000),
  output: z.string().min(0).max(500000)
});
