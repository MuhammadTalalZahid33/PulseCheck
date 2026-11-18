import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, apiFetch } from '@/lib/api';
import { formatRelative, formatUptime } from '@/lib/format';
import type { ChartPoint, Incident, Monitor, Range, RecentCheck, UptimeSummary } from '@/lib/types';
import { AutoRefresh } from '@/components/AutoRefresh';
import { IncidentTimeline } from '@/components/IncidentTimeline';
import { MonitorActions } from '@/components/MonitorActions';
import { MonitorFormDialog } from '@/components/MonitorFormDialog';
import { RecentChecks } from '@/components/RecentChecks';
import { ResponseChart } from '@/components/ResponseChart';
import { pillState, StatusPill } from '@/components/StatusPill';

interface DetailResponse {
  monitor: Monitor;
  uptime: Record<Range, UptimeSummary>;
  recentChecks: RecentCheck[];
}

const DEFAULT_RANGE: Range = '24h';

export default async function MonitorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let detail: DetailResponse;
  try {
    detail = await apiFetch<DetailResponse>(`/api/monitors/${id}`);
  } catch (error) {
    // A monitor belonging to someone else is a 404, same as one that never existed.
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const [{ series }, { incidents }] = await Promise.all([
    apiFetch<{ series: ChartPoint[] }>(`/api/monitors/${id}/checks?range=${DEFAULT_RANGE}`),
    apiFetch<{ incidents: Incident[] }>(`/api/monitors/${id}/incidents`),
  ]);

  const { monitor, uptime, recentChecks } = detail;
  const state = pillState(monitor.lastStatus, monitor.isActive);

  // When the engine should next pick this monitor up. Null means "never checked",
  // so it is due on the next tick.
  const nextCheckAt = monitor.lastCheckedAt
    ? new Date(new Date(monitor.lastCheckedAt).getTime() + monitor.intervalMinutes * 60_000).toISOString()
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <Link href="/dashboard" className="text-sm text-mute-400 transition hover:text-mute-200">
          ← All monitors
        </Link>
        {/*
          Only poll while this monitor is active, and only around the time its
          next check is actually due — a paused monitor will never produce new
          data, and a 30-minute monitor has nothing new to show after 20s.
        */}
        <AutoRefresh
          enabled={monitor.isActive}
          nextAt={nextCheckAt}
          fallbackMs={monitor.intervalMinutes * 60_000}
        />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-white">{monitor.name}</h1>
            <StatusPill state={state} />
          </div>
          <a
            href={monitor.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block truncate font-mono text-sm text-mute-400 hover:text-accent-400"
          >
            {monitor.url}
          </a>
          <p className="mt-1 text-xs text-mute-400">
            every {monitor.intervalMinutes}m · expects HTTP {monitor.expectedStatus} · {monitor.timeoutMs}ms timeout ·
            checked {formatRelative(monitor.lastCheckedAt)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <MonitorActions monitor={monitor} />
          <MonitorFormDialog
            monitor={monitor}
            trigger="Edit"
            triggerClassName="rounded-lg border border-ink-700 px-3 py-1.5 text-sm text-mute-200 transition hover:border-ink-600 hover:text-white"
          />
        </div>
      </div>

      <dl className="grid gap-4 sm:grid-cols-3">
        {(['24h', '7d', '30d'] as Range[]).map((range) => (
          <div key={range} className="rounded-xl border border-ink-700 bg-ink-900 p-4">
            <dt className="text-xs text-mute-400">{range} uptime</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-white">
              {formatUptime(uptime[range].uptimePercent)}
            </dd>
            <p className="mt-1 text-xs text-mute-400">
              {uptime[range].totalChecks === 0
                ? 'no checks yet'
                : `${uptime[range].upChecks}/${uptime[range].totalChecks} checks up`}
            </p>
          </div>
        ))}
      </dl>

      <ResponseChart
        monitorId={monitor.id}
        defaultRange={DEFAULT_RANGE}
        serverSeries={series}
        serverUptime={uptime[DEFAULT_RANGE]}
        // Bumps whenever a new check lands, so a non-default range refetches too.
        dataVersion={monitor.lastCheckedAt ?? monitor.updatedAt}
      />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <IncidentTimeline incidents={incidents} />
        <RecentChecks checks={recentChecks} />
      </div>
    </div>
  );
}
