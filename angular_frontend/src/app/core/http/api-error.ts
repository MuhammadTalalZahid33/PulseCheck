import { HttpErrorResponse } from '@angular/common/http';
import type { ApiFieldIssue } from '@core/models/pulsecheck.models';

/**
 * Normalises an API failure into something a template can render.
 *
 * The API returns `{ error: { code, message, details? } }`. A network failure
 * returns nothing at all, so that case gets its own message rather than
 * surfacing "Http failure response for ..." to the user.
 */
export interface ApiFailure {
  readonly status: number;
  readonly message: string;
  readonly issues: readonly ApiFieldIssue[];
}

export function toApiFailure(error: unknown): ApiFailure {
  if (!(error instanceof HttpErrorResponse)) {
    return { status: 0, message: 'Something went wrong.', issues: [] };
  }

  // status 0 means the request never reached the server.
  if (error.status === 0) {
    return {
      status: 0,
      message: 'Could not reach the server. Is the API running on port 4000?',
      issues: [],
    };
  }

  const body = error.error as { error?: { message?: string; details?: ApiFieldIssue[] } } | null;

  return {
    status: error.status,
    message: body?.error?.message ?? `Request failed (${error.status})`,
    issues: body?.error?.details ?? [],
  };
}

/** Look up the message for a single form field, e.g. issueFor(failure, 'url'). */
export function issueFor(failure: ApiFailure | null, field: string): string | null {
  return failure?.issues.find((issue) => issue.path === field)?.message ?? null;
}
