import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { SparkPoint } from '@core/models/pulsecheck.models';

const WIDTH = 100;
const HEIGHT = 28;

/**
 * 24h response-time sparkline for a dashboard card.
 *
 * Hand-drawn SVG rather than Chart.js: a 28px decorative line does not justify
 * pulling a charting library into the dashboard bundle, and a viewBox-scaled
 * polyline is responsive for free. The real chart on the detail page uses Chart.js.
 *
 * Decorative by design — `aria-hidden`, because the uptime percentage next to it
 * already carries the information a screen reader needs.
 */
@Component({
  selector: 'pc-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (points().length < 2) {
      <div class="flex h-7 items-center text-xs text-mute-400" aria-hidden="true">
        not enough data yet
      </div>
    } @else {
      <svg
        aria-hidden="true"
        class="h-7 w-full"
        [attr.viewBox]="'0 0 ' + width + ' ' + height"
        preserveAspectRatio="none"
      >
        <polyline
          [attr.points]="polyline()"
          fill="none"
          [attr.stroke]="stroke()"
          stroke-width="1.5"
          stroke-linejoin="round"
          stroke-linecap="round"
          vector-effect="non-scaling-stroke"
        />
      </svg>
    }
  `,
})
export class SparklineComponent {
  readonly data = input.required<readonly SparkPoint[]>();
  readonly status = input<'up' | 'down' | 'muted'>('muted');

  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;

  protected readonly points = computed(() =>
    this.data().filter((point): point is SparkPoint & { ms: number } => point.ms !== null),
  );

  protected readonly stroke = computed(() => {
    switch (this.status()) {
      case 'up':
        return '#4ade80';
      case 'down':
        return '#f87171';
      default:
        return '#8b98ad';
    }
  });

  protected readonly polyline = computed(() => {
    const points = this.points();
    const values = points.map((point) => point.ms);
    const min = Math.min(...values);
    const max = Math.max(...values);
    // A flat series would divide by zero; draw it down the middle instead.
    const span = max - min || 1;
    const stepX = WIDTH / (points.length - 1);

    return points
      .map((point, index) => {
        const x = index * stepX;
        const y = HEIGHT - ((point.ms - min) / span) * (HEIGHT - 4) - 2;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  });
}
