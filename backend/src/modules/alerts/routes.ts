import { Router } from 'express';
import { currentUserId, requireAuth } from '../../middleware/auth.js';
import { getMailStatus } from '../../lib/mailer.js';
import { getUserById } from '../auth/service.js';
import { sendTestAlerts } from './service.js';

export const alertsRouter = Router();

alertsRouter.use(requireAuth);

/** Current SMTP state, so misconfiguration is visible without reading logs. */
alertsRouter.get('/status', (_req, res) => {
  res.json(getMailStatus());
});

/**
 * Send a sample "down" and "recovered" email to the signed-in user. Always sends
 * to the account's own address, never an arbitrary one, so this can't be used to
 * relay mail to third parties.
 */
alertsRouter.post('/test', async (req, res) => {
  const user = await getUserById(currentUserId(req));
  const result = await sendTestAlerts(user.email);

  res.json({
    to: user.email,
    ...result,
    message:
      result.status === 'disabled'
        ? 'MAIL_ENABLED is false — the emails were logged instead of sent.'
        : result.sent.down && result.sent.recovered
          ? 'Two test emails sent. Check your inbox (or Mailtrap).'
          : 'Sending failed. See "error" for the SMTP response.',
  });
});
