export type MonitorStatus = 'up' | 'down';

export interface Monitor {
  id: string;
  name: string;
  url: string;
  intervalMinutes: number;
  expectedStatus: number;
  timeoutMs: number;
  isActive: boolean;
  lastCheckedAt: string | null;
  lastStatus: MonitorStatus | null;
  createdAt: string;
  updatedAt: string;
}

export interface UptimeSummary {
  range: Range;
  totalChecks: number;
  upChecks: number;
  /** null means "no data in this window", which is not the same as 100%. */
  uptimePercent: number | null;
  avgResponseMs: number | null;
}

export type Range = '24h' | '7d' | '30d';

export interface SparkPoint {
  t: string;
  ms: number | null;
}

export interface DashboardMonitor extends Monitor {
  uptime24h: UptimeSummary;
  sparkline: SparkPoint[];
}

export interface RecentCheck {
  id: string;
  status: MonitorStatus;
  statusCode: number | null;
  responseTimeMs: number | null;
  error: string | null;
  checkedAt: string;
}

export interface Incident {
  id: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
}

export interface ChartPoint {
  t: string;
  avgResponseMs: number | null;
  upChecks: number;
  downChecks: number;
}

export interface User {
  id: string;
  email: string;
  createdAt: string;
}
