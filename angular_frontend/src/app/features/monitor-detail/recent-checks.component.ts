import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { RecentCheck } from '@core/models/pulsecheck.models';
import { formatDateTime, formatMs } from '@core/util/format.util';
import { StatusPillComponent } from '@shared/status-pill.component';

@Component({
  selector: 'pc-recent-checks',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StatusPillComponent],
  template: `
    <section class="rounded-xl border border-ink-700 bg-ink-900 p-5">
      <div class="flex items-baseline justify-between gap-3">
        <h2 class="font-medium text-white">Recent checks</h2>
        @if (checks().length > 0) {
          <p class="text-xs text-mute-400">last {{ checks().length }}</p>
        }
      </div>

      @if (checks().length === 0) {
        <p class="mt-4 text-sm text-mute-400">
          No checks recorded yet. The engine picks this monitor up within a minute, or use
          &ldquo;Check now&rdquo;.
        </p>
      } @else {
        <div
          class="scroll-panel mt-4 max-h-80 overflow-y-auto pr-2"
          tabindex="0"
          role="region"
          aria-label="Recent checks, scrollable"
        >
          <ul class="flex flex-col divide-y divide-ink-800">
            @for (check of checks(); track check.id) {
              <li class="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span class="flex shrink-0 items-center gap-2">
                  <pc-status-pill [state]="check.status" size="sm" />
                  <span class="tabular-nums text-mute-400">{{ dateTime(check.checkedAt) }}</span>
                </span>
                <span class="min-w-0 text-right">
                  <span class="tabular-nums text-mute-200">{{ ms(check.responseTimeMs) }}</span>
                  @if (check.statusCode !== null) {
                    <span class="ml-2 font-mono text-xs text-mute-400">{{ check.statusCode }}</span>
                  }
                  @if (check.error) {
                    <span class="block truncate text-xs text-down-400" [title]="check.error">
                      {{ check.error }}
                    </span>
                  }
                </span>
              </li>
            }
          </ul>
        </div>
      }
    </section>
  `,
})
export class RecentChecksComponent {
  readonly checks = input.required<readonly RecentCheck[]>();

  protected readonly dateTime = formatDateTime;
  protected readonly ms = formatMs;
}
