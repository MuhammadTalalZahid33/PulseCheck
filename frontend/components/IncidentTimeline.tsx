import { formatDateTime, formatDuration } from '@/lib/format';
import type { Incident } from '@/lib/types';

export function IncidentTimeline({ incidents }: { incidents: Incident[] }) {
  const open = incidents.filter((i) => i.endedAt === null).length;

  return (
    <section className="rounded-xl border border-ink-700 bg-ink-900 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-medium text-white">Incidents</h2>
        {incidents.length > 0 && (
          <p className="text-xs text-mute-400">
            {incidents.length} total{open > 0 && ` · ${open} ongoing`}
          </p>
        )}
      </div>

      {incidents.length === 0 ? (
        <p className="mt-4 text-sm text-mute-400">
          No incidents recorded. Nothing has gone down since this monitor was created.
        </p>
      ) : (
        /**
         * Capped height with its own scroll so a monitor with a long history
         * doesn't push the rest of the page down. tabIndex makes the region
         * keyboard-scrollable, which a plain overflow container is not.
         */
        <div
          className="scroll-panel mt-4 max-h-80 overflow-y-auto pr-2"
          tabIndex={0}
          role="region"
          aria-label="Incident history, scrollable"
        >
          <ol className="flex flex-col">
            {incidents.map((incident, index) => {
              const ongoing = incident.endedAt === null;
              return (
                <li key={incident.id} className="relative flex gap-4 pb-5 last:pb-0">
                  {index < incidents.length - 1 && (
                    <span aria-hidden="true" className="absolute left-[5px] top-4 h-full w-px bg-ink-700" />
                  )}
                  <span
                    aria-hidden="true"
                    className={`relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-ink-900 ${
                      ongoing ? 'bg-down-500' : 'bg-ink-600'
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-mute-200">
                      {ongoing ? (
                        <span className="font-medium text-down-400">Down now</span>
                      ) : (
                        <>
                          Down for{' '}
                          <span className="font-medium text-white">
                            {formatDuration(incident.durationSeconds)}
                          </span>
                        </>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-mute-400">
                      started {formatDateTime(incident.startedAt)}
                      {incident.endedAt && ` · recovered ${formatDateTime(incident.endedAt)}`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
