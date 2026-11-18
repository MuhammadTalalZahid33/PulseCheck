import Link from 'next/link';
import { formatMs, formatRelative, formatUptime, hostOf } from '@/lib/format';
import type { DashboardMonitor } from '@/lib/types';
import { Sparkline } from './Sparkline';
import { pillState, StatusPill } from './StatusPill';

export function MonitorCard({ monitor }: { monitor: DashboardMonitor }) {
  const state = pillState(monitor.lastStatus, monitor.isActive);
  const uptime = monitor.uptime24h;

  return (
    <Link
      href={`/monitors/${monitor.id}`}
      className="group flex flex-col gap-3 rounded-xl border border-ink-700 bg-ink-900 p-4
                 transition hover:border-ink-600 hover:bg-ink-850"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-medium text-white group-hover:text-white">{monitor.name}</h2>
          <p className="truncate font-mono text-xs text-mute-400">{hostOf(monitor.url)}</p>
        </div>
        <StatusPill state={state} size="sm" />
      </div>

      <Sparkline
        data={monitor.sparkline}
        status={state === 'up' ? 'up' : state === 'down' ? 'down' : 'muted'}
      />

      <dl className="flex items-end justify-between gap-2 text-xs">
        <div>
          <dt className="text-mute-400">24h uptime</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums text-white">
            {formatUptime(uptime.uptimePercent)}
          </dd>
        </div>
        <div className="text-right">
          <dt className="text-mute-400">avg response</dt>
          <dd className="mt-0.5 tabular-nums text-mute-200">{formatMs(uptime.avgResponseMs)}</dd>
        </div>
        <div className="text-right">
          <dt className="text-mute-400">checked</dt>
          <dd className="mt-0.5 text-mute-200">{formatRelative(monitor.lastCheckedAt)}</dd>
        </div>
      </dl>
    </Link>
  );
}
