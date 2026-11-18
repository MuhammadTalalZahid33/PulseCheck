import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'pc-not-found-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <main class="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-3 px-6 text-center">
      <p class="font-mono text-sm text-mute-400">404</p>
      <h1 class="text-2xl font-semibold text-white">Page not found</h1>
      <p class="text-mute-400">That URL doesn't match anything in PulseCheck.</p>
      <a
        routerLink="/dashboard"
        class="mx-auto mt-2 rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-400"
      >
        Go to dashboard
      </a>
    </main>
  `,
})
export class NotFoundPage {}
