import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../env.js';

/**
 * SMTP is optional and configured entirely through the environment. Filling in
 * MAIL_ENABLED / MAIL_HOST / MAIL_PORT / MAIL_USER / MAIL_PASS is the only step
 * needed to turn real alerts on.
 */
export type MailStatus = 'disabled' | 'ready' | 'unverified' | 'error';

let transporter: Transporter | null = null;
let status: MailStatus = env.MAIL_ENABLED ? 'unverified' : 'disabled';
let lastError: string | null = null;

function getTransporter(): Transporter | null {
  if (!env.MAIL_ENABLED) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: env.MAIL_HOST,
    port: env.MAIL_PORT,
    // 465 is implicit TLS. 587/2525 start plaintext and upgrade via STARTTLS,
    // which nodemailer negotiates automatically when the server advertises it.
    secure: env.MAIL_PORT === 465,
    auth: env.MAIL_USER ? { user: env.MAIL_USER, pass: env.MAIL_PASS } : undefined,
  });

  return transporter;
}

export function getMailStatus(): { status: MailStatus; error: string | null } {
  return { status, error: lastError };
}

/**
 * Check the SMTP connection and credentials at boot.
 *
 * Without this, a typo'd password stays invisible until the first real outage —
 * exactly the moment the email matters. Failure is logged, not fatal: monitoring
 * is still useful without alerts.
 */
export async function verifyMailer(): Promise<void> {
  if (!env.MAIL_ENABLED) {
    console.log('[mail] disabled (MAIL_ENABLED=false), alerts will be logged instead of sent');
    return;
  }

  const transport = getTransporter();
  if (!transport) return;

  try {
    await transport.verify();
    status = 'ready';
    lastError = null;
    console.log(`[mail] SMTP ready at ${env.MAIL_HOST}:${env.MAIL_PORT} as "${env.MAIL_FROM}"`);
  } catch (err) {
    status = 'error';
    lastError = err instanceof Error ? err.message : String(err);
    console.error(
      `[mail] SMTP check FAILED for ${env.MAIL_HOST}:${env.MAIL_PORT} — alerts will not be delivered: ${lastError}`,
    );
  }
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Fail-soft by design. Alert delivery is best-effort: if SMTP is down or
 * misconfigured we log it and carry on, because losing an email is far better
 * than losing a check or crashing the engine tick.
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  const transport = getTransporter();

  if (!transport) {
    console.log(`[mail] disabled, would have sent "${mail.subject}" to ${mail.to}`);
    return false;
  }

  try {
    const info = await transport.sendMail({ from: env.MAIL_FROM, ...mail });
    status = 'ready';
    lastError = null;
    console.log(`[mail] sent "${mail.subject}" to ${mail.to} (id ${info.messageId})`);
    return true;
  } catch (err) {
    status = 'error';
    lastError = err instanceof Error ? err.message : String(err);
    console.error(`[mail] failed to send "${mail.subject}" to ${mail.to}: ${lastError}`);
    return false;
  }
}
