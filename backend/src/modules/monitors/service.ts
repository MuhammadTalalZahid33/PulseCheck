import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';
import { invalidateDashboard } from '../../lib/cache.js';
import type { CreateMonitorInput, UpdateMonitorInput } from './schemas.js';

/**
 * `userId` is deliberately absent: the caller already knows whose monitors
 * these are, and it keeps the field out of API responses.
 */
const monitorSelect = {
  id: true,
  name: true,
  url: true,
  intervalMinutes: true,
  expectedStatus: true,
  timeoutMs: true,
  isActive: true,
  lastCheckedAt: true,
  lastStatus: true,
  createdAt: true,
  updatedAt: true,
} as const;

const isRecordNotFound = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2025';

export function listMonitors(userId: string) {
  return prisma.monitor.findMany({
    where: { userId },
    select: monitorSelect,
    orderBy: { createdAt: 'desc' },
  });
}

export async function getMonitor(userId: string, id: string) {
  const monitor = await prisma.monitor.findFirst({
    where: { id, userId },
    select: monitorSelect,
  });
  // 404, not 403: confirming a monitor exists but belongs to someone else
  // would leak which ids are real.
  if (!monitor) throw notFound('Monitor not found');
  return monitor;
}

export async function createMonitor(userId: string, input: CreateMonitorInput) {
  const monitor = await prisma.monitor.create({
    data: { ...input, userId },
    select: monitorSelect,
  });
  await invalidateDashboard(userId);
  return monitor;
}

export async function updateMonitor(userId: string, id: string, input: UpdateMonitorInput) {
  try {
    // The userId in `where` makes the ownership check part of the same
    // statement as the write, so there's no read-then-write race.
    const monitor = await prisma.monitor.update({
      where: { id, userId },
      data: input,
      select: monitorSelect,
    });
    await invalidateDashboard(userId);
    return monitor;
  } catch (err) {
    if (isRecordNotFound(err)) throw notFound('Monitor not found');
    throw err;
  }
}

export async function deleteMonitor(userId: string, id: string): Promise<void> {
  try {
    // Checks and incidents go with it via onDelete: Cascade.
    await prisma.monitor.delete({ where: { id, userId } });
    await invalidateDashboard(userId);
  } catch (err) {
    if (isRecordNotFound(err)) throw notFound('Monitor not found');
    throw err;
  }
}
