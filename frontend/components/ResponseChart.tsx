'use client';

import { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMs } from '@/lib/format';
import type { ChartPoint, Range, UptimeSummary } from '@/lib/types';

const RANGES: Range[] = ['24h', '7d', '30d'];

interface Props {
  monitorId: string;
  /** The range the server rendered. Its data arrives as props and stays fresh. */
  defaultRange: Range;
  serverSeries: ChartPoint[];
  serverUptime: UptimeSummary;
  /**
   * Changes whenever the server has newer data (we pass the monitor's
   * lastCheckedAt). Used to re-fetch a non-default range after a refresh.
   */
  dataVersion: string;
}

function tickFormatter(range: Range) {
  return (value: string) => {
    const date = new Date(value);
    return range === '24h'
      ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
}

export function ResponseChart({ monitorId, defaultRange, serverSeries, serverUptime, dataVersion }: Props) {
  const [range, setRange] = useState<Range>(defaultRange);
  const [override, setOverride] = useState<{ series: ChartPoint[]; uptime: UptimeSummary } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Earlier this component seeded useState from props, which meant new data
   * arriving after a refresh was ignored — the chart only updated on a full
   * remount, i.e. navigating away and back. Now the selected range is the only
   * client state: the default range renders straight from props, and any other
   * range is re-fetched whenever the server data changes.
   */
  useEffect(() => {
    if (range === defaultRange) {
      setOverride(null);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    fetch(`/api/monitors/${monitorId}/checks?range=${range}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<{ series: ChartPoint[]; uptime: UptimeSummary }>;
      })
      .then((body) => {
        setOverride({ series: body.series, uptime: body.uptime });
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError('Could not load that range.');
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [range, defaultRange, monitorId, dataVersion]);

  const showingDefault = range === defaultRange;
  const series = showingDefault ? serverSeries : (override?.series ?? []);
  const uptime = showingDefault ? serverUptime : override?.uptime;

  const points = series.filter((p) => p.avgResponseMs !== null);
  const pending = loading && !showingDefault && !override;

  return (
    <section className="rounded-xl border border-ink-700 bg-ink-900 p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium text-white">Response time</h2>
          <p className="mt-0.5 text-xs text-mute-400">
            {!uptime
              ? 'Loading…'
              : uptime.totalChecks === 0
                ? 'No checks in this window'
                : `${uptime.totalChecks} checks · avg ${formatMs(uptime.avgResponseMs)}`}
          </p>
        </div>

        <div role="group" aria-label="Time range" className="flex gap-1 rounded-lg border border-ink-700 p-1">
          {RANGES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRange(option)}
              aria-pressed={range === option}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                range === option ? 'bg-ink-700 text-white' : 'text-mute-400 hover:text-mute-200'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="mb-3 text-sm text-down-400">
          {error}
        </p>
      )}

      {pending ? (
        <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-ink-700">
          <p className="text-sm text-mute-400">Loading {range}…</p>
        </div>
      ) : points.length < 2 ? (
        <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-ink-700">
          <p className="text-sm text-mute-400">
            Not enough successful checks in this range to draw a chart yet.
          </p>
        </div>
      ) : (
        <div className={`h-72 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="#262f3f" vertical={false} />
              <XAxis
                dataKey="t"
                tickFormatter={tickFormatter(range)}
                stroke="#8b98ad"
                fontSize={11}
                tickMargin={8}
                minTickGap={32}
              />
              <YAxis stroke="#8b98ad" fontSize={11} width={56} tickFormatter={(v: number) => `${v}ms`} />
              <Tooltip
                contentStyle={{
                  background: '#12161f',
                  border: '1px solid #262f3f',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: '#8b98ad' }}
                // Recharts types these loosely, so coerce rather than assert.
                labelFormatter={(label) => (label ? new Date(String(label)).toLocaleString() : '')}
                formatter={(value) => [formatMs(value == null ? null : Number(value)), 'avg response']}
              />
              <Line
                type="monotone"
                dataKey="avgResponseMs"
                stroke="#4ade80"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
