import { createApp } from './app.js';
import { env } from './env.js';
import { startEngine } from './engine/scheduler.js';
import { disconnectPrisma } from './lib/prisma.js';
import { disconnectRedis } from './lib/redis.js';
import { verifyMailer } from './lib/mailer.js';

const app = createApp();
const server = app.listen(env.PORT, () => {
  console.log(`[api] listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

// Without this a port clash is an unhandled 'error' event, and the confusing
// symptom is a second API silently shadowing the first.
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[api] port ${env.PORT} is already in use — is another PulseCheck API running?`);
    process.exit(1);
  }
  console.error('[api] server error:', err);
  process.exit(1);
});

// Surfaces a bad SMTP host or password at boot rather than mid-outage.
void verifyMailer();

const engine = startEngine();

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[api] ${signal} received, shutting down`);

  engine?.stop();
  server.close();
  await Promise.allSettled([disconnectPrisma(), disconnectRedis()]);
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  console.error('[api] unhandled rejection:', reason);
});
