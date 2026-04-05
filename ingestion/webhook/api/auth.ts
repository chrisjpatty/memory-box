import { Hono } from 'hono';
import { safeCompare } from '../../../lib/auth';
import { createSession, validateSession, destroySession } from '../dashboard/session';

const auth = new Hono();

const ADMIN_PASSWORD = () => process.env.ADMIN_PASSWORD;
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
  return c.json({ authenticated });
});

auth.post('/login', async (c) => {
  const ip = getClientIp(c);

  const { blocked, retryAfter } = isRateLimited(ip);
  if (blocked) {
    return c.json({ error: `Too many login attempts. Try again in ${retryAfter} seconds.` }, 429);
  }

  const { password } = await c.req.json<{ password: string }>();

  if (!ADMIN_PASSWORD()) {
    return c.json({ error: 'Admin password is not configured.' }, 500);
  }

  if (!safeCompare(password, ADMIN_PASSWORD()!)) {
    recordFailedAttempt(ip);
    return c.json({ error: 'Invalid password.' }, 401);
  }

  clearAttempts(ip);
  await createSession(c);
  return c.json({ ok: true });
});

auth.post('/logout', async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

export { auth };
