import 'dotenv/config';
import { z } from 'zod';

/**
 * Fail fast on bad configuration. A missing JWT_SECRET or DATABASE_URL should
 * stop the process at boot, not surface as a 500 on the first login attempt.
 */

/**
 * Tolerant boolean. `.env` files are edited by hand, so TRUE / 1 / yes / on all
 * mean the same thing rather than crashing on a capital letter.
 */
const boolish = (defaultValue: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .default(defaultValue)
    .transform((value, ctx) => {
      if (typeof value === 'boolean') return value;
      const normalised = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'y', 'on'].includes(normalised)) return true;
      if (['false', '0', 'no', 'n', 'off', ''].includes(normalised)) return false;
      ctx.addIssue({ code: 'custom', message: `expected true or false, got "${value}"` });
      return z.NEVER;
    });

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_EXPIRES_IN: z.string().default('7d'),
    COOKIE_NAME: z.string().default('pulsecheck_token'),

    /**
     * Empty means "no Redis" and the cache degrades to direct DB reads. If it is
     * set, the scheme is checked here so a typo fails loudly at boot instead of
     * silently leaving the cache switched off.
     */
    REDIS_URL: z
      .string()
      .default('')
      .refine(
        (value) => value === '' || /^rediss?:\/\//.test(value.trim()),
        'must start with redis:// or rediss:// (Upstash uses rediss://), or be empty',
      )
      .transform((value) => value.trim()),
    CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(30),

    ENGINE_ENABLED: boolish(true),
    ENGINE_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(10),

    // A monitoring tool fetches user-supplied URLs by design, which is SSRF by
    // construction. Self-hosted single-user setups often want to watch internal
    // services, so this defaults to allowed. Set it to false before exposing
    // PulseCheck to untrusted signups.
    ALLOW_PRIVATE_TARGETS: boolish(true),

    MAIL_ENABLED: boolish(false),
    MAIL_HOST: z.string().trim().default(''),
    MAIL_PORT: z.coerce.number().int().positive().default(2525),
    MAIL_USER: z.string().trim().default(''),
    MAIL_PASS: z.string().default(''),
    MAIL_FROM: z.string().trim().default('PulseCheck <alerts@pulsecheck.local>'),

    APP_BASE_URL: z.url().default('http://localhost:3000'),
  })
  /**
   * Turning MAIL_ENABLED on without a host would build a transport that fails on
   * every alert, and the first sign of trouble would be a missing email during a
   * real outage. Catch it at boot instead.
   */
  .superRefine((value, ctx) => {
    if (!value.MAIL_ENABLED) return;

    if (!value.MAIL_HOST) {
      ctx.addIssue({
        code: 'custom',
        path: ['MAIL_HOST'],
        message: 'required when MAIL_ENABLED is true (e.g. sandbox.smtp.mailtrap.io)',
      });
    }
    if (value.MAIL_USER && !value.MAIL_PASS) {
      ctx.addIssue({
        code: 'custom',
        path: ['MAIL_PASS'],
        message: 'required when MAIL_USER is set',
      });
    }
    if (!value.MAIL_USER && value.MAIL_PASS) {
      ctx.addIssue({
        code: 'custom',
        path: ['MAIL_USER'],
        message: 'required when MAIL_PASS is set',
      });
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  console.error(
    `Invalid environment configuration:\n${issues}\n\nSee backend/.env.example for the expected values.`,
  );
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
