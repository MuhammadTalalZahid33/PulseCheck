import { env } from '../env.js';
import { prisma } from '../lib/prisma.js';
import { notFound } from '../lib/errors.js';
import { invalidateDashboard } from '../lib/cache.js';
import { sendAlert } from '../modules/alerts/service.js';
import { recordCheck, type Alert, type MonitorForCheck, type Transition } from './incidents.js';
import { mapWithConcurrency } from './pool.js';
import { probe } from './probe.js';

interface DueMonitor extends MonitorForCheck {
  userId: string;
  expectedStatus: number;
  timeoutMs: number;
}

/** Safety valve: never try to probe an unbounded number of monitors in one tick. */
const MAX_PER_TICK = 500;

/**
 * Which monitors are due. Computed in SQL rather than by loading every monitor
 * into Node, and it reads straight off the (isActive, lastCheckedAt) index.
 * NULLS FIRST so brand-new monitors get their first check immediately.
 */
function findDueMonitors(): Promise<DueMonitor[]> {
  return prisma.$queryRaw<DueMonitor[]>`
    SELECT m."id",
           m."name",
           m."url",
           m."userId",
           m."expectedStatus",
           m."timeoutMs",
           m."lastStatus",
           u."email" AS "userEmail"
    FROM "Monitor" m
    JOIN "User" u ON u."id" = m."userId"
    WHERE m."isActive" = true
      AND (
        m."lastCheckedAt" IS NULL
        OR m."lastCheckedAt" <= now() - (m."intervalMinutes" * interval '1 minute')
      )
    ORDER BY m."lastCheckedAt" ASC NULLS FIRST
    LIMIT ${MAX_PER_TICK}
  `;
}

async function checkOne(monitor: DueMonitor): Promise<{ transition: Transition; alert: Alert | null }> {
  const result = await probe({
    url: monitor.url,
    expectedStatus: monitor.expectedStatus,
    timeoutMs: monitor.timeoutMs,
  });

  return recordCheck(monitor, result, new Date());
}

export interface TickSummary {
  due: number;
  checked: number;
  failed: number;
  transitions: number;
}

/**
 * One pass of the engine: find due monitors, probe them with bounded
 * concurrency, then fire alerts for the state transitions.
 */
export async function runDueChecks(): Promise<TickSummary> {
  const due = await findDueMonitors();
  if (due.length === 0) return { due: 0, checked: 0, failed: 0, transitions: 0 };

  const outcomes = await mapWithConcurrency(due, env.ENGINE_CONCURRENCY, checkOne);

  const alerts: Alert[] = [];
  const touchedUsers = new Set<string>();
  let checked = 0;
  let failed = 0;
  let transitions = 0;

  outcomes.forEach((outcome, index) => {
    const monitor = due[index];
    if (!monitor) return;

    if (!outcome.ok) {
      // The probe itself never throws, so this means the DB write failed.
      failed++;
      console.error(`[engine] failed to record check for ${monitor.id}:`, outcome.error);
      return;
    }

    checked++;
    touchedUsers.add(monitor.userId);
    if (outcome.value.transition !== 'none') transitions++;
    if (outcome.value.alert) alerts.push(outcome.value.alert);
  });

  // New checks change the dashboard's uptime numbers, so drop those entries.
  await Promise.all([...touchedUsers].map(invalidateDashboard));

  // After the transaction has committed: a slow or broken mail server must not
  // hold up the tick or undo any monitoring data.
  await Promise.allSettled(alerts.map(sendAlert));

  return { due: due.length, checked, failed, transitions };
}

/**
 * Check a single monitor now, on demand. Without this every manual test costs a
 * full interval of waiting.
 */
export async function runCheckNow(userId: string, monitorId: string): Promise<TickSummary> {
  const rows = await prisma.$queryRaw<DueMonitor[]>`
    SELECT m."id", m."name", m."url", m."userId", m."expectedStatus", m."timeoutMs",
           m."lastStatus", u."email" AS "userEmail"
    FROM "Monitor" m
    JOIN "User" u ON u."id" = m."userId"
    WHERE m."id" = ${monitorId} AND m."userId" = ${userId}
    LIMIT 1
  `;

  const monitor = rows[0];
  if (!monitor) throw notFound('Monitor not found');

  const outcome = await checkOne(monitor);
  await invalidateDashboard(monitor.userId);
  if (outcome.alert) await sendAlert(outcome.alert).catch(() => undefined);

  return { due: 1, checked: 1, failed: 0, transitions: outcome.transition === 'none' ? 0 : 1 };
}
