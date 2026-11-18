import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  type ElementRef,
  inject,
  input,
  model,
  viewChild,
} from '@angular/core';
import {
  Chart,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  CategoryScale,
  Tooltip,
  type ChartConfiguration,
} from 'chart.js';
import type { ChartPoint, TimeRange } from '@core/models/pulsecheck.models';
import { formatMs } from '@core/util/format.util';
import { TIME_RANGES } from '@core/models/pulsecheck.models';

/**
 * Register only the pieces this chart uses. Chart.js is tree-shakeable when
 * registered explicitly like this; the `Chart.register(...registerables)` shortcut
 * pulls in every chart type, roughly tripling the bundle cost.
 */
Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler);

@Component({
  selector: 'pc-response-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="rounded-xl border border-ink-700 bg-ink-900 p-5">
      <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="font-medium text-white">Response time</h2>
          <p class="mt-0.5 text-xs text-mute-400">{{ caption() }}</p>
        </div>

        <div
          role="group"
          aria-label="Time range"
          class="flex gap-1 rounded-lg border border-ink-700 p-1"
        >
          @for (option of ranges; track option) {
            <button
              type="button"
              class="rounded-md px-2.5 py-1 text-xs font-medium transition"
              [class]="
                option === range()
                  ? 'bg-ink-700 text-white'
                  : 'text-mute-400 hover:text-mute-200'
              "
              [attr.aria-pressed]="option === range()"
              (click)="range.set(option)"
            >
              {{ option }}
            </button>
          }
        </div>
      </div>

      @if (loading()) {
        <div
          class="flex h-72 items-center justify-center rounded-lg border border-dashed border-ink-700"
        >
          <p class="text-sm text-mute-400">Loading {{ range() }}…</p>
        </div>
      } @else if (plottable().length < 2) {
        <div
          class="flex h-72 items-center justify-center rounded-lg border border-dashed border-ink-700"
        >
          <p class="text-sm text-mute-400">
            Not enough successful checks in this range to draw a chart yet.
          </p>
        </div>
      } @else {
        <!--
          A canvas is invisible to assistive tech, so the same data is exposed as a
          short text summary. role="img" with a label beats an unlabelled canvas.
        -->
        <div class="h-72" role="img" [attr.aria-label]="chartDescription()">
          <canvas #canvas></canvas>
        </div>
      }
    </section>
  `,
})
export class ResponseChartComponent {
  readonly series = input.required<readonly ChartPoint[]>();
  readonly loading = input(false);
  readonly caption = input('');

  /** Two-way: the parent owns fetching, this component owns the selection. */
  readonly range = model.required<TimeRange>();

  protected readonly ranges = TIME_RANGES;

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private chart: Chart<'line'> | null = null;

  protected readonly plottable = () => this.series().filter((point) => point.avgResponseMs !== null);

  protected readonly chartDescription = () => {
    const points = this.plottable();
    if (points.length === 0) return 'Response time chart, no data.';
    const values = points.map((point) => point.avgResponseMs ?? 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    return `Response time over ${this.range()}: ${points.length} points, ranging from ${formatMs(min)} to ${formatMs(max)}.`;
  };

  constructor() {
    inject(DestroyRef).onDestroy(() => this.destroyChart());

    effect(() => {
      // Re-read both so the effect re-runs when either changes.
      const points = this.plottable();
      const canvas = this.canvasRef()?.nativeElement;

      if (!canvas || points.length < 2) {
        this.destroyChart();
        return;
      }

      const labels = points.map((point) => this.formatLabel(point.t));
      const data = points.map((point) => point.avgResponseMs ?? 0);

      if (this.chart) {
        // Update in place: recreating on every poll would restart animations
        // and discard the user's tooltip position.
        this.chart.data.labels = labels;
        this.chart.data.datasets[0]!.data = data;
        this.chart.update('none');
        return;
      }

      this.chart = new Chart(canvas, this.buildConfig(labels, data));
    });
  }

  private buildConfig(labels: string[], data: number[]): ChartConfiguration<'line'> {
    return {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            data,
            label: 'avg response',
            borderColor: '#4ade80',
            backgroundColor: 'rgba(74, 222, 128, 0.08)',
            borderWidth: 2,
            pointRadius: 0,
            pointHitRadius: 12,
            tension: 0.3,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#8b98ad', font: { size: 11 }, maxRotation: 0, autoSkipPadding: 24 },
            border: { color: '#262f3f' },
          },
          y: {
            grid: { color: '#262f3f' },
            ticks: {
              color: '#8b98ad',
              font: { size: 11 },
              callback: (value) => `${value}ms`,
            },
            border: { display: false },
          },
        },
        plugins: {
          tooltip: {
            backgroundColor: '#12161f',
            borderColor: '#262f3f',
            borderWidth: 1,
            titleColor: '#8b98ad',
            bodyColor: '#e6ebf2',
            displayColors: false,
            callbacks: {
              label: (item) => `avg response ${formatMs(item.parsed.y)}`,
            },
          },
        },
      },
    };
  }

  private formatLabel(iso: string): string {
    const date = new Date(iso);
    return this.range() === '24h'
      ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  private destroyChart(): void {
    this.chart?.destroy();
    this.chart = null;
  }
}
