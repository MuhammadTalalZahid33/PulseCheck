import { Router } from 'express';
import { parse } from '../../lib/validate.js';
import { currentUserId, requireAuth } from '../../middleware/auth.js';
import { loginSchema, registerSchema } from './schemas.js';
import * as authService from './service.js';
import { clearAuthCookie, setAuthCookie, signToken } from './tokens.js';

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  const input = parse(registerSchema, req.body);
  const user = await authService.register(input);

  const { token, expiresAt } = signToken(user.id);
  setAuthCookie(res, token, expiresAt);

  res.status(201).json({ user });
});

authRouter.post('/login', async (req, res) => {
  const input = parse(loginSchema, req.body);
  const user = await authService.login(input);

  const { token, expiresAt } = signToken(user.id);
  setAuthCookie(res, token, expiresAt);

  res.json({ user });
});

authRouter.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await authService.getUserById(currentUserId(req));
  res.json({ user });
});
