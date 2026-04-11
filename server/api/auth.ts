import { Hono } from 'hono';
import { hashPassword, verifyPassword, getPasswordHash, setPasswordHash } from '../../lib/auth';
import { createSession, validateSession, destroySession } from '../session';

const auth = new Hono();

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 300;

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function getClientIp(c: any): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    || c.req.header('x-real-ip')
    || 'unknown';
}

function cleanupExpired(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (entry.resetAt <= now) {
      rateLimitMap.delete(key);
    }
  }
}

function isRateLimited(ip: string): { blocked: boolean; retryAfter?: number } {
  cleanupExpired();
  const entry = rateLimitMap.get(ip);
  if (entry && entry.count >= MAX_ATTEMPTS && entry.resetAt > Date.now()) {
    const retryAfter = Math.ceil((entry.resetAt - Date.now()) / 1000);
    return { blocked: true, retryAfter };
  }
  return { blocked: false };
}

function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (entry && entry.resetAt > now) {
    entry.count += 1;
  } else {
    rateLimitMap.set(ip, { count: 1, resetAt: now + LOCKOUT_SECONDS * 1000 });
  }
}

function clearAttempts(ip: string): void {
  rateLimitMap.delete(ip);
}

auth.get('/status', async (c) => {
  const authenticated = await validateSession(c);
  const hash = await getPasswordHash();
  return c.json({ authenticated, setupRequired: !hash });
});

auth.post('/setup', async (c) => {
  const existing = await getPasswordHash();
  if (existing) {
    return c.json({ error: 'Password is already configured.' }, 400);
  }

  const { password } = await c.req.json<{ password: string }>();

  if (!password || password.length < 8) {
    return c.json({ error: 'Password must be at least 8 characters.' }, 400);
  }

  const hash = await hashPassword(password);
  await setPasswordHash(hash);
  await createSession(c);
  return c.json({ ok: true });
});

auth.post('/login', async (c) => {
  const ip = getClientIp(c);

  const { blocked, retryAfter } = isRateLimited(ip);
  if (blocked) {
    return c.json({ error: `Too many login attempts. Try again in ${retryAfter} seconds.` }, 429);
  }

  const { password } = await c.req.json<{ password: string }>();

  const hash = await getPasswordHash();
  if (!hash) {
    return c.json({ error: 'No password configured. Please complete setup first.' }, 400);
  }

  const valid = await verifyPassword(password, hash);
  if (!valid) {
    recordFailedAttempt(ip);
    return c.json({ error: 'Invalid password.' }, 401);
  }

  clearAttempts(ip);
  await createSession(c);
  return c.json({ ok: true });
});

auth.post('/change-password', async (c) => {
  const authenticated = await validateSession(c);
  if (!authenticated) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const { currentPassword, newPassword } = await c.req.json<{
    currentPassword: string;
    newPassword: string;
  }>();

  const hash = await getPasswordHash();
  if (!hash) {
    return c.json({ error: 'No password configured.' }, 400);
  }

  const valid = await verifyPassword(currentPassword, hash);
  if (!valid) {
    return c.json({ error: 'Current password is incorrect.' }, 401);
  }

  if (!newPassword || newPassword.length < 8) {
    return c.json({ error: 'New password must be at least 8 characters.' }, 400);
  }

  const newHash = await hashPassword(newPassword);
  await setPasswordHash(newHash);
  return c.json({ ok: true });
});

auth.post('/logout', async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

export { auth };
