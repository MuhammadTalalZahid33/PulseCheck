import { prisma } from '../../lib/prisma.js';

export type Range = '24h' | '7d' | '30d';

interface RangeConfig {
  /** Window length in hours. */
  hours: number;
  /** Bucket width for the chart, in minutes. */
  bucketMinutes: number;
}

/**
 * 30 days of 1-minute checks is ~43,000 rows — far too many to send to a chart.
 * Each range is aggregated into ~300 buckets server-side instead.
 */
export const RANGES: Record<Range, RangeConfig> = {
  '24h': { hours: 24, bucketMinutes: 5 },
  '7d': { hours: 24 * 7, bucketMinutes: 60 },
  '30d': { hours: 24 * 30, bucketMinutes: 360 },
};

export interface UptimeSummary {
  range: Range;
  totalChecks: number;
  upChecks: number;
  /** null when there is no data: "no checks yet" is not "100% uptime". */
  uptimePercent: number | null;
  avgResponseMs: number | null;
}

interface UptimeRow {
  total: bigint;
  up: bigint;
  avgms: number | null;
}

export async function getUptime(monitorId: string, range: Range): Promise<UptimeSummary> {
  const { hours } = RANGES[range];

  const rows = await prisma.$queryRaw<UptimeRow[]>`
    SELECT count(*)::bigint AS total,
           count(*) FILTER (WHERE "status" = 'up')::bigint AS up,
           avg("responseTimeMs") FILTER (WHERE "status" = 'up') AS avgms
    FROM "Check"
    WHERE "monitorId" = ${monitorId}
      AND "checkedAt" >= now() - (${hours}::int * interval '1 hour')
  `;

  const row = rows[0];
  const total = Number(row?.total ?? 0);
  const up = Number(row?.up ?? 0);

  return {
    range,
    totalChecks: total,
    upChecks: up,
    uptimePercent: total === 0 ? null : Math.round((up / total) * 10000) / 100,
    avgResponseMs: row?.avgms == null ? null : Math.round(Number(row.avgms)),
  };
}

/** Uptime for every range at once, for the dashboard and detail header. */
export async function getAllUptime(monitorId: string): Promise<Record<Range, UptimeSummary>> {
  const [day, week, month] = await Promise.all([
    getUptime(monitorId, '24h'),
    getUptime(monitorId, '7d'),
    getUptime(monitorId, '30d'),
  ]);
  return { '24h': day, '7d': week, '30d': month };
}

export interface ChartPoint {
  /** Bucket start, ISO string. */
  t: string;
  /** Mean response time of successful checks in the bucket, null if all failed. */
  avgResponseMs: number | null;
  upChecks: number;
  downChecks: number;
}

interface BucketRow {
  bucket: Date;
  avgms: number | null;
  up: bigint;
  down: bigint;
}

/**
 * Time-bucketed response times for the chart. Bucketing happens in Postgres via
 * date_bin so the response stays a few hundred points regardless of range.
 */
export async function getChecksSeries(monitorId: string, range: Range): Promise<ChartPoint[]> {
  const { hours, bucketMinutes } = RANGES[range];

  /**
   * Buckets are anchored to a fixed epoch, not to now(). Anchoring to now()
   * shifted every boundary on each request, so the chart's points drifted and
   * their averages changed slightly even when no new check had been recorded —
   * a paused monitor looked like it was still moving.
   */
  const rows = await prisma.$queryRaw<BucketRow[]>`
    SELECT date_bin(
             (${bucketMinutes}::int * interval '1 minute'),
             "checkedAt",
             TIMESTAMP '2000-01-01 00:00:00'
           ) AS bucket,
           avg("responseTimeMs") FILTER (WHERE "status" = 'up') AS avgms,
           count(*) FILTER (WHERE "status" = 'up')::bigint AS up,
           count(*) FILTER (WHERE "status" = 'down')::bigint AS down
    FROM "Check"
    WHERE "monitorId" = ${monitorId}
      AND "checkedAt" >= now() - (${hours}::int * interval '1 hour')
    GROUP BY bucket
    ORDER BY bucket ASC
  `;

  return rows.map((row) => ({
    t: row.bucket.toISOString(),
    avgResponseMs: row.avgms == null ? null : Math.round(Number(row.avgms)),
    upChecks: Number(row.up),
    downChecks: Number(row.down),
  }));
}

/** Raw recent checks, for the "latest activity" strip on the detail page. */
export function getRecentChecks(monitorId: string, limit = 30) {
  return prisma.check.findMany({
    where: { monitorId },
    select: { id: true, status: true, statusCode: true, responseTimeMs: true, error: true, checkedAt: true },
    orderBy: { checkedAt: 'desc' },
    take: limit,
  });
}

/** Sparkline data for dashboard cards: one point per 30 minutes over 24h. */
export async function getSparkline(monitorId: string): Promise<Array<{ t: string; ms: number | null }>> {
  const rows = await prisma.$queryRaw<BucketRow[]>`
    SELECT date_bin(interval '30 minutes', "checkedAt", TIMESTAMP '2000-01-01 00:00:00') AS bucket,
           avg("responseTimeMs") FILTER (WHERE "status" = 'up') AS avgms,
           count(*) FILTER (WHERE "status" = 'up')::bigint AS up,
           count(*) FILTER (WHERE "status" = 'down')::bigint AS down
    FROM "Check"
    WHERE "monitorId" = ${monitorId}
      AND "checkedAt" >= now() - interval '24 hours'
    GROUP BY bucket
    ORDER BY bucket ASC
  `;

  return rows.map((row) => ({
    t: row.bucket.toISOString(),
    ms: row.avgms == null ? null : Math.round(Number(row.avgms)),
  }));
}
