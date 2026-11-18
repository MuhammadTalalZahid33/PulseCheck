import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { issueFor, toApiFailure, type ApiFailure } from '@core/http/api-error';

/**
 * Shared sign-in / sign-up form.
 *
 * Typed, non-nullable reactive form: `controls.email.value` is `string`, never
 * `string | null`, so templates and submit handlers need no defensive checks.
 *
 * The password never passes through client-side storage — submitting sets an
 * httpOnly cookie the browser manages, so JavaScript cannot read the session
 * token and an XSS bug cannot exfiltrate it.
 */
@Component({
  selector: 'pc-credentials-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <form
      class="flex w-full max-w-sm flex-col gap-5"
      [formGroup]="form"
      (ngSubmit)="submit()"
      novalidate
    >
      <div>
        <h1 class="text-2xl font-semibold text-white">
          {{ isRegister() ? 'Create your account' : 'Sign in to PulseCheck' }}
        </h1>
        <p class="mt-1 text-sm text-mute-400">
          {{ isRegister() ? 'Start monitoring in under a minute.' : 'Welcome back.' }}
        </p>
      </div>

      @if (failure(); as error) {
        <p
          role="alert"
          class="rounded-lg border border-down-500/40 bg-down-950 px-3 py-2 text-sm text-down-400"
        >
          {{ error.message }}
        </p>
      }

      <div class="flex flex-col gap-1.5">
        <label for="email" class="text-sm font-medium text-mute-200">Email</label>
        <input
          id="email"
          type="email"
          class="field"
          autocomplete="email"
          placeholder="you@example.com"
          formControlName="email"
          [attr.aria-invalid]="showEmailError() ? 'true' : null"
          [attr.aria-describedby]="showEmailError() ? 'email-error' : null"
        />
        @if (showEmailError()) {
          <p id="email-error" class="text-xs text-down-400">
            {{ emailError() }}
          </p>
        }
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="password" class="text-sm font-medium text-mute-200">Password</label>
        <input
          id="password"
          type="password"
          class="field"
          [autocomplete]="isRegister() ? 'new-password' : 'current-password'"
          placeholder="••••••••"
          formControlName="password"
          [attr.aria-invalid]="showPasswordError() ? 'true' : null"
          [attr.aria-describedby]="passwordDescribedBy()"
        />
        @if (isRegister()) {
          <p id="password-hint" class="text-xs text-mute-400">At least 8 characters.</p>
        }
        @if (showPasswordError()) {
          <p id="password-error" class="text-xs text-down-400">
            {{ passwordError() }}
          </p>
        }
      </div>

      <button
        type="submit"
        class="rounded-lg bg-accent-500 px-4 py-2.5 font-medium text-white transition hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-60"
        [disabled]="pending()"
      >
        {{ pending() ? 'Working…' : isRegister() ? 'Create account' : 'Sign in' }}
      </button>

      <p class="text-sm text-mute-400">
        {{ isRegister() ? 'Already have an account? ' : "Don't have an account? " }}
        <a
          class="text-accent-400 hover:underline"
          [routerLink]="isRegister() ? '/login' : '/register'"
        >
          {{ isRegister() ? 'Sign in' : 'Create one' }}
        </a>
      </p>
    </form>
  `,
})
export class CredentialsFormComponent {
  readonly mode = input.required<'login' | 'register'>();
  /** Where to land after success, supplied by the guard via ?next=. */
  readonly next = input<string | null>(null);

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly isRegister = computed(() => this.mode() === 'register');
  protected readonly pending = signal(false);
  protected readonly failure = signal<ApiFailure | null>(null);
  protected readonly submitted = signal(false);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  protected readonly showEmailError = computed(
    () => this.submitted() && (this.form.controls.email.invalid || !!this.serverEmailIssue()),
  );
  protected readonly showPasswordError = computed(
    () => this.submitted() && (this.form.controls.password.invalid || !!this.serverPasswordIssue()),
  );

  protected readonly emailError = computed(
    () => this.serverEmailIssue() ?? 'Enter a valid email address.',
  );
  protected readonly passwordError = computed(
    () => this.serverPasswordIssue() ?? 'Password must be at least 8 characters.',
  );

  protected readonly passwordDescribedBy = computed(() => {
    const ids: string[] = [];
    if (this.isRegister()) ids.push('password-hint');
    if (this.showPasswordError()) ids.push('password-error');
    return ids.length > 0 ? ids.join(' ') : null;
  });

  private readonly serverEmailIssue = computed(() => issueFor(this.failure(), 'email'));
  private readonly serverPasswordIssue = computed(() => issueFor(this.failure(), 'password'));

  protected submit(): void {
    this.submitted.set(true);
    this.failure.set(null);

    if (this.form.invalid) return;

    const credentials = this.form.getRawValue();
    const request = this.isRegister()
      ? this.auth.register(credentials)
      : this.auth.login(credentials);

    this.pending.set(true);
    request.subscribe({
      next: () => {
        const next = this.next();
        // Only follow same-origin paths: an attacker-supplied absolute URL in
        // ?next= would otherwise turn this into an open redirect.
        const target = next?.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
        void this.router.navigateByUrl(target);
      },
      error: (error: unknown) => {
        this.pending.set(false);
        this.failure.set(toApiFailure(error));
      },
    });
  }
}
