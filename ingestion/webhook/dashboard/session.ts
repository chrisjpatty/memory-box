import { nanoid } from 'nanoid';
import type { Context } from 'hono';
import { getRedis } from '../../../lib/clients';

const SESSION_PREFIX = 'session:';
const SESSION_TTL = 86400; // 24 hours
const COOKIE_NAME = 'mb_session';

export async function createSession(c: Context): Promise<string> {
  const sessionId = nanoid(32);
  const redis = getRedis();
  await redis.set(`${SESSION_PREFIX}${sessionId}`, 'active', 'EX', SESSION_TTL);
  c.header(
    'Set-Cookie',
    `${COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL}`,
  );
  return sessionId;
}

export async function validateSession(c: Context): Promise<boolean> {
  const cookie = c.req.header('Cookie') || '';
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return false;

  const redis = getRedis();
  const status = await redis.get(`${SESSION_PREFIX}${match[1]}`);
  return status === 'active';
}

export async function destroySession(c: Context): Promise<void> {
  const cookie = c.req.header('Cookie') || '';
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (match) {
    const redis = getRedis();
    await redis.del(`${SESSION_PREFIX}${match[1]}`);
  }
  c.header(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
}
