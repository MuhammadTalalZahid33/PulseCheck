import { apiFetch } from '@/lib/api';
import type { DashboardMonitor } from '@/lib/types';
import { AutoRefresh } from '@/components/AutoRefresh';
import { MonitorCard } from '@/components/MonitorCard';
import { MonitorFormDialog } from '@/components/MonitorFormDialog';

export const metadata = { title: 'Dashboard · PulseCheck' };

export default async function DashboardPage() {
  const { monitors } = await apiFetch<{ monitors: DashboardMonitor[] }>('/api/monitors');

  const down = monitors.filter((m) => m.isActive && m.lastStatus === 'down').length;

  /**
   * Refresh only when something can actually change, and only when the soonest
   * check is due. With everything paused (or nothing added yet) we don't poll.
   */
  const active = monitors.filter((m) => m.isActive);
  const dueTimes = active.map((m) =>
    m.lastCheckedAt ? new Date(m.lastCheckedAt).getTime() + m.intervalMinutes * 60_000 : 0,
  );
  const nextCheckAt = dueTimes.length > 0 ? new Date(Math.min(...dueTimes)).toISOString() : null;
  const shortestInterval = active.length > 0 ? Math.min(...active.map((m) => m.intervalMinutes)) : 5;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Monitors</h1>
          <p className="mt-1 text-sm text-mute-400">
            {monitors.length === 0
              ? 'Nothing monitored yet.'
              : down > 0
                ? `${down} of ${monitors.length} currently down.`
                : `All ${monitors.length} monitor${monitors.length === 1 ? '' : 's'} up.`}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <AutoRefresh
            enabled={active.length > 0}
            nextAt={nextCheckAt}
            fallbackMs={shortestInterval * 60_000}
          />
          <MonitorFormDialog trigger="New monitor" />
        </div>
      </div>

      {monitors.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink-700 px-6 py-16 text-center">
          <p className="text-mute-200">Add your first monitor to start tracking uptime.</p>
          <p className="mt-1 text-sm text-mute-400">
            Checks begin on the next scheduled tick, within a minute.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {monitors.map((monitor) => (
            <li key={monitor.id}>
              <MonitorCard monitor={monitor} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
