import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
  type ApplicationConfig,
} from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withRouterConfig,
} from '@angular/router';
import { unauthorizedInterceptor } from '@core/http/unauthorized.interceptor';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Zoneless: no zone.js patching, change detection driven by signals.
    provideZonelessChangeDetection(),

    provideRouter(
      routes,
      // Route params and query params arrive as component `input()`s, so pages
      // don't need to inject ActivatedRoute just to read `:id`.
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
      withRouterConfig({ paramsInheritanceStrategy: 'always' }),
    ),

    // withFetch: uses the Fetch API instead of XHR. Cookies ride along because
    // the dev server proxies /api to the backend, keeping everything same-origin.
    provideHttpClient(withFetch(), withInterceptors([unauthorizedInterceptor])),
  ],
};
