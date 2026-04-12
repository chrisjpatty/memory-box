/**
 * OAuth 2.1 authorization server logic.
 * Handles dynamic client registration (RFC 7591), authorization codes with PKCE,
 * token exchange, and refresh token rotation.
 *
 * Access tokens are minted into the existing auth_tokens table so that the
 * bearerAuth middleware works unchanged.
 */
import { createHash } from 'crypto';
import { nanoid } from 'nanoid';
import { query } from './db';
import { hashToken } from './auth';

// --- Types ---

export interface OAuthClient {
  id: string;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  expires_in: number;
  scope: string;
}

// --- Client Registration (RFC 7591) ---

export async function registerClient(
  params: {
    client_name: string;
    redirect_uris: string[];
    grant_types?: string[];
    response_types?: string[];
    token_endpoint_auth_method?: string;
  },
  clientIp: string,
): Promise<OAuthClient> {
  const id = nanoid(24);
  const grantTypes = params.grant_types ?? ['authorization_code'];
  const responseTypes = params.response_types ?? ['code'];
  const authMethod = params.token_endpoint_auth_method ?? 'none';

  // Only public clients (no secret)
  if (authMethod !== 'none') {
    throw new Error('Only public clients (token_endpoint_auth_method: "none") are supported');
  }

  // Validate redirect URIs
  for (const uri of params.redirect_uris) {
    validateRedirectUri(uri);
  }

  const result = await query(
    `INSERT INTO oauth_clients (id, client_name, redirect_uris, grant_types, response_types, token_endpoint_auth_method, created_by_ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, client_name, redirect_uris, grant_types, response_types, token_endpoint_auth_method, created_at`,
    [id, params.client_name, JSON.stringify(params.redirect_uris), JSON.stringify(grantTypes), JSON.stringify(responseTypes), authMethod, clientIp],
  );

  const row = result.rows[0];
  return {
    id: row.id,
    client_name: row.client_name,
    redirect_uris: row.redirect_uris,
    grant_types: row.grant_types,
    response_types: row.response_types,
    token_endpoint_auth_method: row.token_endpoint_auth_method,
    created_at: row.created_at,
  };
}

export async function getClient(clientId: string): Promise<OAuthClient | null> {
  const result = await query(
    'SELECT id, client_name, redirect_uris, grant_types, response_types, token_endpoint_auth_method, created_at FROM oauth_clients WHERE id = $1',
    [clientId],
  );
  return result.rows[0] ?? null;
}

// --- Authorization Codes ---

const AUTH_CODE_TTL_SECONDS = 60;

export async function createAuthCode(params: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
}): Promise<string> {
  const code = nanoid(48);
  const codeHash = hashToken(code);
  const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000);

  await query(
    `INSERT INTO oauth_auth_codes (code_hash, client_id, redirect_uri, code_challenge, scope, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [codeHash, params.clientId, params.redirectUri, params.codeChallenge, params.scope, expiresAt],
  );

  return code;
}

async function consumeAuthCode(
  code: string,
  clientId: string,
): Promise<{ redirect_uri: string; code_challenge: string; scope: string } | null> {
  const codeHash = hashToken(code);

  // Atomically mark as used and return the record (only if not expired and not already used)
  const result = await query(
    `UPDATE oauth_auth_codes
     SET used = true
     WHERE code_hash = $1 AND client_id = $2 AND used = false AND expires_at > NOW()
     RETURNING redirect_uri, code_challenge, scope`,
    [codeHash, clientId],
  );

  return result.rows[0] ?? null;
}

// --- PKCE Verification ---

function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const hash = createHash('sha256').update(codeVerifier).digest('base64url');
  return hash === codeChallenge;
}

// --- Token Minting (into existing auth_tokens table) ---

const ACCESS_TOKEN_EXPIRES_IN = 3600; // 1 hour (informational — used in response)
const REFRESH_TOKEN_TTL_DAYS = 30;

async function mintAccessToken(name: string): Promise<{ token: string; tokenId: number }> {
  const token = nanoid(48);
  const tokenHash = hashToken(token);
  const hint = token.slice(0, 8) + '...' + token.slice(-4);

  const result = await query(
    'INSERT INTO auth_tokens (name, token_hash, hint, active) VALUES ($1, $2, $3, true) RETURNING id',
    [name, tokenHash, hint],
  );

  return { token, tokenId: result.rows[0].id };
}

async function createRefreshToken(clientId: string, authTokenId: number, scope: string): Promise<string> {
  const token = nanoid(48);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await query(
    `INSERT INTO oauth_refresh_tokens (token_hash, client_id, auth_token_id, scope, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [tokenHash, clientId, authTokenId, scope, expiresAt],
  );

  return token;
}

