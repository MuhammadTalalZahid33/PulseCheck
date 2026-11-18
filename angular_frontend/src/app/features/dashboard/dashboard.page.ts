import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import type { MonitorsResponse } from '@core/models/pulsecheck.models';
import { MonitorsService } from '@core/monitors/monitors.service';
import { AutoRefreshComponent } from '@shared/auto-refresh.component';
import { MonitorCardComponent } from './monitor-card.component';
import { MonitorFormDialogComponent } from './monitor-form-dialog.component';

@Component({
  selector: 'pc-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AutoRefreshComponent, MonitorCardComponent, MonitorFormDialogComponent],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold text-white">Monitors</h1>
          <p class="mt-1 text-sm text-mute-400">{{ summary() }}</p>
        </div>
        <div class="flex items-center gap-4">
          <pc-auto-refresh
            [enabled]="hasActiveMonitors()"
            [nextAt]="nextCheckAt()"
            [fallbackMs]="fallbackMs()"
            (refresh)="reload()"
          />
          <pc-monitor-form-dialog trigger="New monitor" (saved)="reload()" />
        </div>
      </div>

      @if (dashboard.error()) {
        <p
          role="alert"
          class="rounded-xl border border-down-500/40 bg-down-950 px-4 py-3 text-sm text-down-400"
        >
          Could not load your monitors. Check that the API is running, then retry.
        </p>
      } @else if (dashboard.isLoading() && monitors().length === 0) {
        <!-- Skeletons rather than a spinner: the layout doesn't jump when data lands. -->
        <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
          @for (placeholder of skeletons; track placeholder) {
            <li class="h-44 animate-pulse rounded-xl border border-ink-800 bg-ink-900"></li>
          }
        </ul>
      } @else if (monitors().length === 0) {
        <div class="rounded-xl border border-dashed border-ink-700 px-6 py-16 text-center">
          <p class="text-mute-200">Add your first monitor to start tracking uptime.</p>
          <p class="mt-1 text-sm text-mute-400">
            Checks begin on the next scheduled tick, within a minute.
          </p>
        </div>
      } @else {
        <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          @for (monitor of monitors(); track monitor.id) {
            <li><pc-monitor-card [monitor]="monitor" /></li>
          }
        </ul>
      }
    </div>
  `,
})
export class DashboardPage {
  protected readonly skeletons = [0, 1, 2];

  /**
   * `httpResource` turns a GET into signals: `value()`, `isLoading()`, `error()`
   * and `reload()`. No manual subscription, no teardown, and it cancels in flight
   * requests when the component goes away.
   */
  protected readonly dashboard = httpResource<MonitorsResponse>(() => MonitorsService.listUrl);

  protected readonly monitors = computed(() => this.dashboard.value()?.monitors ?? []);

  private readonly activeMonitors = computed(() => this.monitors().filter((m) => m.isActive));
  protected readonly hasActiveMonitors = computed(() => this.activeMonitors().length > 0);

  protected readonly summary = computed(() => {
    const all = this.monitors();
    if (all.length === 0) return 'Nothing monitored yet.';

    const down = all.filter((m) => m.isActive && m.lastStatus === 'down').length;
    if (down > 0) return `${down} of ${all.length} currently down.`;
    return `All ${all.length} monitor${all.length === 1 ? '' : 's'} up.`;
  });

  /** Poll for the soonest-due monitor, so a 1m monitor isn't held back by a 30m one. */
  protected readonly nextCheckAt = computed(() => {
    const dueTimes = this.activeMonitors().map((monitor) =>
      monitor.lastCheckedAt
        ? new Date(monitor.lastCheckedAt).getTime() + monitor.intervalMinutes * 60_000
        : 0,
    );
    return dueTimes.length > 0 ? new Date(Math.min(...dueTimes)).toISOString() : null;
  });

  protected readonly fallbackMs = computed(() => {
    const active = this.activeMonitors();
    const shortest =
      active.length > 0 ? Math.min(...active.map((monitor) => monitor.intervalMinutes)) : 5;
    return shortest * 60_000;
  });

  protected reload(): void {
    this.dashboard.reload();
  }
}
