import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma.js';
import { conflict, notFound, unauthorized } from '../../lib/errors.js';
import type { LoginInput, RegisterInput } from './schemas.js';

const BCRYPT_ROUNDS = 12;

/**
 * A pre-computed hash used to burn the same CPU time when the email doesn't
 * exist. Without it, "unknown email" returns measurably faster than "wrong
 * password", which leaks which accounts are registered.
 */
const DUMMY_HASH = bcrypt.hashSync('pulsecheck-timing-equalizer', BCRYPT_ROUNDS);

export interface PublicUser {
  id: string;
  email: string;
  createdAt: Date;
}

const publicUser = { id: true, email: true, createdAt: true } as const;

export async function register(input: RegisterInput): Promise<PublicUser> {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  try {
    return await prisma.user.create({
      data: { email: input.email, passwordHash },
      select: publicUser,
    });
  } catch (err) {
    // P2002 = unique constraint violation. Relying on the constraint instead of
    // a prior SELECT closes the race where two registrations land together.
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002') {
      throw conflict('An account with that email already exists');
    }
    throw err;
  }
}

export async function login(input: LoginInput): Promise<PublicUser> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { ...publicUser, passwordHash: true },
  });

  const matches = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);

  // Same message either way: never reveal whether the email is registered.
  if (!user || !matches) throw unauthorized('Invalid email or password');

  return { id: user.id, email: user.email, createdAt: user.createdAt };
}

export async function getUserById(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: publicUser });
  // Valid token, deleted user.
  if (!user) throw notFound('User no longer exists');
  return user;
}
