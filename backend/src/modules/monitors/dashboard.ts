import { cache } from '../../lib/redis.js';
import { dashboardKey } from '../../lib/cache.js';
import { getSparkline, getUptime, type UptimeSummary } from '../checks/service.js';
import { listMonitors } from './service.js';

type MonitorRow = Awaited<ReturnType<typeof listMonitors>>[number];

export interface DashboardMonitor extends MonitorRow {
  uptime24h: UptimeSummary;
  sparkline: Array<{ t: string; ms: number | null }>;
}

/**
 * The dashboard payload: every monitor plus its 24h uptime and a 24h sparkline.
 *
 * Cached as one blob per user. Redis being unavailable is not an error — cache
 * returns null and we fall through to Postgres.
 */
export async function getDashboard(userId: string): Promise<DashboardMonitor[]> {
  const key = dashboardKey(userId);

  const cached = await cache.get<DashboardMonitor[]>(key);
  if (cached) return cached;

  const monitors = await listMonitors(userId);

  const enriched = await Promise.all(
    monitors.map(async (monitor) => ({
      ...monitor,
      uptime24h: await getUptime(monitor.id, '24h'),
      sparkline: await getSparkline(monitor.id),
    })),
  );

  await cache.set(key, enriched);
  return enriched;
}
