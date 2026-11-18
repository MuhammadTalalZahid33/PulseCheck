/**
 * Presentation helpers. Pure functions rather than pipes: they are used from
 * both templates and TypeScript, and a pure function is easier to test than a
 * pipe instance.
 */

export function formatDuration(totalSeconds: number | null): string {
  if (totalSeconds === null) return '—';
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

/** "just now", "4m ago", "2h ago" — enough precision for a monitoring UI. */
export function formatRelative(iso: string | null): string {
  if (!iso) return 'never';

  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "no data" rather than "100%" when a window has no checks at all. */
export function formatUptime(percent: number | null): string {
  if (percent === null) return 'no data';
  return `${percent.toFixed(percent === 100 ? 0 : 2)}%`;
}

export function formatMs(ms: number | null): string {
  if (ms === null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
}

export function formatCountdown(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * When the engine should next pick a monitor up. Null means "never checked", so
 * it is due on the next tick.
 */
export function nextCheckAt(lastCheckedAt: string | null, intervalMinutes: number): string | null {
  if (!lastCheckedAt) return null;
  return new Date(new Date(lastCheckedAt).getTime() + intervalMinutes * 60_000).toISOString();
}
