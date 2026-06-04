import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  GITHUB_ORG: z.string().min(1),
  GITHUB_TOKEN: z.string().min(1),
  GITHUB_ENTERPRISE: z.string().min(1).optional(),
  INCLUDED_CREDITS_OVERRIDE: z.coerce.number().positive().optional(),
  PORT: z.coerce.number().int().positive().default(8787),
  REFRESH_INTERVAL_MS: z.coerce.number().int().min(60_000).default(15 * 60 * 1000),
  GITHUB_API_VERSION: z.string().min(1).default('2026-03-10')
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(): AppConfig {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.errors.map((error) => `${error.path.join('.')}: ${error.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return parsed.data;
}