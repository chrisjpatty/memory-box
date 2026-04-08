import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'crypto';
import { query } from '../db';
import { getOrCreateEncryptionKey } from '../auth';
import { twitterFetch } from '../pipeline/url-handlers/twitter';

const ALGORITHM = 'aes-256-gcm';
const SCOPES = 'bookmark.read tweet.read users.read offline.access';

// --- Encryption (same pattern as GitHub token store, different salt) ---

async function getEncryptionKeyBuffer(): Promise<Buffer> {
  const secret = await getOrCreateEncryptionKey();
  return scryptSync(secret, 'memory-box-twitter-token', 32);
}

async function encrypt(plaintext: string): Promise<string> {
  const key = await getEncryptionKeyBuffer();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
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

// --- DB helpers ---

async function saveSetting(key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = $2`,
    [key, value],
  );
}

async function getSetting(key: string): Promise<string | null> {
  const result = await query(`SELECT value FROM settings WHERE key = $1`, [key]);
  return result.rows[0]?.value || null;
}

async function deleteSetting(key: string): Promise<void> {
  await query(`DELETE FROM settings WHERE key = $1`, [key]);
}

// --- Client Credentials ---

export async function saveTwitterCredentials(
  clientId: string,
  clientSecret: string,
): Promise<void> {
  await saveSetting('twitter_client_id', await encrypt(clientId));
  await saveSetting('twitter_client_secret', await encrypt(clientSecret));
}

export async function getTwitterCredentials(): Promise<{
  clientId: string;
  clientSecret: string;
} | null> {
  const encClientId = await getSetting('twitter_client_id');
  const encClientSecret = await getSetting('twitter_client_secret');
  if (!encClientId || !encClientSecret) return null;
  try {
    return { clientId: await decrypt(encClientId), clientSecret: await decrypt(encClientSecret) };
  } catch {
    return null;
  }
}

// --- OAuth 2.0 PKCE Flow ---

/**
 * Generate the Twitter authorization URL and store PKCE state.
 * The caller must provide the callback URL that matches what the user
 * configured in their Twitter app settings.
 */
export async function generateAuthUrl(callbackUrl: string): Promise<string> {
  const creds = await getTwitterCredentials();
  if (!creds) throw new Error('No Twitter credentials saved');

  const state = randomBytes(16).toString('hex');
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

  // Store temporarily for callback validation
  await saveSetting('twitter_oauth_state', state);
  await saveSetting('twitter_oauth_verifier', codeVerifier);
  await saveSetting('twitter_oauth_callback', callbackUrl);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: creds.clientId,
    redirect_uri: callbackUrl,
    scope: SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return `https://twitter.com/i/oauth2/authorize?${params}`;
}

/**
 * Handle the OAuth callback from Twitter: validate state, exchange the
 * authorization code for access + refresh tokens, store everything.
 */
export async function handleOAuthCallback(
  code: string,
  state: string,
): Promise<{ username: string; userId: string }> {
  // Validate state (CSRF protection)
  const savedState = await getSetting('twitter_oauth_state');
  if (!savedState || savedState !== state) {
    throw new Error('Invalid OAuth state — possible CSRF attack');
  }

  const codeVerifier = await getSetting('twitter_oauth_verifier');
  if (!codeVerifier) throw new Error('Missing PKCE code verifier');

  const callbackUrl = await getSetting('twitter_oauth_callback');
  if (!callbackUrl) throw new Error('Missing OAuth callback URL');

  const creds = await getTwitterCredentials();
  if (!creds) throw new Error('No Twitter credentials saved');

  // Exchange authorization code for tokens
  const tokenResponse = await exchangeCode(
    code,
    codeVerifier,
    callbackUrl,
    creds.clientId,
    creds.clientSecret,
  );

  // Store tokens
  await saveSetting('twitter_access_token', await encrypt(tokenResponse.access_token));
  if (tokenResponse.refresh_token) {
    await saveSetting('twitter_refresh_token', await encrypt(tokenResponse.refresh_token));
  }
  const expiresAt = new Date(
    Date.now() + tokenResponse.expires_in * 1000,
  ).toISOString();
  await saveSetting('twitter_token_expires_at', expiresAt);

  // Clean up temporary OAuth state
  await deleteSetting('twitter_oauth_state');
  await deleteSetting('twitter_oauth_verifier');
  await deleteSetting('twitter_oauth_callback');

  // Fetch and store user info
  const userInfo = await getTwitterUserInfo(tokenResponse.access_token);
  await saveSetting('twitter_user_id', userInfo.userId);
  await saveSetting('twitter_username', userInfo.username);

  return userInfo;
}

// --- Token Access (with auto-refresh) ---

/**
 * Get a valid access token. Automatically refreshes if the current token
 * is expired or close to expiring (< 5 min remaining).
 */
export async function getTwitterToken(): Promise<string | null> {
  const encToken = await getSetting('twitter_access_token');
  if (!encToken) return null;

  let accessToken: string;
  try {
    accessToken = await decrypt(encToken);
  } catch {
    return null;
  }

  // Check if token needs refreshing
  const expiresAt = await getSetting('twitter_token_expires_at');
  if (expiresAt) {
    const msRemaining = new Date(expiresAt).getTime() - Date.now();
    if (msRemaining < 5 * 60 * 1000) {
      const refreshed = await tryRefreshToken();
      if (refreshed) return refreshed;
      // If refresh failed but token hasn't fully expired yet, use it anyway
      if (msRemaining > 0) return accessToken;
      return null;
    }
  }

  return accessToken;
}

async function tryRefreshToken(): Promise<string | null> {
  const encRefresh = await getSetting('twitter_refresh_token');
  if (!encRefresh) return null;

  const creds = await getTwitterCredentials();
  if (!creds) return null;

  let refreshToken: string;
  try {
    refreshToken = await decrypt(encRefresh);
  } catch {
    return null;
  }

  try {
    const tokenResponse = await refreshAccessToken(
      refreshToken,
      creds.clientId,
      creds.clientSecret,
    );

    await saveSetting('twitter_access_token', await encrypt(tokenResponse.access_token));
    if (tokenResponse.refresh_token) {
      await saveSetting(
        'twitter_refresh_token',
        await encrypt(tokenResponse.refresh_token),
      );
    }
    const expiresAt = new Date(
      Date.now() + tokenResponse.expires_in * 1000,
    ).toISOString();
    await saveSetting('twitter_token_expires_at', expiresAt);

    return tokenResponse.access_token;
  } catch (err) {
    console.warn('Twitter token refresh failed:', err);
    return null;
  }
}

// --- Status / Info ---

export async function getTwitterTokenInfo(): Promise<{
  hasCredentials: boolean;
  hasToken: boolean;
  username?: string;
  userId?: string;
}> {
  const creds = await getTwitterCredentials();
  if (!creds) return { hasCredentials: false, hasToken: false };

  const encToken = await getSetting('twitter_access_token');
  if (!encToken) return { hasCredentials: true, hasToken: false };

  const username = (await getSetting('twitter_username')) || undefined;
  const userId = (await getSetting('twitter_user_id')) || undefined;

  return { hasCredentials: true, hasToken: true, username, userId };
}

export async function getTwitterUserId(): Promise<string | null> {
  return await getSetting('twitter_user_id');
}

// --- Cleanup ---

export async function removeTwitterConnection(): Promise<void> {
  await query(`DELETE FROM settings WHERE key LIKE 'twitter_%'`);
}

// --- Twitter API helpers ---

async function exchangeCode(
  code: string,
  codeVerifier: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const res = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Token exchange failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const res = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Token refresh failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function getTwitterUserInfo(
  token: string,
): Promise<{ username: string; userId: string }> {
  const response = await twitterFetch(
    '/2/users/me?user.fields=name,username',
    token,
  );
  const user = response.data;
  if (!user) throw new Error('Could not retrieve Twitter user info');
  return { username: user.username, userId: user.id };
}
