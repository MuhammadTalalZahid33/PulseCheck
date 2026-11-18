import type { MonitorStatus } from '../generated/prisma/enums.js';
import { prisma } from '../lib/prisma.js';
import type { ProbeResult } from './probe.js';

/**
 * What changed as a result of one check. `none` covers the overwhelming
 * majority of checks — a monitor that is still up, or still down.
 */
export type Transition = 'none' | 'went_down' | 'recovered';

export interface MonitorForCheck {
  id: string;
  name: string;
  url: string;
  lastStatus: MonitorStatus | null;
  userEmail: string;
}

export interface DownAlert {
  type: 'down';
  monitor: MonitorForCheck;
  statusCode: number | null;
  error: string | null;
  startedAt: Date;
}

export interface RecoveredAlert {
  type: 'recovered';
  monitor: MonitorForCheck;
  startedAt: Date;
  endedAt: Date;
  durationSeconds: number;
}

export type Alert = DownAlert | RecoveredAlert;

export interface RecordedCheck {
  transition: Transition;
  alert: Alert | null;
}

const isUniqueViolation = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';

/**
 * Persist a probe result and advance the incident state machine.
 *
 * Transition table, driven by the monitor's previous status:
 *
 *   up   -> down   open an incident, alert "down"
 *   down -> up     close the open incident, alert "recovered"
 *   x    -> x      record the check, nothing else (this is what stops us
 *                  emailing on every single failed check)
 *   null -> down   first check ever and it's broken: open + alert
 *   null -> up     first check ever and it's fine: record only, no alert
 *
 * The Check insert, the Incident write, and the Monitor update share one
 * transaction, so we never end up with a check recorded but the incident lost.
 * Alerts are returned rather than sent here: email happens after the commit, so
 * a dead SMTP server cannot roll back monitoring data.
 */
export async function recordCheck(
  monitor: MonitorForCheck,
  result: ProbeResult,
  checkedAt: Date,
): Promise<RecordedCheck> {
  return prisma.$transaction(async (tx) => {
    await tx.check.create({
      data: {
        monitorId: monitor.id,
        status: result.status,
        statusCode: result.statusCode,
        responseTimeMs: result.responseTimeMs,
        error: result.error,
        checkedAt,
      },
    });

    const previous = monitor.lastStatus;
    let transition: Transition = 'none';
    let alert: Alert | null = null;

    const wentDown = result.status === 'down' && previous !== 'down';
    const recovered = result.status === 'up' && previous === 'down';

    if (wentDown) {
      transition = 'went_down';
      try {
        await tx.incident.create({
          data: { monitorId: monitor.id, startedAt: checkedAt },
        });
        alert = {
          type: 'down',
          monitor,
          statusCode: result.statusCode,
          error: result.error,
          startedAt: checkedAt,
        };
      } catch (err) {
        // The partial unique index says an incident is already open. That means
        // our view of lastStatus was stale, so this is not a new transition and
        // must not produce a second email.
        if (!isUniqueViolation(err)) throw err;
        transition = 'none';
      }
    } else if (recovered) {
      const open = await tx.incident.findFirst({
        where: { monitorId: monitor.id, endedAt: null },
        orderBy: { startedAt: 'desc' },
      });

      if (open) {
        const durationSeconds = Math.max(
          0,
          Math.round((checkedAt.getTime() - open.startedAt.getTime()) / 1000),
        );
        await tx.incident.update({
          where: { id: open.id },
          data: { endedAt: checkedAt, durationSeconds },
        });
        transition = 'recovered';
        alert = {
          type: 'recovered',
          monitor,
          startedAt: open.startedAt,
          endedAt: checkedAt,
          durationSeconds,
        };
      } else {
        // lastStatus said down but no incident was open (e.g. data edited by
        // hand). Recording the recovery is still correct; there's nothing to close.
        transition = 'recovered';
      }
    }

    await tx.monitor.update({
      where: { id: monitor.id },
      data: { lastStatus: result.status, lastCheckedAt: checkedAt },
    });

    return { transition, alert };
  });
}
