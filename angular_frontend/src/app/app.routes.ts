import type { Routes } from '@angular/router';
import { authGuard, guestGuard } from '@core/auth/auth.guards';

/**
 * Every route is lazy (`loadComponent`), so the initial bundle carries only the
 * shell and the router. The chart's Chart.js dependency is deferred further
 * still, inside the detail page template.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'dashboard',
  },
  {
    path: 'login',
    title: 'Sign in · PulseCheck',
    canActivate: [guestGuard],
    loadComponent: () => import('@features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    title: 'Create account · PulseCheck',
    canActivate: [guestGuard],
    loadComponent: () => import('@features/auth/register.page').then((m) => m.RegisterPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('@layout/app-shell.component').then((m) => m.AppShellComponent),
    children: [
      {
        path: 'dashboard',
        title: 'Dashboard · PulseCheck',
        loadComponent: () =>
          import('@features/dashboard/dashboard.page').then((m) => m.DashboardPage),
      },
      {
        path: 'monitors/:id',
        title: 'Monitor · PulseCheck',
        loadComponent: () =>
          import('@features/monitor-detail/monitor-detail.page').then((m) => m.MonitorDetailPage),
      },
    ],
  },
  {
    path: '**',
    loadComponent: () => import('@features/not-found/not-found.page').then((m) => m.NotFoundPage),
  },
];
