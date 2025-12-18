import { z } from 'zod';

const EnvSchema = z.object({
  HALL_PORT: z.coerce.number().int().positive().default(4177),
  HALL_BIND: z.string().default('127.0.0.1'),
  HALL_REPO_ROOT: z.string().default('.'),
  HALL_DB_PATH: z.string().default('.hall/hall.sqlite'),
  HALL_RATE_LIMIT_RPM: z.coerce.number().int().positive().default(300),
  HALL_LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info')
});

export type HallConfig = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv): HallConfig {
  // If you use dotenv, load it before calling this function.
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${msg}`);
  }
  return parsed.data;
}
