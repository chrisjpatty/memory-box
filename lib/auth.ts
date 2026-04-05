import { createHash, timingSafeEqual } from 'crypto';
import { nanoid } from 'nanoid';
import type Redis from 'ioredis';

const TOKEN_PREFIX = 'auth:token:';
const USER_TOKEN_KEY = 'auth:user-token';
const USER_TOKEN_HINT_KEY = 'auth:user-token-hint';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Compare two strings in constant time to prevent timing attacks.
 * Both inputs are hashed to SHA-256 first so buffer lengths always match,
 * avoiding any length-based timing leak.
 */
export function safeCompare(a: string, b: string): boolean {
  const bufA = createHash('sha256').update(a).digest();
  const bufB = createHash('sha256').update(b).digest();
  return timingSafeEqual(bufA, bufB);
}

export async function generateToken(redis: Redis): Promise<string> {
  const token = nanoid(48);
  const hash = hashToken(token);
  await redis.set(`${TOKEN_PREFIX}${hash}`, 'active');
  await redis.set(USER_TOKEN_KEY, hash);
  await redis.set(USER_TOKEN_HINT_KEY, token.slice(0, 8) + '...' + token.slice(-4));
  return token;
}

export async function validateToken(redis: Redis, token: string): Promise<boolean> {
  const hash = hashToken(token);
  const status = await redis.get(`${TOKEN_PREFIX}${hash}`);
  return status === 'active';
}

export async function hasActiveToken(redis: Redis): Promise<boolean> {
  const hash = await redis.get(USER_TOKEN_KEY);
  if (!hash) return false;
  const status = await redis.get(`${TOKEN_PREFIX}${hash}`);
  return status === 'active';
}

export async function getTokenHint(redis: Redis): Promise<string | null> {
  return redis.get(USER_TOKEN_HINT_KEY);
}

export async function revokeCurrentToken(redis: Redis): Promise<void> {
  const hash = await redis.get(USER_TOKEN_KEY);
  if (hash) {
    await redis.del(`${TOKEN_PREFIX}${hash}`);
    await redis.del(USER_TOKEN_KEY);
    await redis.del(USER_TOKEN_HINT_KEY);
  }
}
