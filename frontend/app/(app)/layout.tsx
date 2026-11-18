import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import type { User } from '@/lib/types';
import { LogoutButton } from '@/components/LogoutButton';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Also acts as the real auth gate: apiFetch redirects to /login on a 401, so
  // a forged or expired cookie can't render the shell.
  const { user } = await apiFetch<{ user: User }>('/api/auth/me');

  return (
    <div className="min-h-dvh">
      <header className="border-b border-ink-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span aria-hidden="true" className="text-up-400">
              ●
            </span>
            <span className="font-mono text-sm tracking-wide text-mute-200">PulseCheck</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-mute-400 sm:inline">{user.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
