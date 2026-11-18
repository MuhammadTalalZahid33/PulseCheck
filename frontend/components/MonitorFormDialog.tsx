'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Monitor } from '@/lib/types';

interface Props {
  /** Omit to create; provide to edit. */
  monitor?: Monitor;
  trigger: string;
  triggerClassName?: string;
}

const inputClass =
  'w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-white placeholder:text-mute-400 focus:border-accent-500 focus:outline-none';

export function MonitorFormDialog({ monitor, trigger, triggerClassName }: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<Array<{ path: string; message: string }>>([]);
  const [pending, setPending] = useState(false);

  const isEdit = !!monitor;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // <dialog> gives focus trapping, Esc-to-close and a backdrop for free.
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setIssues([]);

    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get('name') ?? ''),
      url: String(form.get('url') ?? ''),
      intervalMinutes: Number(form.get('intervalMinutes')),
      expectedStatus: Number(form.get('expectedStatus')),
      timeoutMs: Number(form.get('timeoutMs')),
    };

    try {
      const response = await fetch(isEdit ? `/api/monitors/${monitor.id}` : '/api/monitors', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'Could not save the monitor');
        setIssues(body?.error?.details ?? []);
        return;
      }

      setOpen(false);
      // Re-render the Server Components so the new data shows up.
      router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setPending(false);
    }
  }

  const issueFor = (field: string) => issues.find((i) => i.path === field)?.message;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          triggerClassName ??
          'rounded-lg bg-accent-500 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-accent-400'
        }
      >
        {trigger}
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        aria-labelledby="monitor-form-title"
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-ink-700 bg-ink-900
                   p-6 text-mute-200 backdrop:bg-black/70"
      >
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <h2 id="monitor-form-title" className="text-lg font-semibold text-white">
            {isEdit ? 'Edit monitor' : 'New monitor'}
          </h2>

          {error && (
            <p role="alert" className="rounded-lg border border-down-500/40 bg-down-950 px-3 py-2 text-sm text-down-400">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="text-sm font-medium">
              Name
            </label>
            <input id="name" name="name" required defaultValue={monitor?.name} className={inputClass} placeholder="Marketing site" />
            {issueFor('name') && <p className="text-xs text-down-400">{issueFor('name')}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="url" className="text-sm font-medium">
              URL
            </label>
            <input
              id="url"
              name="url"
              type="url"
              required
              defaultValue={monitor?.url}
              className={inputClass}
              placeholder="https://example.com"
            />
            {issueFor('url') && <p className="text-xs text-down-400">{issueFor('url')}</p>}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="intervalMinutes" className="text-sm font-medium">
                Every (min)
              </label>
              <input
                id="intervalMinutes"
                name="intervalMinutes"
                type="number"
                min={1}
                max={60}
                defaultValue={monitor?.intervalMinutes ?? 5}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="expectedStatus" className="text-sm font-medium">
                Expect
              </label>
              <input
                id="expectedStatus"
                name="expectedStatus"
                type="number"
                min={100}
                max={599}
                defaultValue={monitor?.expectedStatus ?? 200}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="timeoutMs" className="text-sm font-medium">
                Timeout (ms)
              </label>
              <input
                id="timeoutMs"
                name="timeoutMs"
                type="number"
                min={1000}
                max={30000}
                step={500}
                defaultValue={monitor?.timeoutMs ?? 5000}
                className={inputClass}
              />
            </div>
          </div>
          {(issueFor('intervalMinutes') || issueFor('expectedStatus') || issueFor('timeoutMs')) && (
            <p className="text-xs text-down-400">
              {issueFor('intervalMinutes') ?? issueFor('expectedStatus') ?? issueFor('timeoutMs')}
            </p>
          )}

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-ink-700 px-3.5 py-2 text-sm transition hover:border-ink-600 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-accent-500 px-3.5 py-2 text-sm font-medium text-white
                         transition hover:bg-accent-400 disabled:opacity-60"
            >
              {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create monitor'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
