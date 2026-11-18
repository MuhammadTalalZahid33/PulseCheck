import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { Observable } from 'rxjs';
import { toApiFailure } from '@core/http/api-error';
import type { Monitor } from '@core/models/pulsecheck.models';
import { MonitorsService } from '@core/monitors/monitors.service';

type Action = 'check' | 'pause' | 'delete';

@Component({
  selector: 'pc-monitor-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col items-end gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" [class]="buttonClass" [disabled]="busy() !== null" (click)="run('check')">
          {{ busy() === 'check' ? 'Checking…' : 'Check now' }}
        </button>
        <button type="button" [class]="buttonClass" [disabled]="busy() !== null" (click)="run('pause')">
          @if (busy() === 'pause') {
            Saving…
          } @else {
            {{ monitor().isActive ? 'Pause' : 'Resume' }}
          }
        </button>
        <button
          type="button"
          class="rounded-lg border border-down-500/40 px-3 py-1.5 text-sm text-down-400 transition hover:bg-down-950 disabled:opacity-60"
          [disabled]="busy() !== null"
          (click)="confirmDelete()"
        >
          {{ busy() === 'delete' ? 'Deleting…' : 'Delete' }}
        </button>
      </div>
      @if (error(); as message) {
        <p role="alert" class="text-xs text-down-400">{{ message }}</p>
      }
    </div>
  `,
})
export class MonitorActionsComponent {
  readonly monitor = input.required<Monitor>();

  /** Emitted after check/pause so the parent refetches. Delete navigates away. */
  readonly changed = output<void>();

  protected readonly buttonClass =
    'rounded-lg border border-ink-700 px-3 py-1.5 text-sm text-mute-200 transition hover:border-ink-600 hover:text-white disabled:opacity-60';

  private readonly monitors = inject(MonitorsService);
  private readonly router = inject(Router);

  protected readonly busy = signal<Action | null>(null);
  protected readonly error = signal<string | null>(null);

  protected confirmDelete(): void {
    // Deleting cascades to every check and incident, so make it deliberate.
    const message = `Delete "${this.monitor().name}"? Its checks and incidents go too.`;
    if (globalThis.confirm(message)) this.run('delete');
  }

  protected run(action: Action): void {
    const monitor = this.monitor();
    this.busy.set(action);
    this.error.set(null);

    // Widened to Observable<unknown>: the three calls return different shapes and
    // none of the results are used, only success or failure.
    const request: Observable<unknown> =
      action === 'check'
        ? this.monitors.checkNow(monitor.id)
        : action === 'pause'
          ? this.monitors.update(monitor.id, { isActive: !monitor.isActive })
          : this.monitors.remove(monitor.id);

    request.subscribe({
      next: () => {
        this.busy.set(null);
        if (action === 'delete') {
          void this.router.navigate(['/dashboard']);
          return;
        }
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.error.set(toApiFailure(error).message);
      },
    });
  }
}
