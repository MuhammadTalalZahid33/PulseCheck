import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type {
  ChecksResponse,
  IncidentsResponse,
  MonitorDetailResponse,
  MonitorInput,
  MonitorResponse,
  MonitorsResponse,
  TimeRange,
} from '@core/models/pulsecheck.models';

/**
 * Writes and one-off reads for monitors.
 *
 * Reads that drive a template are done with `httpResource` in the components, so
 * loading and error state are signals rather than something each page reinvents.
 * Commands live here because they are imperative by nature and callers need to
 * react to success or failure.
 */
@Injectable({ providedIn: 'root' })
export class MonitorsService {
  private readonly http = inject(HttpClient);

  static readonly listUrl = '/api/monitors';

  static detailUrl(id: string): string {
    return `/api/monitors/${encodeURIComponent(id)}`;
  }

  static checksUrl(id: string, range: TimeRange): string {
    return `${MonitorsService.detailUrl(id)}/checks?range=${range}`;
  }

  static incidentsUrl(id: string): string {
    return `${MonitorsService.detailUrl(id)}/incidents`;
  }

  list(): Observable<MonitorsResponse> {
    return this.http.get<MonitorsResponse>(MonitorsService.listUrl);
  }

  detail(id: string): Observable<MonitorDetailResponse> {
    return this.http.get<MonitorDetailResponse>(MonitorsService.detailUrl(id));
  }

  checks(id: string, range: TimeRange): Observable<ChecksResponse> {
    return this.http.get<ChecksResponse>(MonitorsService.checksUrl(id, range));
  }

  incidents(id: string): Observable<IncidentsResponse> {
    return this.http.get<IncidentsResponse>(MonitorsService.incidentsUrl(id));
  }

  create(input: MonitorInput): Observable<MonitorResponse> {
    return this.http.post<MonitorResponse>(MonitorsService.listUrl, input);
  }

  update(id: string, changes: Partial<MonitorInput> & { isActive?: boolean }): Observable<MonitorResponse> {
    return this.http.patch<MonitorResponse>(MonitorsService.detailUrl(id), changes);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(MonitorsService.detailUrl(id));
  }

  /** Run a check immediately instead of waiting for the engine's next tick. */
  checkNow(id: string): Observable<{ monitor: MonitorResponse['monitor'] }> {
    return this.http.post<{ monitor: MonitorResponse['monitor'] }>(
      `${MonitorsService.detailUrl(id)}/check`,
      {},
    );
  }
}
