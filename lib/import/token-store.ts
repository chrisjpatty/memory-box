import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { query } from '../db';
import { getOrCreateEncryptionKey } from '../auth';
import { githubFetch } from '../pipeline/url-handlers/github';

const ALGORITHM = 'aes-256-gcm';

async function getEncryptionKeyBuffer(): Promise<Buffer> {
  const secret = await getOrCreateEncryptionKey();
  return scryptSync(secret, 'memory-box-github-token', 32);
}

async function encrypt(plaintext: string): Promise<string> {
  const key = await getEncryptionKeyBuffer();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: iv:authTag:encrypted (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

async function decrypt(stored: string): Promise<string> {
  const key = await getEncryptionKeyBuffer();
  const [ivHex, authTagHex, encryptedHex] = stored.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

export async function saveGitHubToken(token: string): Promise<{ username: string; hint: string }> {
  const username = await getGitHubUsername(token);
  const encryptedToken = await encrypt(token);

  await query(
    `INSERT INTO settings (key, value) VALUES ('github_token', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1`,
    [encryptedToken],
  );
  await query(
    `INSERT INTO settings (key, value) VALUES ('github_sync_username', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1`,
    [username],
  );

  return { username, hint: tokenHint(token) };
}

export async function getGitHubToken(): Promise<string | null> {
  const result = await query(`SELECT value FROM settings WHERE key = 'github_token'`);
  if (result.rows.length === 0) return null;
  try {
    return await decrypt(result.rows[0].value);
  } catch {
    return null;
  }
}

export async function removeGitHubToken(): Promise<void> {
  await query(
    `DELETE FROM settings WHERE key IN ('github_token', 'github_sync_username', 'github_sync_enabled', 'github_sync_last_check')`,
  );
}

export function tokenHint(token: string): string {
  if (token.length <= 8) return '****';
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

export async function getTokenInfo(): Promise<{
  hasToken: boolean;
  hint?: string;
  username?: string;
  rateLimit?: { remaining: number; limit: number; reset: string };
}> {
  let token: string | null;
  try {
    token = await getGitHubToken();
  } catch {
    return { hasToken: false };
  }
  if (!token) return { hasToken: false };

  const usernameResult = await query(`SELECT value FROM settings WHERE key = 'github_sync_username'`);
  const username = usernameResult.rows[0]?.value || undefined;

  let rateLimit: { remaining: number; limit: number; reset: string } | undefined;
  try {
    const rl = await githubFetch('/rate_limit', token);
    rateLimit = {
      remaining: rl.rate?.remaining || 0,
      limit: rl.rate?.limit || 0,
      reset: new Date((rl.rate?.reset || 0) * 1000).toISOString(),
    };
  } catch {
    // Rate limit check is non-critical -- token is still valid
  }

  return {
    hasToken: true,
    hint: tokenHint(token),
    username,
    rateLimit,
  };
}

export async function getGitHubUsername(token: string): Promise<string> {
  const user = await githubFetch('/user', token);
  return user.login;
}
