import { nanoid } from 'nanoid';
import type { Context } from 'hono';
import { query } from '../lib/db';

const SESSION_TTL = 86400; // 24 hours in seconds
const COOKIE_NAME = 'mb_session';
// Periodic cleanup of expired sessions
let cleanupStarted = false;
function startSessionCleanup() {
  if (cleanupStarted) return;
  cleanupStarted = true;
  Bun.cron('0 * * * *', async () => {
    try {
      await query('DELETE FROM sessions WHERE expires_at < NOW()');
    } catch { /* non-critical */ }
  });
}

export async function createSession(c: Context): Promise<string> {
  startSessionCleanup();
  const sessionId = nanoid(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL * 1000).toISOString();

  await query(
    'INSERT INTO sessions (id, expires_at) VALUES ($1, $2)',
    [sessionId, expiresAt],
  );

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

  const result = await query(
    'SELECT id FROM sessions WHERE id = $1 AND expires_at > NOW()',
    [match[1]],
  );
  return result.rows.length > 0;
}

export async function destroySession(c: Context): Promise<void> {
  const cookie = c.req.header('Cookie') || '';
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (match) {
    await query('DELETE FROM sessions WHERE id = $1', [match[1]]);
  }
  c.header(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
}
