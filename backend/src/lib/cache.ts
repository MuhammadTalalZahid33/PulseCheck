import { cache } from './redis.js';

/**
 * One cache entry per user holds the whole dashboard payload (monitor list plus
 * uptime summaries). Keeping it coarse means a single DEL covers every write
 * path — create, update, delete, and the engine recording a check.
 */
export const dashboardKey = (userId: string): string => `dash:v1:${userId}`;

export function invalidateDashboard(userId: string): Promise<void> {
  return cache.del(dashboardKey(userId));
}
