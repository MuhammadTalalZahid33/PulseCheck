/**
 * Run `worker` over `items` with at most `limit` in flight.
 *
 * Hand-rolled rather than p-limit: the ESM-only packages in that space add a
 * dependency for ~15 lines, and this shape lets one slow monitor block only its
 * own slot instead of stalling the batch.
 *
 * Rejections are captured per item, so a single failure never aborts the run.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<Array<{ ok: true; value: R } | { ok: false; error: unknown }>> {
  const results = new Array<{ ok: true; value: R } | { ok: false; error: unknown }>(items.length);
  let cursor = 0;

  async function runSlot(): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      try {
        results[index] = { ok: true, value: await worker(items[index] as T, index) };
      } catch (error) {
        results[index] = { ok: false, error };
      }
    }
  }

  const slots = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: slots }, runSlot));

  return results;
}
