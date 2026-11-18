'use client';

import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts';
import type { SparkPoint } from '@/lib/types';

/**
 * 24h response-time sparkline for a dashboard card. No axes, no tooltip — it's
 * a shape, not a readable chart. The detail page has the real one.
 */
export function Sparkline({ data, status }: { data: SparkPoint[]; status: 'up' | 'down' | 'muted' }) {
  const points = data.filter((p) => p.ms !== null);

  if (points.length < 2) {
    return (
      <div className="flex h-10 items-center text-xs text-mute-400" aria-hidden="true">
        not enough data yet
      </div>
    );
  }

  const stroke = status === 'up' ? '#4ade80' : status === 'down' ? '#f87171' : '#8b98ad';

  return (
    <div className="h-10" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Line
            type="monotone"
            dataKey="ms"
            stroke={stroke}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
