import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { DashboardMonitor } from '@core/models/pulsecheck.models';
import { formatMs, formatRelative, formatUptime, hostOf } from '@core/util/format.util';
import { SparklineComponent } from '@shared/sparkline.component';
import { pillState, StatusPillComponent } from '@shared/status-pill.component';

@Component({
  selector: 'pc-monitor-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, SparklineComponent, StatusPillComponent],
  template: `
    <a
      class="group flex h-full flex-col gap-3 rounded-xl border border-ink-700 bg-ink-900 p-4 transition hover:border-ink-600 hover:bg-ink-850"
      [routerLink]="['/monitors', monitor().id]"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 class="truncate font-medium text-white">{{ monitor().name }}</h2>
          <p class="truncate font-mono text-xs text-mute-400">{{ host() }}</p>
        </div>
        <pc-status-pill [state]="state()" size="sm" />
      </div>

      <pc-sparkline [data]="monitor().sparkline" [status]="sparkStatus()" />

      <dl class="flex items-end justify-between gap-2 text-xs">
        <div>
          <dt class="text-mute-400">24h uptime</dt>
          <dd class="mt-0.5 text-lg font-semibold tabular-nums text-white">{{ uptime() }}</dd>
        </div>
        <div class="text-right">
          <dt class="text-mute-400">avg response</dt>
          <dd class="mt-0.5 tabular-nums text-mute-200">{{ avgResponse() }}</dd>
        </div>
        <div class="text-right">
          <dt class="text-mute-400">checked</dt>
          <dd class="mt-0.5 text-mute-200">{{ checkedAgo() }}</dd>
        </div>
      </dl>
    </a>
  `,
})
export class MonitorCardComponent {
  readonly monitor = input.required<DashboardMonitor>();

  protected readonly state = computed(() =>
    pillState(this.monitor().lastStatus, this.monitor().isActive),
  );
  protected readonly sparkStatus = computed<'up' | 'down' | 'muted'>(() => {
    const state = this.state();
    return state === 'up' || state === 'down' ? state : 'muted';
  });

  protected readonly host = computed(() => hostOf(this.monitor().url));
  protected readonly uptime = computed(() => formatUptime(this.monitor().uptime24h.uptimePercent));
  protected readonly avgResponse = computed(() => formatMs(this.monitor().uptime24h.avgResponseMs));
  protected readonly checkedAgo = computed(() => formatRelative(this.monitor().lastCheckedAt));
}
