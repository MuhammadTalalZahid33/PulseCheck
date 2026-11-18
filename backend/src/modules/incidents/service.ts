import { prisma } from '../../lib/prisma.js';

/** Reverse-chronological incident timeline. Open incidents have endedAt null. */
export function listIncidents(monitorId: string, limit = 50) {
  return prisma.incident.findMany({
    where: { monitorId },
    select: { id: true, startedAt: true, endedAt: true, durationSeconds: true },
    orderBy: { startedAt: 'desc' },
    take: limit,
  });
}

export function countOpenIncidents(monitorId: string): Promise<number> {
  return prisma.incident.count({ where: { monitorId, endedAt: null } });
}
