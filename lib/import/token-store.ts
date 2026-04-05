import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { getRedis } from '../clients';
import { githubFetch } from '../pipelines/url-handlers/github';

const REDIS_KEY = 'github:token';
const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || process.env.ADMIN_PASSWORD;
  if (!secret) throw new Error('No ENCRYPTION_KEY or ADMIN_PASSWORD set for token encryption');
  return scryptSync(secret, 'memory-box-github-token', 32);
}

function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: iv:authTag:encrypted (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(stored: string): string {
  const key = getEncryptionKey();
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
  const redis = getRedis();
  await redis.set(REDIS_KEY, encrypt(token));
  await redis.set('github-sync:username', username);
  return { username, hint: tokenHint(token) };
}

export async function getGitHubToken(): Promise<string | null> {
  const redis = getRedis();
  const stored = await redis.get(REDIS_KEY);
  if (!stored) return null;
  try {
    return decrypt(stored);
  } catch {
    return null;
  }
}

export async function removeGitHubToken(): Promise<void> {
  const redis = getRedis();
  await redis.del(REDIS_KEY);
  await redis.del('github-sync:username');
  await redis.del('github-sync:enabled');
  await redis.del('github-sync:lastCheck');
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

  const redis = getRedis();
  const username = await redis.get('github-sync:username') || undefined;

  let rateLimit: { remaining: number; limit: number; reset: string } | undefined;
  try {
    const rl = await githubFetch('/rate_limit', token);
    rateLimit = {
      remaining: rl.rate?.remaining || 0,
      limit: rl.rate?.limit || 0,
      reset: new Date((rl.rate?.reset || 0) * 1000).toISOString(),
    };
  } catch {
    // Rate limit check is non-critical — token is still valid
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
