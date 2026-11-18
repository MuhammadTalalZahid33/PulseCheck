import type { MonitorStatus } from '@/lib/types';

const styles: Record<string, string> = {
  up: 'bg-up-950 text-up-400 ring-up-500/40',
  down: 'bg-down-950 text-down-400 ring-down-500/40',
  paused: 'bg-ink-800 text-mute-400 ring-ink-600',
  pending: 'bg-ink-800 text-mute-400 ring-ink-600',
};

const labels: Record<string, string> = {
  up: 'Up',
  down: 'Down',
  paused: 'Paused',
  pending: 'Pending',
};

export type PillState = 'up' | 'down' | 'paused' | 'pending';

export function pillState(status: MonitorStatus | null, isActive: boolean): PillState {
  if (!isActive) return 'paused';
  if (status === null) return 'pending';
  return status;
}

/**
 * Colour alone can't carry meaning — roughly 1 in 12 men have some form of
 * red/green colour blindness — so every pill also states its status in text.
 */
export function StatusPill({ state, size = 'md' }: { state: PillState; size?: 'sm' | 'md' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full ring-1 font-medium ${styles[state]} ${
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
      }`}
    >
      <span aria-hidden="true" className="text-[0.7em] leading-none">
        ●
      </span>
      {labels[state]}
    </span>
  );
}
