import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { formatCountdown } from '@core/util/format.util';

/** Never poll faster than this, even when a check is overdue. */
const MIN_GAP_MS = 15_000;
/** The engine ticks once a minute, so allow a little slack past the due time. */
const GRACE_MS = 5_000;

/**
 * Emits `refresh` when the data on screen is likely to be stale.
 *
 * Cadence follows the monitor, not a fixed timer:
 *
 *  - `enabled = false` (monitor paused, or nothing active) polls not at all.
 *    A paused monitor can never record a check, so there is nothing to fetch.
 *  - `nextAt` is when the next check is due (lastCheckedAt + interval). We wait
 *    for that rather than inventing a cadence of our own — a 30-minute monitor
 *    has nothing new to show 20 seconds in.
 *  - The cron engine ticks once a minute, so a check can land up to ~60s after it
 *    becomes due. Once `nextAt` passes we re-check every MIN_GAP_MS until the data
 *    appears, instead of waiting another whole interval and being wrong for twice
 *    as long.
 *
 * Polling stops while the tab is hidden and fires once on return, so a tab left
 * open overnight neither hammers the API nor shows yesterday's data.
 */
@Component({
  selector: 'pc-auto-refresh',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (enabled()) {
      <p class="flex items-center gap-1.5 text-xs text-mute-400">
        <span aria-hidden="true" class="text-up-400">&#9679;</span>
        <span>Live{{ countdownLabel() }}</span>
      </p>
    } @else {
      <p class="flex items-center gap-1.5 text-xs text-mute-400">
        <span aria-hidden="true">&#9679;</span>
        <span>Paused &middot; not refreshing</span>
      </p>
    }
  `,
})
export class AutoRefreshComponent {
  /** False when the monitor is paused, or no monitor is active. */
  readonly enabled = input(true);
  /** ISO timestamp the next check is expected at. Null = expected imminently. */
  readonly nextAt = input<string | null>(null);
  /** Fallback cadence when nextAt is unknown. */
  readonly fallbackMs = input(60_000);

  readonly refresh = output<void>();

  private readonly remainingMs = signal<number | null>(null);
  private lastRefresh = Date.now();

  protected readonly countdownLabel = computed(() => {
    const remaining = this.remainingMs();
    if (remaining === null) return '';
    return remaining <= 0 ? ' · checking…' : ` · next in ${formatCountdown(remaining)}`;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);

    // Reset the clock whenever fresh data arrives from the parent.
    effect(() => {
      this.nextAt();
      this.lastRefresh = Date.now();
    });

    effect((onCleanup) => {
      if (!this.enabled()) {
        this.remainingMs.set(null);
        return;
      }

      const nextAt = this.nextAt();
      const fallbackMs = this.fallbackMs();

      const dueAt = (): number => {
        const expected = nextAt ? Date.parse(nextAt) + GRACE_MS : this.lastRefresh + fallbackMs;
        return Math.max(expected, this.lastRefresh + MIN_GAP_MS);
      };

      const ticker = setInterval(() => {
        const remaining = dueAt() - Date.now();
        this.remainingMs.set(Math.max(0, remaining));

        if (document.visibilityState !== 'visible') return;
        if (remaining <= 0) {
          this.lastRefresh = Date.now();
          this.refresh.emit();
        }
      }, 1000);

      const onVisibilityChange = (): void => {
        if (document.visibilityState !== 'visible') return;
        // Back on screen: show current data straight away.
        this.lastRefresh = Date.now();
        this.refresh.emit();
      };
      document.addEventListener('visibilitychange', onVisibilityChange);

      onCleanup(() => {
        clearInterval(ticker);
        document.removeEventListener('visibilitychange', onVisibilityChange);
      });
    });

    destroyRef.onDestroy(() => this.remainingMs.set(null));
  }
}
