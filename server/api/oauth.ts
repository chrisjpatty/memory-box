/**
 * OAuth 2.1 HTTP routes: well-known metadata, dynamic client registration,
 * authorization endpoint, and token endpoint.
 *
 * None of these routes require session auth — they sit outside /api/*.
 */
import { Hono } from 'hono';
import {
  registerClient,
  getClient,
  validateAuthorizeParams,
  exchangeCodeForTokens,
  refreshAccessToken,
  OAuthError,
} from '../../lib/oauth';

// --- Rate limiting for DCR (same pattern as server/api/auth.ts) ---

const DCR_MAX_PER_HOUR = 10;
const DCR_WINDOW_MS = 60 * 60 * 1000;
const dcrRateMap = new Map<string, { count: number; resetAt: number }>();

function getClientIp(c: any): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    || c.req.header('x-real-ip')
    || 'unknown';
}

function checkDcrRateLimit(ip: string): { blocked: boolean; retryAfter?: number } {
  const now = Date.now();
  // Cleanup expired entries
  for (const [key, entry] of dcrRateMap) {
    if (entry.resetAt <= now) dcrRateMap.delete(key);
  }
  const entry = dcrRateMap.get(ip);
  if (entry && entry.count >= DCR_MAX_PER_HOUR && entry.resetAt > now) {
    return { blocked: true, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { blocked: false };
}

function recordDcrRequest(ip: string): void {
  const now = Date.now();
  const entry = dcrRateMap.get(ip);
  if (entry && entry.resetAt > now) {
    entry.count += 1;
  } else {
    dcrRateMap.set(ip, { count: 1, resetAt: now + DCR_WINDOW_MS });
  }
}

// --- Helper to get origin from request ---

function getOrigin(c: any): string {
  const url = new URL(c.req.url);
  // Prefer X-Forwarded headers for proxied setups
  const proto = c.req.header('x-forwarded-proto') || url.protocol.replace(':', '');
  const host = c.req.header('x-forwarded-host') || c.req.header('host') || url.host;
  return `${proto}://${host}`;
}

// --- Well-known metadata endpoints (mounted at root /) ---

export const oauthWellKnown = new Hono();

// RFC 9728: Protected Resource Metadata
oauthWellKnown.get('/.well-known/oauth-protected-resource', (c) => {
  const origin = getOrigin(c);
  return c.json({
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ['header'],
  });
});

// RFC 8414: Authorization Server Metadata
oauthWellKnown.get('/.well-known/oauth-authorization-server', (c) => {
  const origin = getOrigin(c);
  return c.json({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['mcp:full'],
  });
});

// --- OAuth routes (mounted at /oauth) ---

export const oauthRoutes = new Hono();

// Dynamic Client Registration (RFC 7591)
oauthRoutes.post('/register', async (c) => {
  const ip = getClientIp(c);
  const { blocked, retryAfter } = checkDcrRateLimit(ip);
  if (blocked) {
    return c.json(
      { error: 'too_many_requests', error_description: 'Rate limit exceeded for client registration' },
      429,
      { 'Retry-After': String(retryAfter) },
    );
  }

  try {
    const body = await c.req.json();
    const client = await registerClient(
      {
        client_name: body.client_name ?? 'Unknown Client',
        redirect_uris: body.redirect_uris ?? [],
        grant_types: body.grant_types,
        response_types: body.response_types,
        token_endpoint_auth_method: body.token_endpoint_auth_method,
      },
      ip,
    );
    recordDcrRequest(ip);
    return c.json({
      client_id: client.id,
      client_name: client.client_name,
      redirect_uris: client.redirect_uris,
      grant_types: client.grant_types,
      response_types: client.response_types,
      token_endpoint_auth_method: client.token_endpoint_auth_method,
    }, 201);
  } catch (err: any) {
    return c.json({ error: 'invalid_client_metadata', error_description: err.message }, 400);
  }
});

// Authorization Endpoint
oauthRoutes.get('/authorize', async (c) => {
  const responseType = c.req.query('response_type') ?? '';
  const clientId = c.req.query('client_id') ?? '';
  const redirectUri = c.req.query('redirect_uri') ?? '';
  const codeChallenge = c.req.query('code_challenge') ?? '';
  const codeChallengeMethod = c.req.query('code_challenge_method') ?? '';
  const state = c.req.query('state') ?? '';
  const scope = c.req.query('scope') ?? '';

  // Look up client
  const client = await getClient(clientId);
  if (!client) {
    // Can't redirect to redirect_uri if client doesn't exist — return error directly
    return c.json({ error: 'invalid_request', error_description: 'Unknown client_id' }, 400);
  }

  // Validate params
  try {
    validateAuthorizeParams(
      { responseType, clientId, redirectUri, codeChallengeMethod, codeChallenge },
      client,
    );
  } catch (err: any) {
    // Redirect back with error if redirect_uri is valid
    if (client.redirect_uris.includes(redirectUri)) {
      const errorUrl = new URL(redirectUri);
      errorUrl.searchParams.set('error', 'invalid_request');
      errorUrl.searchParams.set('error_description', err.message);
      if (state) errorUrl.searchParams.set('state', state);
      return c.redirect(errorUrl.toString());
    }
    return c.json({ error: 'invalid_request', error_description: err.message }, 400);
  }

  // Redirect to consent screen (React SPA route)
  const consentUrl = new URL('/oauth/consent', c.req.url);
  consentUrl.searchParams.set('client_id', clientId);
  consentUrl.searchParams.set('redirect_uri', redirectUri);
  consentUrl.searchParams.set('code_challenge', codeChallenge);
  consentUrl.searchParams.set('code_challenge_method', codeChallengeMethod);
  consentUrl.searchParams.set('state', state);
  consentUrl.searchParams.set('scope', scope);
  return c.redirect(consentUrl.pathname + consentUrl.search);
});

// Token Endpoint
oauthRoutes.post('/token', async (c) => {
  // OAuth spec requires application/x-www-form-urlencoded
  let params: Record<string, string>;
  const contentType = c.req.header('content-type') ?? '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const body = await c.req.parseBody();
    params = Object.fromEntries(
      Object.entries(body).map(([k, v]) => [k, typeof v === 'string' ? v : '']),
    );
  } else if (contentType.includes('application/json')) {
    // Some clients send JSON — be lenient
    params = await c.req.json();
  } else {
    return c.json({ error: 'invalid_request', error_description: 'Unsupported content type' }, 400);
  }

  const grantType = params.grant_type ?? '';

  try {
    if (grantType === 'authorization_code') {
      const result = await exchangeCodeForTokens({
        code: params.code ?? '',
        clientId: params.client_id ?? '',
        codeVerifier: params.code_verifier ?? '',
        redirectUri: params.redirect_uri ?? '',
      });
      return c.json(result);
    }

    if (grantType === 'refresh_token') {
      const result = await refreshAccessToken({
        refreshToken: params.refresh_token ?? '',
        clientId: params.client_id ?? '',
      });
      return c.json(result);
    }

    return c.json({ error: 'unsupported_grant_type', error_description: `Unsupported grant_type: ${grantType}` }, 400);
  } catch (err: any) {
    if (err instanceof OAuthError) {
      return c.json({ error: err.error, error_description: err.errorDescription }, 400);
    }
    console.error('OAuth token error:', err);
    return c.json({ error: 'server_error', error_description: 'Internal server error' }, 500);
  }
});
