import type { z } from 'zod';
import { badRequest } from './errors.js';

/**
 * Parse untrusted input and turn failures into a 400 with field-level detail.
 * Handlers only ever see validated, typed data.
 */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw badRequest(
      'Validation failed',
      result.error.issues.map((i) => ({
        path: i.path.join('.') || '(root)',
        message: i.message,
      })),
    );
  }
  return result.data;
}
