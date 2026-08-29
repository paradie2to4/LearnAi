import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // Only consumed directly by the Prisma CLI (schema.prisma's `directUrl`) for
  // `prisma migrate`, never read by application code - optional because a
  // plain non-pooled Postgres (e.g. local dev) doesn't need a separate one.
  DIRECT_URL: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().min(1, 'JWT_ACCESS_SECRET is required'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(1, 'JWT_REFRESH_SECRET is required'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  RABBITMQ_URL: z.string().default('amqp://localhost:5672'),

  // GOOGLE_API_KEY backs the default AI_PROVIDER binding (GeminiProvider, free tier).
  // ANTHROPIC_API_KEY is only read if ai.module.ts's binding is switched to
  // AnthropicProvider - kept optional here so either provider can be configured
  // without touching this schema.
  GOOGLE_API_KEY: z.string().optional().default(''),
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  AI_MODEL_ID: z.string().default('gemini-1.5-flash'),

  THROTTLE_TTL: z.coerce.number().default(60),
  THROTTLE_LIMIT: z.coerce.number().default(100),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.toString()}`);
  }
  return parsed.data;
}
