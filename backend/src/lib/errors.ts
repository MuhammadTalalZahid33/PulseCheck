/**
 * Errors that are safe to show the client. Anything else becomes a generic 500
 * so internal details (SQL, stack traces, hostnames) never leak out.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string = 'error',
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (msg: string, details?: unknown) =>
  new AppError(400, msg, 'bad_request', details);
export const unauthorized = (msg = 'Not authenticated') => new AppError(401, msg, 'unauthorized');
export const notFound = (msg = 'Not found') => new AppError(404, msg, 'not_found');
export const conflict = (msg: string) => new AppError(409, msg, 'conflict');
