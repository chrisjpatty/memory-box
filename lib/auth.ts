/**
 * Authentication: bearer tokens and timing-safe comparison.
 * Backed by PostgreSQL auth_tokens table.
 */
import { createHash, timingSafeEqual } from 'crypto';
import { nanoid } from 'nanoid';
import { query } from './db';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Compare two strings in constant time to prevent timing attacks.
 */
export function safeCompare(a: string, b: string): boolean {
  const bufA = createHash('sha256').update(a).digest();
  const bufB = createHash('sha256').update(b).digest();
  return timingSafeEqual(bufA, bufB);
}

export async function generateToken(): Promise<string> {
  const token = nanoid(48);
  const hash = hashToken(token);
  const hint = token.slice(0, 8) + '...' + token.slice(-4);

  // Deactivate any existing tokens
  await query('UPDATE auth_tokens SET active = false WHERE active = true');

  await query(
    'INSERT INTO auth_tokens (token_hash, hint, active) VALUES ($1, $2, true)',
    [hash, hint],
  );
  return token;
}

export async function validateToken(token: string): Promise<boolean> {
  const hash = hashToken(token);
  const result = await query(
    'SELECT id FROM auth_tokens WHERE token_hash = $1 AND active = true',
    [hash],
  );
  return result.rows.length > 0;
}

export async function hasActiveToken(): Promise<boolean> {
  const result = await query('SELECT id FROM auth_tokens WHERE active = true LIMIT 1');
  return result.rows.length > 0;
}

export async function getTokenHint(): Promise<string | null> {
  const result = await query('SELECT hint FROM auth_tokens WHERE active = true LIMIT 1');
  return result.rows[0]?.hint || null;
}

export async function revokeCurrentToken(): Promise<void> {
  await query('UPDATE auth_tokens SET active = false WHERE active = true');
}
