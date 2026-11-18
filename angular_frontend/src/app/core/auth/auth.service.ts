import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { type Observable, tap } from 'rxjs';
import type { User, UserResponse } from '@core/models/pulsecheck.models';

export interface Credentials {
  readonly email: string;
  readonly password: string;
}

/**
 * Session state.
 *
 * The JWT lives in an httpOnly cookie, so the client can neither read nor forge
 * it — the only way to know who you are is to ask the API. `restore()` does that
 * once at startup; everything else reads the resulting signal.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly currentUser = signal<User | null>(null);
  private readonly restored = signal(false);

  /** The signed-in user, or null. */
  readonly user = this.currentUser.asReadonly();
  /** True once the initial session probe has finished, successfully or not. */
  readonly isReady = this.restored.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUser() !== null);

  /**
   * Probe the session. Resolves either way: a 401 is the expected answer for a
   * visitor, not an error worth propagating.
   */
  async restore(): Promise<User | null> {
    try {
      const response = await this.fetchMe();
      this.currentUser.set(response.user);
      return response.user;
    } catch {
      this.currentUser.set(null);
      return null;
    } finally {
      this.restored.set(true);
    }
  }

  login(credentials: Credentials): Observable<UserResponse> {
    return this.http
      .post<UserResponse>('/api/auth/login', credentials)
      .pipe(tap((response) => this.currentUser.set(response.user)));
  }

  register(credentials: Credentials): Observable<UserResponse> {
    return this.http
      .post<UserResponse>('/api/auth/register', credentials)
      .pipe(tap((response) => this.currentUser.set(response.user)));
  }

  /** The API clears the httpOnly cookie; the browser cannot do it itself. */
  logout(): Observable<void> {
    return this.http
      .post<void>('/api/auth/logout', {})
      .pipe(tap(() => this.currentUser.set(null)));
  }

  /** Called by the error interceptor when any request comes back 401. */
  clearSession(): void {
    this.currentUser.set(null);
  }

  private fetchMe(): Promise<UserResponse> {
    // The guard needs to await this, so a promise is the honest shape here.
    return new Promise<UserResponse>((resolve, reject) => {
      this.http.get<UserResponse>('/api/auth/me').subscribe({
        next: resolve,
        error: reject,
      });
    });
  }
}
