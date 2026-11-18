/**
 * Wire contracts for the PulseCheck API.
 *
 * These mirror the Express responses exactly. Keeping them in one place means a
 * backend change breaks the build in a single file rather than scattering
 * `any` through the components.
 */

export type MonitorStatus = 'up' | 'down';

export type TimeRange = '24h' | '7d' | '30d';

export const TIME_RANGES: readonly TimeRange[] = ['24h', '7d', '30d'] as const;

export interface User {
  readonly id: string;
  readonly email: string;
  readonly createdAt: string;
}

export interface Monitor {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly intervalMinutes: number;
  readonly expectedStatus: number;
  readonly timeoutMs: number;
  readonly isActive: boolean;
  readonly lastCheckedAt: string | null;
  readonly lastStatus: MonitorStatus | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UptimeSummary {
  readonly range: TimeRange;
  readonly totalChecks: number;
  readonly upChecks: number;
  /** null means "no data in this window", which is not the same as 100%. */
  readonly uptimePercent: number | null;
  readonly avgResponseMs: number | null;
}

export interface SparkPoint {
  readonly t: string;
  readonly ms: number | null;
}

export interface DashboardMonitor extends Monitor {
  readonly uptime24h: UptimeSummary;
  readonly sparkline: readonly SparkPoint[];
}

export interface RecentCheck {
  readonly id: string;
  readonly status: MonitorStatus;
  readonly statusCode: number | null;
  readonly responseTimeMs: number | null;
  readonly error: string | null;
  readonly checkedAt: string;
}

export interface Incident {
  readonly id: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly durationSeconds: number | null;
}

export interface ChartPoint {
  readonly t: string;
  readonly avgResponseMs: number | null;
  readonly upChecks: number;
  readonly downChecks: number;
}

/** Payload for creating or updating a monitor. */
export interface MonitorInput {
  readonly name: string;
  readonly url: string;
  readonly intervalMinutes: number;
  readonly expectedStatus: number;
  readonly timeoutMs: number;
}

// ---- Response envelopes ----

export interface UserResponse {
  readonly user: User;
}

export interface MonitorsResponse {
  readonly monitors: readonly DashboardMonitor[];
}

export interface MonitorResponse {
  readonly monitor: Monitor;
}

export interface MonitorDetailResponse {
  readonly monitor: Monitor;
  readonly uptime: Readonly<Record<TimeRange, UptimeSummary>>;
  readonly recentChecks: readonly RecentCheck[];
}

export interface ChecksResponse {
  readonly range: TimeRange;
  readonly series: readonly ChartPoint[];
  readonly uptime: UptimeSummary;
}

export interface IncidentsResponse {
  readonly incidents: readonly Incident[];
}

/** Field-level validation detail returned by the API's zod layer. */
export interface ApiFieldIssue {
  readonly path: string;
  readonly message: string;
}

export interface ApiErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: readonly ApiFieldIssue[];
  };
}
