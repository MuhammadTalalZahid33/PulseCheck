import { formatDateTime, formatMs } from '@/lib/format';
import type { RecentCheck } from '@/lib/types';
import { StatusPill } from './StatusPill';

export function RecentChecks({ checks }: { checks: RecentCheck[] }) {
  return (
    <section className="rounded-xl border border-ink-700 bg-ink-900 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-medium text-white">Recent checks</h2>
        {checks.length > 0 && <p className="text-xs text-mute-400">last {checks.length}</p>}
      </div>

      {checks.length === 0 ? (
        <p className="mt-4 text-sm text-mute-400">
          No checks recorded yet. The engine picks this monitor up within a minute, or use “Check now”.
        </p>
      ) : (
        <div
          className="scroll-panel mt-4 max-h-80 overflow-y-auto pr-2"
          tabIndex={0}
          role="region"
          aria-label="Recent checks, scrollable"
        >
          <ul className="flex flex-col divide-y divide-ink-800">
            {checks.map((check) => (
              <li key={check.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span className="flex shrink-0 items-center gap-2">
                  <StatusPill state={check.status} size="sm" />
                  <span className="tabular-nums text-mute-400">{formatDateTime(check.checkedAt)}</span>
                </span>
                <span className="min-w-0 text-right">
                  <span className="tabular-nums text-mute-200">{formatMs(check.responseTimeMs)}</span>
                  {check.statusCode !== null && (
                    <span className="ml-2 font-mono text-xs text-mute-400">{check.statusCode}</span>
                  )}
                  {check.error && (
                    <span className="block truncate text-xs text-down-400" title={check.error}>
                      {check.error}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
