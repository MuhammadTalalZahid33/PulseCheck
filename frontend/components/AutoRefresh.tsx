'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/**
 * Keeps a Server Component page current.
 *
 * The engine writes checks in the background, but a Server Component only
 * renders on navigation — so without this the page shows whatever was true when
 * you opened it. `router.refresh()` re-runs the server render and swaps in fresh
 * data while keeping client state (selected chart range, open dialogs) intact.
 *
 * Polling is driven by when the next check is actually due, not a fixed timer:
 *
 *  - `enabled: false` (monitor paused, or nothing active) means no polling at
 *    all. No new checks will be written, so there is nothing to fetch.
 *  - `nextAt` is when the next check is expected (lastCheckedAt + interval).
 *    We wait until then rather than polling on a cadence of our own.
 *  - The cron engine ticks once a minute, so a check can land up to ~60s after
 *    it becomes due. Once `nextAt` has passed we re-check every MIN_GAP_MS until
 *    the new data shows up, instead of waiting a whole interval and being wrong
 *    for twice as long.
 *
 * Polling also pauses while the tab is hidden and refreshes on return.
 */
const MIN_GAP_MS = 15_000;
const GRACE_MS = 5_000;

interface Props {
  /** False when the monitor is paused, or no monitor is active. */
  enabled?: boolean;
  /** ISO timestamp the next check is expected at. Null = expected imminently. */
  nextAt?: string | null;
  /** Fallback cadence when nextAt is unknown. */
  fallbackMs?: number;
}

function formatCountdown(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

export function AutoRefresh({ enabled = true, nextAt = null, fallbackMs = 60_000 }: Props) {
  const router = useRouter();
  const lastRefresh = useRef(Date.now());
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  // Reset the clock whenever the server sends newer data.
  useEffect(() => {
    lastRefresh.current = Date.now();
  }, [nextAt]);

  useEffect(() => {
    if (!enabled) {
      setRemainingMs(null);
      return;
    }

    const dueAt = () => {
      const expected = nextAt ? Date.parse(nextAt) + GRACE_MS : lastRefresh.current + fallbackMs;
      // Never poll faster than MIN_GAP_MS, even if the check is overdue.
      return Math.max(expected, lastRefresh.current + MIN_GAP_MS);
    };

    const ticker = setInterval(() => {
      const remaining = dueAt() - Date.now();
      setRemainingMs(Math.max(0, remaining));

      if (document.visibilityState !== 'visible') return;
      if (remaining <= 0) {
        lastRefresh.current = Date.now();
        router.refresh();
      }
    }, 1000);

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      // Came back to the tab: show current data straight away.
      lastRefresh.current = Date.now();
      router.refresh();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(ticker);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [router, enabled, nextAt, fallbackMs]);

  if (!enabled) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-mute-400">
        <span aria-hidden="true">●</span>
        <span>Paused · not refreshing</span>
      </p>
    );
  }

  return (
    <p className="flex items-center gap-1.5 text-xs text-mute-400">
      <span aria-hidden="true" className="text-up-400">
        ●
      </span>
      <span>
        Live{remainingMs === null ? '' : remainingMs <= 0 ? ' · checking…' : ` · next in ${formatCountdown(remainingMs)}`}
      </span>
    </p>
  );
}
