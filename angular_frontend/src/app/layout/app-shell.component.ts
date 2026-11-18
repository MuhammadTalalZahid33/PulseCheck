import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';

/**
 * Chrome for the signed-in area: brand, current user, sign out.
 *
 * There is deliberately no sidebar. A sidebar navigates between top-level
 * sections and this app has one (monitors); the detail page is a child of the
 * dashboard, not its peer, so a breadcrumb back-link is the right affordance and
 * the horizontal space goes to the chart instead.
 */
@Component({
  selector: 'pc-app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink],
  template: `
    <div class="min-h-dvh">
      <header class="border-b border-ink-800">
        <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <a routerLink="/dashboard" class="flex items-center gap-2">
            <span aria-hidden="true" class="text-up-400">&#9679;</span>
            <span class="font-mono text-sm tracking-wide text-mute-200">PulseCheck</span>
          </a>

          <div class="flex items-center gap-3">
            @if (user(); as currentUser) {
              <span class="hidden text-sm text-mute-400 sm:inline">{{ currentUser.email }}</span>
            }
            <button
              type="button"
              class="rounded-lg border border-ink-700 px-3 py-1.5 text-sm text-mute-200 transition hover:border-ink-600 hover:text-white disabled:opacity-60"
              [disabled]="signingOut()"
              (click)="signOut()"
            >
              {{ signingOut() ? 'Signing out…' : 'Sign out' }}
            </button>
          </div>
        </div>
      </header>

      <main class="mx-auto max-w-6xl px-6 py-8">
        <router-outlet />
      </main>
    </div>
  `,
})
export class AppShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly user = this.auth.user;
  protected readonly signingOut = signal(false);

  protected signOut(): void {
    this.signingOut.set(true);
    this.auth.logout().subscribe({
      // Navigate either way: if the request failed the cookie may still be gone.
      next: () => void this.router.navigate(['/login']),
      error: () => {
        this.signingOut.set(false);
        void this.router.navigate(['/login']);
      },
    });
  }
}
