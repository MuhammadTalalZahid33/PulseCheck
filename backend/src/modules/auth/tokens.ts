import type { Response } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env, isProd } from '../../env.js';
import { unauthorized } from '../../lib/errors.js';

interface TokenPayload {
  sub: string;
}

export function signToken(userId: string): { token: string; expiresAt: Date } {
  const token = jwt.sign({ sub: userId } satisfies TokenPayload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  });

  // Read `exp` back off the token so the cookie and the JWT expire together.
  const decoded = jwt.decode(token);
  const exp = typeof decoded === 'object' && decoded && 'exp' in decoded ? Number(decoded.exp) : null;
  const expiresAt = exp ? new Date(exp * 1000) : new Date(Date.now() + 7 * 864e5);

  return { token, expiresAt };
}

export function verifyToken(token: string): string {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (typeof payload === 'string' || !payload.sub) throw new Error('malformed payload');
    return String(payload.sub);
  } catch {
    // Expired, tampered, or signed with an old secret — all the same to the client.
    throw unauthorized('Invalid or expired session');
  }
}

export function setAuthCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(env.COOKIE_NAME, token, {
    httpOnly: true, // JS can't read it, so XSS can't exfiltrate the session
    sameSite: 'lax', // survives top-level navigation, blocks cross-site POSTs
    secure: isProd, // HTTPS-only in production; plain http in local dev
    path: '/',
    expires: expiresAt,
  });
}

export function clearAuthCookie(res: Response): void {
  // Attributes must match the ones used to set it, or the browser keeps the old cookie.
  res.clearCookie(env.COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
  });
}
