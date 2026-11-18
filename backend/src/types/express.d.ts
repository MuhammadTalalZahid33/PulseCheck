/**
 * requireAuth attaches the authenticated user's id to the request.
 * Optional on the type so unauthenticated routes stay honest; use
 * `currentUserId(req)` to read it where auth is guaranteed.
 */
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export {};
