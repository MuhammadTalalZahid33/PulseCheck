import { env } from '../../env.js';
import type { Alert } from '../../engine/incidents.js';
import type { Mail } from '../../lib/mailer.js';

export function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function layout(accent: string, heading: string, rows: Array<[string, string]>, monitorId: string): string {
  const cells = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 16px 6px 0;color:#8b98ad;font-size:13px">${escapeHtml(label)}</td>` +
        `<td style="padding:6px 0;color:#e6ebf2;font-size:13px">${escapeHtml(value)}</td></tr>`,
    )
    .join('');

  return `<div style="background:#07090d;padding:24px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#0d1017;border:1px solid #262f3f;border-radius:12px;padding:24px">
    <p style="margin:0 0 4px;color:${accent};font-size:13px;font-weight:600;letter-spacing:.04em">PULSECHECK</p>
    <h1 style="margin:0 0 16px;color:#fff;font-size:20px">${escapeHtml(heading)}</h1>
    <table style="border-collapse:collapse;width:100%">${cells}</table>
    <a href="${env.APP_BASE_URL}/monitors/${encodeURIComponent(monitorId)}"
       style="display:inline-block;margin-top:20px;padding:9px 16px;background:#3b82f6;color:#fff;
              border-radius:8px;text-decoration:none;font-size:13px">View monitor</a>
  </div>
</div>`;
}

export function renderAlert(alert: Alert): Mail {
  const { monitor } = alert;

  if (alert.type === 'down') {
    const reason = alert.error ?? (alert.statusCode ? `HTTP ${alert.statusCode}` : 'Unknown error');
    const rows: Array<[string, string]> = [
      ['Monitor', monitor.name],
      ['URL', monitor.url],
      ['Reason', reason],
      ['Detected', alert.startedAt.toISOString()],
    ];

    return {
      to: monitor.userEmail,
      subject: `[PulseCheck] DOWN: ${monitor.name}`,
      text: [
        `${monitor.name} is DOWN.`,
        ``,
        `URL:      ${monitor.url}`,
        `Reason:   ${reason}`,
        `Detected: ${alert.startedAt.toISOString()}`,
        ``,
        `${env.APP_BASE_URL}/monitors/${monitor.id}`,
      ].join('\n'),
      html: layout('#f87171', `${monitor.name} is down`, rows, monitor.id),
    };
  }

  const duration = formatDuration(alert.durationSeconds);
  const rows: Array<[string, string]> = [
    ['Monitor', monitor.name],
    ['URL', monitor.url],
    ['Downtime', duration],
    ['Went down', alert.startedAt.toISOString()],
    ['Recovered', alert.endedAt.toISOString()],
  ];

  return {
    to: monitor.userEmail,
    subject: `[PulseCheck] Recovered: ${monitor.name} (down ${duration})`,
    text: [
      `${monitor.name} is back UP.`,
      ``,
      `URL:       ${monitor.url}`,
      `Downtime:  ${duration}`,
      `Went down: ${alert.startedAt.toISOString()}`,
      `Recovered: ${alert.endedAt.toISOString()}`,
      ``,
      `${env.APP_BASE_URL}/monitors/${monitor.id}`,
    ].join('\n'),
    html: layout('#4ade80', `${monitor.name} recovered`, rows, monitor.id),
  };
}
