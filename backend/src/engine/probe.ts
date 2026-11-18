import { lookup } from 'node:dns/promises';
import { performance } from 'node:perf_hooks';
import { env } from '../env.js';

export type ProbeStatus = 'up' | 'down';

export interface ProbeResult {
  status: ProbeStatus;
  statusCode: number | null;
  responseTimeMs: number;
  error: string | null;
}

export interface ProbeTarget {
  url: string;
  expectedStatus: number;
  timeoutMs: number;
}

/** Ranges that should never be reachable from a public deployment. */
function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a = 0, b = 0] = parts;

  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isBlockedAddress(address: string, family: number): boolean {
  if (family === 4) return isBlockedIpv4(address);

  const ip = address.toLowerCase();
  if (ip === '::' || ip === '::1') return true;
  // IPv4-mapped (::ffff:10.0.0.1) would otherwise slip past the v4 checks.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mapped?.[1]) return isBlockedIpv4(mapped[1]);
  if (/^f[cd]/.test(ip)) return true; // unique local fc00::/7
  if (/^fe[89ab]/.test(ip)) return true; // link-local fe80::/10
  return false;
}

/**
 * Resolve the hostname and reject internal targets. Done on the resolved
 * address, not the hostname, because a public DNS name can point at 127.0.0.1
 * or a metadata endpoint.
 */
async function assertTargetAllowed(hostname: string): Promise<void> {
  if (env.ALLOW_PRIVATE_TARGETS) return;

  const addresses = await lookup(hostname, { all: true });
  const blocked = addresses.find((a) => isBlockedAddress(a.address, a.family));
  if (blocked) {
    throw new Error(`Target resolves to a private address (${blocked.address})`);
  }
}

/** Node's fetch wraps the real cause; surface something a human can act on. */
function describeError(err: unknown, timeoutMs: number): string {
  if (err instanceof Error) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      return `Timed out after ${timeoutMs}ms`;
    }
    const cause = (err as { cause?: unknown }).cause;
    if (cause instanceof Error) {
      const code = (cause as { code?: string }).code;
      return code ? `${code}: ${cause.message}` : cause.message;
    }
    const code = (err as { code?: string }).code;
    return code ? `${code}: ${err.message}` : err.message;
  }
  return String(err);
}

/**
 * Single HTTP probe. Never throws: a DNS failure, a TLS error, or a timeout is
 * a "down" result, because one broken target must not take down the tick.
 */
export async function probe(target: ProbeTarget): Promise<ProbeResult> {
  const startedAt = performance.now();
  const elapsed = () => Math.round(performance.now() - startedAt);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), target.timeoutMs);

  try {
    await assertTargetAllowed(new URL(target.url).hostname);

    const response = await fetch(target.url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'PulseCheck/1.0 (+uptime monitor)',
        accept: '*/*',
      },
    });

    // Release the socket without downloading the whole page.
    await response.body?.cancel().catch(() => undefined);

    const responseTimeMs = elapsed();
    const matched = response.status === target.expectedStatus;

    return {
      status: matched ? 'up' : 'down',
      statusCode: response.status,
      responseTimeMs,
      error: matched ? null : `Expected status ${target.expectedStatus}, got ${response.status}`,
    };
  } catch (err) {
    return {
      status: 'down',
      statusCode: null,
      responseTimeMs: elapsed(),
      error: describeError(err, target.timeoutMs),
    };
  } finally {
    clearTimeout(timer);
  }
}