// --- Token Exchange ---

export async function exchangeCodeForTokens(params: {
  code: string;
  clientId: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  // 1. Consume the auth code (atomic single-use)
  const authCode = await consumeAuthCode(params.code, params.clientId);
  if (!authCode) {
    throw new OAuthError('invalid_grant', 'Invalid, expired, or already-used authorization code');
  }

  // 2. Verify redirect_uri matches
  if (authCode.redirect_uri !== params.redirectUri) {
    throw new OAuthError('invalid_grant', 'redirect_uri mismatch');
  }

  // 3. Verify PKCE
  if (!verifyPkce(params.codeVerifier, authCode.code_challenge)) {
    throw new OAuthError('invalid_grant', 'PKCE verification failed');
  }

  // 4. Look up client name for token label
  const client = await getClient(params.clientId);
  const tokenName = `OAuth: ${client?.client_name ?? params.clientId}`;

  // 5. Mint access token into auth_tokens
  const { token: accessToken, tokenId } = await mintAccessToken(tokenName);

  // 6. Create refresh token
  const refreshToken = await createRefreshToken(params.clientId, tokenId, authCode.scope);

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'bearer',
    expires_in: ACCESS_TOKEN_EXPIRES_IN,
    scope: authCode.scope,
  };
}

export async function refreshAccessToken(params: {
  refreshToken: string;
  clientId: string;
}): Promise<TokenResponse> {
  const tokenHash = hashToken(params.refreshToken);

  // 1. Find and revoke the refresh token atomically
  const result = await query(
    `UPDATE oauth_refresh_tokens
     SET revoked = true
     WHERE token_hash = $1 AND client_id = $2 AND revoked = false AND expires_at > NOW()
     RETURNING auth_token_id, scope`,
    [tokenHash, params.clientId],
  );

  const row = result.rows[0];
  if (!row) {
    throw new OAuthError('invalid_grant', 'Invalid, expired, or revoked refresh token');
  }

  // 2. Revoke old access token
  await query('UPDATE auth_tokens SET active = false WHERE id = $1', [row.auth_token_id]);

  // 3. Look up client name for new token label
  const client = await getClient(params.clientId);
  const tokenName = `OAuth: ${client?.client_name ?? params.clientId}`;

  // 4. Mint new access token
  const { token: accessToken, tokenId } = await mintAccessToken(tokenName);

  // 5. Create new refresh token (rotation)
  const newRefreshToken = await createRefreshToken(params.clientId, tokenId, row.scope);

  return {
    access_token: accessToken,
    refresh_token: newRefreshToken,
    token_type: 'bearer',
    expires_in: ACCESS_TOKEN_EXPIRES_IN,
    scope: row.scope,
  };
}

// --- Validation Helpers ---

function validateRedirectUri(uri: string): void {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error(`Invalid redirect URI: ${uri}`);
  }

  // Allow localhost for development, require HTTPS otherwise
  const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (!isLocalhost && parsed.protocol !== 'https:') {
    throw new Error(`Redirect URI must use HTTPS: ${uri}`);
  }

  // No fragment components (OAuth spec requirement)
  if (parsed.hash) {
    throw new Error(`Redirect URI must not contain a fragment: ${uri}`);
  }
}

export function validateAuthorizeParams(params: {
  responseType: string;
  clientId: string;
  redirectUri: string;
  codeChallengeMethod: string;
  codeChallenge: string;
}, client: OAuthClient): void {
  if (params.responseType !== 'code') {
    throw new Error('response_type must be "code"');
  }
  if (params.codeChallengeMethod !== 'S256') {
    throw new Error('code_challenge_method must be "S256"');
  }
  if (!params.codeChallenge) {
    throw new Error('code_challenge is required');
  }
  // redirect_uri must exactly match a registered URI
  if (!client.redirect_uris.includes(params.redirectUri)) {
    throw new Error('redirect_uri does not match any registered URI');
  }
}

// --- Error class for OAuth-spec error responses ---

export class OAuthError extends Error {
  constructor(
    public readonly error: string,
    public readonly errorDescription: string,
  ) {
    super(errorDescription);
    this.name = 'OAuthError';
  }
}

// --- Cleanup ---

export async function cleanupExpired(): Promise<void> {
  await query('DELETE FROM oauth_auth_codes WHERE expires_at < NOW()');
  await query('DELETE FROM oauth_refresh_tokens WHERE revoked = true OR expires_at < NOW()');
}

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export function startCleanupJob(): void {
  if (cleanupInterval) return;
  // Clean up every 5 minutes
  cleanupInterval = setInterval(() => {
    cleanupExpired().catch((err) => console.error('OAuth cleanup error:', err));
  }, 5 * 60 * 1000);
}
