import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { env, isProd } from '../env.js';

/**
 * Prisma 7 requires an explicit driver adapter for SQL providers.
 * The pool is sized modestly: the engine runs at most ENGINE_CONCURRENCY
 * probes in parallel, and each probe touches the DB briefly at the end.
 */
const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
  max: Math.max(10, env.ENGINE_CONCURRENCY + 5),
});

export const prisma = new PrismaClient({
  adapter,
  log: isProd ? ['warn', 'error'] : ['warn', 'error'],
});

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
