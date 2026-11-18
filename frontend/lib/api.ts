import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Server-side fetch to the API, forwarding the caller's auth cookie.
 *
 * Browser requests reach the API through the Next rewrite (same origin, so the
 * cookie rides along automatically). Server Components have no such luxury, so
 * the cookie is attached by hand here.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const response = await fetch(`${API_ORIGIN}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...(init?.headers ?? {}),
    },
    // Monitoring data is live by definition; never serve it from a cache.
    cache: 'no-store',
  });

  if (response.status === 401) {
    // Expired or missing session: bounce to login rather than rendering an
    // error page the user can do nothing about.
    redirect('/login');
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    throw new ApiError(response.status, body?.error?.message ?? `Request failed (${response.status})`);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
