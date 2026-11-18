import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { MonitorStatus } from '@core/models/pulsecheck.models';

export type PillState = 'up' | 'down' | 'paused' | 'pending';

/** Derives the display state from the two fields that decide it. */
export function pillState(status: MonitorStatus | null, isActive: boolean): PillState {
  if (!isActive) return 'paused';
  return status ?? 'pending';
}

/** Base shape, shared by every state. */
const BASE = 'inline-flex items-center gap-1.5 rounded-full font-medium ring-1';

const TONES: Readonly<Record<PillState, string>> = {
  up: 'bg-up-950 text-up-400 ring-up-500/40',
  down: 'bg-down-950 text-down-400 ring-down-500/40',
  paused: 'bg-ink-800 text-mute-400 ring-ink-600',
  pending: 'bg-ink-800 text-mute-400 ring-ink-600',
};

const SIZES = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
} as const;

const LABELS: Readonly<Record<PillState, string>> = {
  up: 'Up',
  down: 'Down',
  paused: 'Paused',
  pending: 'Pending',
};

/**
 * Status indicator.
 *
 * Colour alone cannot carry the meaning — roughly 1 in 12 men have some form of
 * red/green colour blindness — so the state is always spelled out in text and the
 * dot is decorative only.
 *
 * The whole class list is one computed string in a single `[class]` binding.
 * `[class]` is documented to take a string; passing an array that is rebuilt on
 * every change detection cycle silently renders nothing, and mixing a static
 * `class` attribute with a dynamic one invites exactly that kind of bug.
 */
@Component({
  selector: 'pc-status-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span [class]="classes()">
      <span aria-hidden="true" class="text-[0.7em] leading-none">&#9679;</span>
      {{ label() }}
    </span>
  `,
})
export class StatusPillComponent {
  readonly state = input.required<PillState>();
  readonly size = input<keyof typeof SIZES>('md');

  protected readonly label = computed(() => LABELS[this.state()]);
  protected readonly classes = computed(
    () => `${BASE} ${TONES[this.state()]} ${SIZES[this.size()]}`,
  );
}
