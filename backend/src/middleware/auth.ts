import type { Request, RequestHandler } from 'express';
import { env } from '../env.js';
import { unauthorized } from '../lib/errors.js';
import { verifyToken } from '../modules/auth/tokens.js';

export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = req.cookies?.[env.COOKIE_NAME] as string | undefined;
  if (!token) {
    next(unauthorized());
    return;
  }

  try {
    req.userId = verifyToken(token);
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Read the authenticated user id on a route that sits behind requireAuth.
 * Throws rather than returning undefined so a missing guard fails loudly
 * instead of quietly querying with `userId: undefined`.
 */
export function currentUserId(req: Request): string {
  if (!req.userId) throw unauthorized();
  return req.userId;
}
