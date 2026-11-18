import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Functional guards (no class boilerplate, tree-shakeable, easy to unit test by
 * calling them inside `TestBed.runInInjectionContext`).
 *
 * Both resolve the session through the API rather than inspecting a cookie: the
 * token is httpOnly, so its mere presence proves nothing about validity. The API
 * remains the only authority — these guards exist to avoid rendering a shell the
 * visitor cannot use.
 */

/** Blocks the app shell for signed-out visitors. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const user = auth.user() ?? (await auth.restore());
  if (user) return true;

  return router.createUrlTree(['/login'], {
    // Preserve the intended destination so login can send them onward.
    queryParams: state.url === '/' ? {} : { next: state.url },
  });
};

/** Keeps signed-in users off the login and register pages. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const user = auth.user() ?? (await auth.restore());
  return user ? router.createUrlTree(['/dashboard']) : true;
};
