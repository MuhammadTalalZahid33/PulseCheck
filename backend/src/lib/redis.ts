// Named import, not default: under Node's ESM->CJS interop the default of a CJS
// package is `module.exports` itself, which is the namespace, not the class.
import { Redis } from 'ioredis';
import { env } from '../env.js';

/**
 * Redis is optional. If REDIS_URL is unset, or the server is unreachable, every
 * cache operation becomes a no-op and callers fall through to Postgres. A cache
 * outage must degrade performance, never availability.
 *
 * Setting REDIS_URL is the only step needed to switch caching on: `rediss://`
 * URLs (Upstash and friends) enable TLS automatically via ioredis.
 */
export type CacheStatus = 'disabled' | 'connected' | 'connecting';

let client: Redis | null = null;
let healthy = false;
let everConnected = false;
let loggedFailure = false;

if (env.REDIS_URL) {
  client = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    /**
     * Retry forever with a capped backoff. An earlier version gave up after five
     * attempts, which meant a brief blip disabled caching until the next process
     * restart — a transient network problem should not need a redeploy to fix.
     */
    retryStrategy: (times: number) => Math.min(times * 200, 5000),
  });

  client.on('ready', () => {
    healthy = true;
    loggedFailure = false;
    console.log(everConnected ? '[redis] reconnected' : '[redis] connected');
    everConnected = true;
  });

  client.on('end', () => {
    healthy = false;
  });

  client.on('error', (err: Error) => {
    healthy = false;
    // Log the first failure, then stay quiet: retrying every few seconds would
    // otherwise flood the log while the cache is down.
    if (!loggedFailure) {
      loggedFailure = true;
      console.warn(`[redis] unavailable, serving from Postgres until it returns: ${err.message}`);
    }
  });

  client.connect().catch(() => {
    // The 'error' handler above already reported it; retries continue.
  });
} else {
  console.log('[redis] REDIS_URL not set, running without cache');
}

export const cache = {
  get isEnabled(): boolean {
    return client !== null && healthy;
  },

  get status(): CacheStatus {
    if (!client) return 'disabled';
    return healthy ? 'connected' : 'connecting';
  },

  async get<T>(key: string): Promise<T | null> {
    if (!client || !healthy) return null;
    try {
      const raw = await client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },

  async set(key: string, value: unknown, ttlSeconds: number = env.CACHE_TTL_SECONDS): Promise<void> {
    if (!client || !healthy) return;
    try {
      await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      /* ignore: cache writes are best-effort */
    }
  },

  async del(...keys: string[]): Promise<void> {
    if (!client || !healthy || keys.length === 0) return;
    try {
      await client.del(...keys);
    } catch {
      /* ignore */
    }
  },
};

export async function disconnectRedis(): Promise<void> {
  if (!client) return;
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
}
