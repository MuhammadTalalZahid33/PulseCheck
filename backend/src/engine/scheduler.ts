import cron from 'node-cron';
import { env } from '../env.js';
import { runDueChecks } from './runner.js';

/**
 * Guards against overlapping ticks. With 30s timeouts and a queue of dead
 * targets a tick can outlive its minute; without this flag the next tick would
 * start on top of it, double-probing monitors and compounding the backlog.
 */
let ticking = false;

export async function tick(): Promise<void> {
  if (ticking) {
    console.warn('[engine] previous tick still running, skipping this minute');
    return;
  }

  ticking = true;
  const startedAt = Date.now();
  try {
    const summary = await runDueChecks();
    if (summary.due > 0) {
      console.log(
        `[engine] due=${summary.due} checked=${summary.checked} failed=${summary.failed} ` +
          `transitions=${summary.transitions} in ${Date.now() - startedAt}ms`,
      );
    }
  } catch (err) {
    // Swallow: a thrown tick must not kill the process or stop the schedule.
    console.error('[engine] tick failed:', err);
  } finally {
    ticking = false;
  }
}

export function startEngine(): { stop: () => void } | null {
  if (!env.ENGINE_ENABLED) {
    console.log('[engine] disabled (ENGINE_ENABLED=false)');
    return null;
  }

  const task = cron.schedule('* * * * *', () => void tick());
  console.log(`[engine] started, every minute, concurrency ${env.ENGINE_CONCURRENCY}`);

  return {
    stop: () => {
      void task.stop();
    },
  };
}
