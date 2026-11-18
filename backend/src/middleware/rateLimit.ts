import rateLimit, { type Options } from 'express-rate-limit';

const shared: Partial<Options> = {
  standardHeaders: 'draft-7', // RateLimit + RateLimit-Policy, and Retry-After on 429
  legacyHeaders: false,
  // In-memory store: fine for a single-process MVP. Multiple instances would each
  // keep their own counters, so this needs a shared store before scaling out.
  handler: (_req, res) => {
    res.status(429).json({
      error: { code: 'rate_limited', message: 'Too many requests, please slow down' },
    });
  },
};

/** Broad protection for the whole API: ~100 requests per minute per IP. */
export const apiLimiter = rateLimit({
  ...shared,
  windowMs: 60_000,
  limit: 100,
  // Health polling shouldn't eat a user's request budget.
  skip: (req) => req.path === '/api/health',
});

/**
 * Credential endpoints get a much tighter budget: 20 attempts per 15 minutes per
 * IP. This is the brake on password guessing and signup spam.
 *
 * Each endpoint gets its own bucket. Sharing one would mean someone hammering
 * /login also locks legitimate users out of /register, turning a brute-force
 * attempt into a denial of signup.
 *
 * Only failures count, so someone legitimately logging in on several devices
 * isn't locked out by their own successes.
 */
function credentialLimiter() {
  return rateLimit({
    ...shared,
    windowMs: 15 * 60_000,
    limit: 20,
    skipSuccessfulRequests: true,
  });
}

export const loginLimiter = credentialLimiter();
export const registerLimiter = credentialLimiter();
