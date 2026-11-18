import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { prisma } from './lib/prisma.js';
import { cache } from './lib/redis.js';
import { getMailStatus } from './lib/mailer.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { apiLimiter, loginLimiter, registerLimiter } from './middleware/rateLimit.js';
import { alertsRouter } from './modules/alerts/routes.js';
import { authRouter } from './modules/auth/routes.js';
import { monitorsRouter } from './modules/monitors/routes.js';

export function createApp() {
  const app = express();

  // Rate limiters key on client IP; without this every request behind a proxy
  // shares one bucket. Loopback + private ranges only, so the header can't be
  // spoofed from the internet.
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  /**
   * Single place to see whether the three dependencies are wired up. Only the
   * database is required: cache and mail report their state without affecting
   * the status code, because monitoring works without either.
   */
  app.get('/api/health', async (_req, res) => {
    let db = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = true;
    } catch {
      db = false;
    }

    const mail = getMailStatus();
    res.status(db ? 200 : 503).json({
      ok: db,
      db,
      cache: cache.status,
      mail: mail.status,
      ...(mail.error ? { mailError: mail.error } : {}),
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  app.use('/api', apiLimiter);

  // Tighter limits on credential endpoints, on top of the general one.
  app.use('/api/auth/login', loginLimiter);
  app.use('/api/auth/register', registerLimiter);

  app.use('/api/auth', authRouter);
  app.use('/api/monitors', monitorsRouter);
  app.use('/api/alerts', alertsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
