'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

interface FieldIssue {
  path: string;
  message: string;
}

/**
 * Login and register share a form. Submitting posts to the API through the
 * same-origin proxy, so the browser stores the httpOnly cookie itself — no
 * token ever passes through JavaScript.
 */
export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const [pending, setPending] = useState(false);

  const isRegister = mode === 'register';

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setIssues([]);

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'Something went wrong');
        setIssues(body?.error?.details ?? []);
        return;
      }

      // router.refresh() so the proxy sees the new cookie on the next render.
      const next = params.get('next');
      router.replace(next && next.startsWith('/') ? next : '/dashboard');
      router.refresh();
    } catch {
      setError('Could not reach the server. Is the API running?');
    } finally {
      setPending(false);
    }
  }

  const issueFor = (field: string) => issues.find((i) => i.path === field)?.message;

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-5" noValidate>
      <div>
        <h1 className="text-2xl font-semibold text-white">
          {isRegister ? 'Create your account' : 'Sign in to PulseCheck'}
        </h1>
        <p className="mt-1 text-sm text-mute-400">
          {isRegister ? 'Start monitoring in under a minute.' : 'Welcome back.'}
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-down-500/40 bg-down-950 px-3 py-2 text-sm text-down-400">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-mute-200">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!issueFor('email')}
          aria-describedby={issueFor('email') ? 'email-error' : undefined}
          className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-white
                     placeholder:text-mute-400 focus:border-accent-500 focus:outline-none"
          placeholder="you@example.com"
        />
        {issueFor('email') && (
          <p id="email-error" className="text-xs text-down-400">
            {issueFor('email')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-mute-200">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!issueFor('password')}
          aria-describedby={isRegister ? 'password-hint' : issueFor('password') ? 'password-error' : undefined}
          className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-white
                     placeholder:text-mute-400 focus:border-accent-500 focus:outline-none"
          placeholder="••••••••"
        />
        {isRegister && (
          <p id="password-hint" className="text-xs text-mute-400">
            At least 8 characters.
          </p>
        )}
        {issueFor('password') && (
          <p id="password-error" className="text-xs text-down-400">
            {issueFor('password')}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-accent-500 px-4 py-2.5 font-medium text-white transition
                   hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Working…' : isRegister ? 'Create account' : 'Sign in'}
      </button>

      <p className="text-sm text-mute-400">
        {isRegister ? 'Already have an account? ' : "Don't have an account? "}
        <Link href={isRegister ? '/login' : '/register'} className="text-accent-400 hover:underline">
          {isRegister ? 'Sign in' : 'Create one'}
        </Link>
      </p>
    </form>
  );
}
