import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Incident } from '@core/models/pulsecheck.models';
import { formatDateTime, formatDuration } from '@core/util/format.util';

@Component({
  selector: 'pc-incident-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="rounded-xl border border-ink-700 bg-ink-900 p-5">
      <div class="flex items-baseline justify-between gap-3">
        <h2 class="font-medium text-white">Incidents</h2>
        @if (incidents().length > 0) {
          <p class="text-xs text-mute-400">
            {{ incidents().length }} total@if (openCount() > 0) { &middot; {{ openCount() }} ongoing }
          </p>
        }
      </div>

      @if (incidents().length === 0) {
        <p class="mt-4 text-sm text-mute-400">
          No incidents recorded. Nothing has gone down since this monitor was created.
        </p>
      } @else {
        <!--
          Capped height with its own scroll so a long history doesn't push the rest
          of the page down. tabindex makes the region keyboard-scrollable, which a
          plain overflow container is not.
        -->
        <div
          class="scroll-panel mt-4 max-h-80 overflow-y-auto pr-2"
          tabindex="0"
          role="region"
          aria-label="Incident history, scrollable"
        >
          <ol class="flex flex-col">
            @for (incident of incidents(); track incident.id; let last = $last) {
              <li class="relative flex gap-4 pb-5 last:pb-0">
                @if (!last) {
                  <span
                    aria-hidden="true"
                    class="absolute left-[5px] top-4 h-full w-px bg-ink-700"
                  ></span>
                }
                <span
                  aria-hidden="true"
                  class="relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-ink-900"
                  [class]="incident.endedAt === null ? 'bg-down-500' : 'bg-ink-600'"
                ></span>
                <div class="min-w-0">
                  <p class="text-sm text-mute-200">
                    @if (incident.endedAt === null) {
                      <span class="font-medium text-down-400">Down now</span>
                    } @else {
                      Down for
                      <span class="font-medium text-white">{{
                        duration(incident.durationSeconds)
                      }}</span>
                    }
                  </p>
                  <p class="mt-0.5 text-xs text-mute-400">
                    started {{ dateTime(incident.startedAt) }}
                    @if (incident.endedAt) {
                      &middot; recovered {{ dateTime(incident.endedAt) }}
                    }
                  </p>
                </div>
              </li>
            }
          </ol>
        </div>
      }
    </section>
  `,
})
export class IncidentTimelineComponent {
  readonly incidents = input.required<readonly Incident[]>();

  protected readonly openCount = computed(
    () => this.incidents().filter((incident) => incident.endedAt === null).length,
  );

  protected readonly duration = formatDuration;
  protected readonly dateTime = formatDateTime;
}
