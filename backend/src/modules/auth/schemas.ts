import { z } from 'zod';

/**
 * bcrypt only hashes the first 72 bytes of input. Rather than silently
 * truncating (so "correct-horse...A" and "correct-horse...B" would be the same
 * password), we reject anything longer.
 */
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Password must be at most 72 bytes');

const email = z
  .email('Enter a valid email address')
  .max(254)
  .transform((v) => v.trim().toLowerCase());

export const registerSchema = z.object({ email, password });
export const loginSchema = z.object({ email, password: z.string().min(1, 'Password is required') });

export type RegisterInput = z.output<typeof registerSchema>;
export type LoginInput = z.output<typeof loginSchema>;
