import type { Alert, MonitorForCheck } from '../../engine/incidents.js';
import { getMailStatus, sendMail, type MailStatus } from '../../lib/mailer.js';
import { renderAlert } from './templates.js';

/**
 * Alerts fire on state transitions only — the decision of *whether* something
 * is a transition lives in the state machine, so by the time an Alert reaches
 * here it is always worth sending.
 */
export async function sendAlert(alert: Alert): Promise<void> {
  await sendMail(renderAlert(alert));
}

export interface TestAlertResult {
  status: MailStatus;
  error: string | null;
  sent: { down: boolean; recovered: boolean };
}

/**
 * Send one of each alert to the signed-in user, using the real templates and
 * transport. Lets you confirm SMTP credentials without waiting for a genuine
 * outage or deliberately breaking a site.
 */
export async function sendTestAlerts(email: string): Promise<TestAlertResult> {
  const monitor: MonitorForCheck = {
    id: 'test-monitor',
    name: 'Test Monitor',
    url: 'https://example.com',
    lastStatus: null,
    userEmail: email,
  };

  const startedAt = new Date(Date.now() - 5 * 60_000);

  const down = await sendMail(
    renderAlert({
      type: 'down',
      monitor,
      statusCode: 500,
      error: 'Expected status 200, got 500',
      startedAt,
    }),
  );

  const recovered = await sendMail(
    renderAlert({
      type: 'recovered',
      monitor,
      startedAt,
      endedAt: new Date(),
      durationSeconds: 300,
    }),
  );

  const { status, error } = getMailStatus();
  return { status, error, sent: { down, recovered } };
}
