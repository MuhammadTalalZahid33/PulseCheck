import { z } from 'zod';

/**
 * Only absolute http(s) URLs are monitorable. Anything else (ftp:, file:,
 * javascript:, a bare hostname) is rejected here rather than failing later
 * inside the probe.
 */
const monitorUrl = z
  .string()
  .trim()
  .min(1, 'URL is required')
  .max(2048, 'URL is too long')
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Enter an absolute URL starting with http:// or https://');

const name = z.string().trim().min(1, 'Name is required').max(100, 'Name is too long');

// Clamped, not just validated: a 10-second interval would hammer the target and
// a 5-minute timeout would stall the engine's tick.
const intervalMinutes = z.coerce
  .number()
  .int('Interval must be a whole number of minutes')
  .min(1, 'Interval must be at least 1 minute')
  .max(60, 'Interval must be at most 60 minutes');

const expectedStatus = z.coerce
  .number()
  .int()
  .min(100, 'Expected status must be a valid HTTP status code')
  .max(599, 'Expected status must be a valid HTTP status code');

const timeoutMs = z.coerce
  .number()
  .int()
  .min(1000, 'Timeout must be at least 1000ms')
  .max(30000, 'Timeout must be at most 30000ms');

export const createMonitorSchema = z
  .object({
    name,
    url: monitorUrl,
    intervalMinutes: intervalMinutes.default(5),
    expectedStatus: expectedStatus.default(200),
    timeoutMs: timeoutMs.default(5000),
    isActive: z.boolean().default(true),
  })
  .strict();

export const updateMonitorSchema = z
  .object({
    name: name.optional(),
    url: monitorUrl.optional(),
    intervalMinutes: intervalMinutes.optional(),
    expectedStatus: expectedStatus.optional(),
    timeoutMs: timeoutMs.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, 'Provide at least one field to update');

export const monitorIdSchema = z.object({
  id: z.string().min(1).max(64),
});

export type CreateMonitorInput = z.output<typeof createMonitorSchema>;
export type UpdateMonitorInput = z.output<typeof updateMonitorSchema>;
