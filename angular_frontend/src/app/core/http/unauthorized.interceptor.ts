import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '@core/auth/auth.service';

/** Requests where a 401 is a legitimate answer rather than an expired session. */
const SESSION_PROBES = ['/api/auth/me', '/api/auth/login', '/api/auth/register'];

/**
 * A 401 on any normal request means the cookie expired or was cleared server
 * side. Rather than let each component handle that, drop the session and send
 * the user to login once, centrally.
 *
 * Functional interceptor: registered via `withInterceptors`, no class needed.
 */
export const unauthorizedInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(request).pipe(
    catchError((error: unknown) => {
      const isUnauthorized = error instanceof HttpErrorResponse && error.status === 401;
      const isProbe = SESSION_PROBES.some((path) => request.url.startsWith(path));

      if (isUnauthorized && !isProbe) {
        auth.clearSession();
        void router.navigate(['/login'], { queryParams: { next: router.url } });
      }

      return throwError(() => error);
    }),
  );
};
