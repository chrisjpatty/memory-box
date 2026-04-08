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

export async function generateToken(name: string): Promise<string> {
  const token = nanoid(48);
  const hash = hashToken(token);
  const hint = token.slice(0, 8) + '...' + token.slice(-4);

  await query(
    'INSERT INTO auth_tokens (name, token_hash, hint, active) VALUES ($1, $2, $3, true)',
    [name, hash, hint],
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

export interface TokenInfo {
  id: number;
  name: string;
  hint: string;
  created_at: string;
}

export async function listTokens(): Promise<TokenInfo[]> {
  const result = await query(
    'SELECT id, name, hint, created_at FROM auth_tokens WHERE active = true ORDER BY created_at DESC',
  );
  return result.rows;
}

export async function revokeToken(id: number): Promise<boolean> {
  const result = await query(
    'UPDATE auth_tokens SET active = false WHERE id = $1 AND active = true',
    [id],
  );
  return result.rowCount > 0;
}
