import type { FastifyInstance, FastifyRequest } from 'fastify';
import { TaskCreateSchema, IntentPostSchema, ClaimCreateSchema, EvidenceAttachSchema } from './schemas';
import type { HallState } from '../core/state';
import { z } from 'zod';

function ok<T>(data: T) {
  return { ok: true as const, data };
}

function bad(message: string) {
  return { ok: false as const, error: message };
}

// Query/Param schemas
const TaskListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional()
});

const TaskIdParams = z.object({
  id: z.string().min(4)
});

const ClaimReleaseSchema = z.object({
  agentId: z.string().min(1).max(120),
  files: z.array(z.string().min(1)).optional()
});

export async function registerRoutes(app: FastifyInstance, state: HallState) {
  app.get('/api/status', async () => ok(state.status()));

  app.post('/api/tasks', async (req, reply) => {
    const parsed = TaskCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));
    const t = state.createTask(parsed.data.title, parsed.data.description);
    return ok(t);
  });

  app.get('/api/tasks', async (req, reply) => {
    const parsed = TaskListQuery.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));
    return ok(state.listTasks(parsed.data.limit ?? 50));
  });

  app.get('/api/tasks/:id', async (req, reply) => {
    const parsed = TaskIdParams.safeParse(req.params);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));
    const task = state.getTask(parsed.data.id);
    if (!task) return reply.status(404).send(bad('Task not found'));
    return ok({
      task,
      intents: state.listIntents(parsed.data.id),
      evidence: state.listEvidence(parsed.data.id)
    });
  });

  app.post('/api/intents', async (req, reply) => {
    const parsed = IntentPostSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));
    try {
      const intent = state.postIntent(parsed.data);
      return ok(intent);
    } catch (e: any) {
      return reply.status(400).send(bad(e?.message ?? 'Failed to post intent'));
    }
  });

  app.post('/api/claims', async (req, reply) => {
    const parsed = ClaimCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));

    const { claim, conflictsWith } = state.createClaim(parsed.data.agentId, parsed.data.files, parsed.data.ttlSeconds);
    if (conflictsWith.length > 0) {
      return reply.status(409).send(
        ok({
          claim,
          conflictsWith
        })
      );
    }

    return ok({ claim, conflictsWith: [] });
  });

  app.get('/api/claims', async () => ok(state.listActiveClaims()));

  app.delete('/api/claims', async (req, reply) => {
    const parsed = ClaimReleaseSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));
    const released = state.releaseClaims(parsed.data.agentId, parsed.data.files);
    return ok({ released, agentId: parsed.data.agentId });
  });

  app.post('/api/evidence', async (req, reply) => {
    const parsed = EvidenceAttachSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));
    try {
      const ev = state.attachEvidence(parsed.data);
      return ok(ev);
    } catch (e: any) {
      return reply.status(400).send(bad(e?.message ?? 'Failed to attach evidence'));
    }
  });
}
