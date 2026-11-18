'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Monitor } from '@/lib/types';

const buttonClass =
  'rounded-lg border border-ink-700 px-3 py-1.5 text-sm text-mute-200 transition hover:border-ink-600 hover:text-white disabled:opacity-60';

export function MonitorActions({ monitor }: { monitor: Monitor }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'check' | 'pause' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(kind: 'check' | 'pause' | 'delete') {
    setBusy(kind);
    setError(null);

    try {
      const request =
        kind === 'check'
          ? fetch(`/api/monitors/${monitor.id}/check`, { method: 'POST' })
          : kind === 'pause'
            ? fetch(`/api/monitors/${monitor.id}`, {
                method: 'PATCH',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ isActive: !monitor.isActive }),
              })
            : fetch(`/api/monitors/${monitor.id}`, { method: 'DELETE' });

      const response = await request;
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'That did not work');
        return;
      }

      if (kind === 'delete') {
        router.replace('/dashboard');
        router.refresh();
        return;
      }

      router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => act('check')} disabled={busy !== null} className={buttonClass}>
          {busy === 'check' ? 'Checking…' : 'Check now'}
        </button>
        <button type="button" onClick={() => act('pause')} disabled={busy !== null} className={buttonClass}>
          {busy === 'pause' ? 'Saving…' : monitor.isActive ? 'Pause' : 'Resume'}
        </button>
        <button
          type="button"
          onClick={() => {
            // Deleting cascades to every check and incident, so make it deliberate.
            if (confirm(`Delete "${monitor.name}"? Its checks and incidents go too.`)) void act('delete');
          }}
          disabled={busy !== null}
          className="rounded-lg border border-down-500/40 px-3 py-1.5 text-sm text-down-400
                     transition hover:bg-down-950 disabled:opacity-60"
        >
          {busy === 'delete' ? 'Deleting…' : 'Delete'}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-down-400">
          {error}
        </p>
      )}
    </div>
  );
}
