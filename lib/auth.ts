/**
 * Authentication: bearer tokens, password hashing, and timing-safe comparison.
 * Backed by PostgreSQL auth_tokens + settings tables.
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

// --- Admin password (bcrypt, stored in settings table) ---

const BCRYPT_COST = 12;

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: 'bcrypt', cost: BCRYPT_COST });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash);
}

export async function getPasswordHash(): Promise<string | null> {
  const result = await query(
    `SELECT value FROM settings WHERE key = $1`,
    ['password_hash'],
  );
  return result.rows[0]?.value ?? null;
}

export async function setPasswordHash(hash: string): Promise<void> {
  await query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    ['password_hash', hash],
  );
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
