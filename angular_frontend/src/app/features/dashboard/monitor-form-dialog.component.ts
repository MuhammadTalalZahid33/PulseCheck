import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  type ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MonitorsService } from '@core/monitors/monitors.service';
import { issueFor, toApiFailure, type ApiFailure } from '@core/http/api-error';
import type { Monitor } from '@core/models/pulsecheck.models';

/**
 * Create/edit dialog.
 *
 * Uses the native `<dialog>` element via `showModal()`, which gives focus
 * trapping, Escape-to-close, a backdrop and correct `aria-modal` semantics for
 * free — all things a hand-rolled overlay usually gets wrong.
 *
 * Validators mirror the API's zod schema so the obvious mistakes are caught
 * before a round trip, while the server stays the authority: any issue it
 * reports is mapped back onto the matching field.
 */
@Component({
  selector: 'pc-monitor-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    <button type="button" [class]="triggerClass()" (click)="open()">{{ trigger() }}</button>

    <dialog
      #dialog
      class="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-ink-700 bg-ink-900 p-6 text-mute-200 backdrop:bg-black/70"
      [attr.aria-label]="isEdit() ? 'Edit monitor' : 'New monitor'"
      (close)="onClose()"
    >
      <form class="flex flex-col gap-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <h2 class="text-lg font-semibold text-white">
          {{ isEdit() ? 'Edit monitor' : 'New monitor' }}
        </h2>

        @if (failure(); as error) {
          <p
            role="alert"
            class="rounded-lg border border-down-500/40 bg-down-950 px-3 py-2 text-sm text-down-400"
          >
            {{ error.message }}
          </p>
        }

        <div class="flex flex-col gap-1.5">
          <label for="monitor-name" class="text-sm font-medium">Name</label>
          <input
            id="monitor-name"
            class="field"
            formControlName="name"
            placeholder="Marketing site"
            [attr.aria-invalid]="hasError('name') ? 'true' : null"
          />
          @if (hasError('name')) {
            <p class="text-xs text-down-400">{{ errorFor('name', 'Name is required.') }}</p>
          }
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="monitor-url" class="text-sm font-medium">URL</label>
          <input
            id="monitor-url"
            class="field"
            type="url"
            formControlName="url"
            placeholder="https://example.com"
            [attr.aria-invalid]="hasError('url') ? 'true' : null"
          />
          @if (hasError('url')) {
            <p class="text-xs text-down-400">
              {{ errorFor('url', 'Enter an absolute URL starting with http:// or https://') }}
            </p>
          }
        </div>

        <div class="grid grid-cols-3 gap-3">
          <div class="flex flex-col gap-1.5">
            <label for="monitor-interval" class="text-sm font-medium">Every (min)</label>
            <input
              id="monitor-interval"
              class="field"
              type="number"
              min="1"
              max="60"
              formControlName="intervalMinutes"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="monitor-status" class="text-sm font-medium">Expect</label>
            <input
              id="monitor-status"
              class="field"
              type="number"
              min="100"
              max="599"
              formControlName="expectedStatus"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="monitor-timeout" class="text-sm font-medium">Timeout (ms)</label>
            <input
              id="monitor-timeout"
              class="field"
              type="number"
              min="1000"
              max="30000"
              step="500"
              formControlName="timeoutMs"
            />
          </div>
        </div>
        @if (numericError()) {
          <p class="text-xs text-down-400">{{ numericError() }}</p>
        }

        <div class="mt-2 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-ink-700 px-3.5 py-2 text-sm transition hover:border-ink-600 hover:text-white"
            (click)="cancel()"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="rounded-lg bg-accent-500 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-accent-400 disabled:opacity-60"
            [disabled]="pending()"
          >
            {{ pending() ? 'Saving…' : isEdit() ? 'Save changes' : 'Create monitor' }}
          </button>
        </div>
      </form>
    </dialog>
  `,
})
export class MonitorFormDialogComponent {
  /** Omit to create, provide to edit. */
  readonly monitor = input<Monitor | null>(null);
  readonly trigger = input('New monitor');
  readonly triggerClass = input(
    'rounded-lg bg-accent-500 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-accent-400',
  );

  /** Emitted after a successful save so the parent can refetch. */
  readonly saved = output<void>();

  private readonly monitors = inject(MonitorsService);
  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly isEdit = computed(() => this.monitor() !== null);
  protected readonly pending = signal(false);
  protected readonly failure = signal<ApiFailure | null>(null);
  protected readonly submitted = signal(false);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    url: ['', [Validators.required, Validators.pattern(/^https?:\/\/.+/i)]],
    intervalMinutes: [5, [Validators.required, Validators.min(1), Validators.max(60)]],
    expectedStatus: [200, [Validators.required, Validators.min(100), Validators.max(599)]],
    timeoutMs: [5000, [Validators.required, Validators.min(1000), Validators.max(30_000)]],
  });

  protected readonly numericError = computed(() => {
    if (!this.submitted()) return null;
    const { intervalMinutes, expectedStatus, timeoutMs } = this.form.controls;
    if (intervalMinutes.invalid) return 'Interval must be between 1 and 60 minutes.';
    if (expectedStatus.invalid) return 'Expected status must be a valid HTTP status code.';
    if (timeoutMs.invalid) return 'Timeout must be between 1000 and 30000ms.';
    return (
      issueFor(this.failure(), 'intervalMinutes') ??
      issueFor(this.failure(), 'expectedStatus') ??
      issueFor(this.failure(), 'timeoutMs')
    );
  });

  constructor() {
    // Reset the form whenever the monitor being edited changes.
    effect(() => {
      const monitor = this.monitor();
      this.form.reset(
        monitor
          ? {
              name: monitor.name,
              url: monitor.url,
              intervalMinutes: monitor.intervalMinutes,
              expectedStatus: monitor.expectedStatus,
              timeoutMs: monitor.timeoutMs,
            }
          : { name: '', url: '', intervalMinutes: 5, expectedStatus: 200, timeoutMs: 5000 },
      );
    });
  }

  protected open(): void {
    this.failure.set(null);
    this.submitted.set(false);
    this.dialogRef().nativeElement.showModal();
  }

  protected cancel(): void {
    this.dialogRef().nativeElement.close();
  }

  protected onClose(): void {
    this.pending.set(false);
  }

  protected hasError(field: 'name' | 'url'): boolean {
    return this.submitted() && (this.form.controls[field].invalid || !!issueFor(this.failure(), field));
  }

  protected errorFor(field: 'name' | 'url', fallback: string): string {
    return issueFor(this.failure(), field) ?? fallback;
  }

  protected submit(): void {
    this.submitted.set(true);
    this.failure.set(null);
    if (this.form.invalid) return;

    const value = this.form.getRawValue();
    const existing = this.monitor();
    const request = existing
      ? this.monitors.update(existing.id, value)
      : this.monitors.create(value);

    this.pending.set(true);
    request.subscribe({
      next: () => {
        this.pending.set(false);
        this.dialogRef().nativeElement.close();
        this.saved.emit();
      },
      error: (error: unknown) => {
        this.pending.set(false);
        this.failure.set(toApiFailure(error));
      },
    });
  }
}
