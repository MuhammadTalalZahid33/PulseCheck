import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  TIME_RANGES,
  type ChecksResponse,
  type IncidentsResponse,
  type MonitorDetailResponse,
  type TimeRange,
} from '@core/models/pulsecheck.models';
import { MonitorsService } from '@core/monitors/monitors.service';
import { formatRelative, formatUptime, nextCheckAt } from '@core/util/format.util';
import { AutoRefreshComponent } from '@shared/auto-refresh.component';
import { pillState, StatusPillComponent } from '@shared/status-pill.component';
import { MonitorFormDialogComponent } from '@features/dashboard/monitor-form-dialog.component';
import { IncidentTimelineComponent } from './incident-timeline.component';
import { MonitorActionsComponent } from './monitor-actions.component';
import { RecentChecksComponent } from './recent-checks.component';
import { ResponseChartComponent } from './response-chart.component';

@Component({
  selector: 'pc-monitor-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AutoRefreshComponent,
    StatusPillComponent,
    MonitorActionsComponent,
    MonitorFormDialogComponent,
    IncidentTimelineComponent,
    RecentChecksComponent,
    ResponseChartComponent,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex items-center justify-between gap-3">
        <a routerLink="/dashboard" class="text-sm text-mute-400 transition hover:text-mute-200">
          &larr; All monitors
        </a>
        @if (monitor(); as current) {
          <pc-auto-refresh
            [enabled]="current.isActive"
            [nextAt]="dueAt()"
            [fallbackMs]="current.intervalMinutes * 60000"
            (refresh)="reloadAll()"
          />
        }
      </div>

      @if (detail.error()) {
        <div class="rounded-xl border border-ink-700 bg-ink-900 px-6 py-16 text-center">
          <h1 class="text-lg font-semibold text-white">
            {{ detail.error() && notFound() ? 'Monitor not found' : 'Could not load this monitor' }}
          </h1>
          <p class="mt-2 text-sm text-mute-400">
            {{
              notFound()
                ? 'It may have been deleted, or it belongs to another account.'
                : 'Check that the API is running and try again.'
            }}
          </p>
          <a
            routerLink="/dashboard"
            class="mt-4 inline-block rounded-lg bg-accent-500 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-accent-400"
          >
            Back to dashboard
          </a>
        </div>
      } @else if (monitor(); as current) {
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-3">
              <h1 class="text-2xl font-semibold text-white">{{ current.name }}</h1>
              <pc-status-pill [state]="state()" />
            </div>
            <a
              class="mt-1 inline-block truncate font-mono text-sm text-mute-400 hover:text-accent-400"
              [href]="current.url"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ current.url }}
            </a>
            <p class="mt-1 text-xs text-mute-400">
              every {{ current.intervalMinutes }}m &middot; expects HTTP
              {{ current.expectedStatus }} &middot; {{ current.timeoutMs }}ms timeout &middot;
              checked {{ checkedAgo() }}
            </p>
          </div>

          <div class="flex flex-col items-end gap-2">
            <pc-monitor-actions [monitor]="current" (changed)="reloadAll()" />
            <pc-monitor-form-dialog
              [monitor]="current"
              trigger="Edit"
              triggerClass="rounded-lg border border-ink-700 px-3 py-1.5 text-sm text-mute-200 transition hover:border-ink-600 hover:text-white"
              (saved)="reloadAll()"
            />
          </div>
        </div>

        <dl class="grid gap-4 sm:grid-cols-3">
          @for (range of ranges; track range) {
            <div class="rounded-xl border border-ink-700 bg-ink-900 p-4">
              <dt class="text-xs text-mute-400">{{ range }} uptime</dt>
              <dd class="mt-1 text-2xl font-semibold tabular-nums text-white">
                {{ uptimeFor(range) }}
              </dd>
              <p class="mt-1 text-xs text-mute-400">{{ checkCountFor(range) }}</p>
            </div>
          }
        </dl>

        <!--
          Chart.js only downloads once the chart scrolls into view, keeping it out
          of the initial route bundle for anyone who never scrolls that far.
        -->
        @defer (on viewport) {
          <pc-response-chart
            [(range)]="range"
            [series]="series()"
            [loading]="checks.isLoading()"
            [caption]="chartCaption()"
          />
        } @placeholder {
          <div class="h-96 rounded-xl border border-ink-700 bg-ink-900"></div>
        } @loading (minimum 200ms) {
          <div class="flex h-96 items-center justify-center rounded-xl border border-ink-700 bg-ink-900">
            <p class="text-sm text-mute-400">Loading chart…</p>
          </div>
        }

        <div class="grid items-start gap-6 lg:grid-cols-2">
          <pc-incident-timeline [incidents]="incidentList()" />
          <pc-recent-checks [checks]="recentChecks()" />
        </div>
      }
    </div>
  `,
})
export class MonitorDetailPage {
  /** Bound from the :id route param by withComponentInputBinding(). */
  readonly id = input.required<string>();

  protected readonly ranges = TIME_RANGES;
  protected readonly range = signal<TimeRange>('24h');

  /**
   * Three resources rather than one aggregate call, so the chart's range toggle
   * refetches only the series. Each re-runs automatically when a signal it reads
   * changes — `id` for all three, plus `range` for the series.
   */
  protected readonly detail = httpResource<MonitorDetailResponse>(() =>
    MonitorsService.detailUrl(this.id()),
  );

  protected readonly checks = httpResource<ChecksResponse>(() =>
    MonitorsService.checksUrl(this.id(), this.range()),
  );

  protected readonly incidents = httpResource<IncidentsResponse>(() =>
    MonitorsService.incidentsUrl(this.id()),
  );

  protected readonly monitor = computed(() => this.detail.value()?.monitor ?? null);
  protected readonly recentChecks = computed(() => this.detail.value()?.recentChecks ?? []);
  protected readonly series = computed(() => this.checks.value()?.series ?? []);
  protected readonly incidentList = computed(() => this.incidents.value()?.incidents ?? []);

  protected readonly state = computed(() => {
    const monitor = this.monitor();
    return monitor ? pillState(monitor.lastStatus, monitor.isActive) : 'pending';
  });

  protected readonly notFound = computed(() => {
    const error = this.detail.error();
    return !!error && (error as { status?: number }).status === 404;
  });

  protected readonly checkedAgo = computed(() => formatRelative(this.monitor()?.lastCheckedAt ?? null));

  protected readonly dueAt = computed(() => {
    const monitor = this.monitor();
    return monitor ? nextCheckAt(monitor.lastCheckedAt, monitor.intervalMinutes) : null;
  });

  protected readonly chartCaption = computed(() => {
    const uptime = this.checks.value()?.uptime;
    if (!uptime) return '';
    if (uptime.totalChecks === 0) return 'No checks in this window';
    const avg = uptime.avgResponseMs === null ? '—' : `${uptime.avgResponseMs}ms`;
    return `${uptime.totalChecks} checks · avg ${avg}`;
  });

  protected uptimeFor(range: TimeRange): string {
    return formatUptime(this.detail.value()?.uptime[range].uptimePercent ?? null);
  }

  protected checkCountFor(range: TimeRange): string {
    const summary = this.detail.value()?.uptime[range];
    if (!summary || summary.totalChecks === 0) return 'no checks yet';
    return `${summary.upChecks}/${summary.totalChecks} checks up`;
  }

  protected reloadAll(): void {
    this.detail.reload();
    this.checks.reload();
    this.incidents.reload();
  }
}
