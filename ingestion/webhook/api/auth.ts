import { Hono } from 'hono';
import { getRedis } from '../../../lib/clients';
import { safeCompare } from '../../../lib/auth';
import { createSession, validateSession, destroySession } from '../dashboard/session';
import type Redis from 'ioredis';

const auth = new Hono();

const ADMIN_PASSWORD = () => process.env.ADMIN_PASSWORD;
const LOGIN_ATTEMPT_PREFIX = 'login:attempts:';
const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 300;

function getClientIp(c: any): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    || c.req.header('x-real-ip')
    || 'unknown';
}

async function isRateLimited(redis: Redis, ip: string): Promise<{ blocked: boolean; retryAfter?: number }> {
  const key = `${LOGIN_ATTEMPT_PREFIX}${ip}`;
  const attempts = await redis.get(key);
  if (attempts && parseInt(attempts) >= MAX_ATTEMPTS) {
    const ttl = await redis.ttl(key);
    return { blocked: true, retryAfter: ttl };
  }
  return { blocked: false };
}

async function recordFailedAttempt(redis: Redis, ip: string): Promise<void> {
  const key = `${LOGIN_ATTEMPT_PREFIX}${ip}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, LOCKOUT_SECONDS);
  }
}

async function clearAttempts(redis: Redis, ip: string): Promise<void> {
  await redis.del(`${LOGIN_ATTEMPT_PREFIX}${ip}`);
}

auth.get('/status', async (c) => {
  const authenticated = await validateSession(c);
  return c.json({ authenticated });
});

auth.post('/login', async (c) => {
  const redis = getRedis();
  const ip = getClientIp(c);

  const { blocked, retryAfter } = await isRateLimited(redis, ip);
  if (blocked) {
    return c.json({ error: `Too many login attempts. Try again in ${retryAfter} seconds.` }, 429);
  }

  const { password } = await c.req.json<{ password: string }>();

  if (!ADMIN_PASSWORD()) {
    return c.json({ error: 'Admin password is not configured.' }, 500);
  }

  if (!safeCompare(password, ADMIN_PASSWORD()!)) {
    await recordFailedAttempt(redis, ip);
    return c.json({ error: 'Invalid password.' }, 401);
  }

  await clearAttempts(redis, ip);
  await createSession(c);
  return c.json({ ok: true });
});

auth.post('/logout', async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

export { auth };
