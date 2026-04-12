/**
 * OAuth consent API — session-protected endpoints for the consent screen.
 * Lives under /api/oauth so it inherits the session middleware from app.ts.
 */
import { Hono } from 'hono';
import { getClient, createAuthCode } from '../../lib/oauth';

export const oauthConsentApi = new Hono();

// Get client info for display on consent screen
oauthConsentApi.get('/client/:id', async (c) => {
  const clientId = c.req.param('id');
  const client = await getClient(clientId);
  if (!client) {
    return c.json({ error: 'Client not found' }, 404);
  }
  return c.json({
    client_name: client.client_name,
    redirect_uris: client.redirect_uris,
  });
});

// Handle consent approval/denial
oauthConsentApi.post('/consent', async (c) => {
  const body = await c.req.json<{
    client_id: string;
    redirect_uri: string;
    code_challenge: string;
    state: string;
    scope: string;
    approved: boolean;
  }>();

  const { client_id, redirect_uri, code_challenge, state, scope, approved } = body;

  // Validate client exists
  const client = await getClient(client_id);
  if (!client) {
    return c.json({ error: 'Unknown client' }, 400);
  }

  // Validate redirect_uri matches registered URI
  if (!client.redirect_uris.includes(redirect_uri)) {
    return c.json({ error: 'Invalid redirect_uri' }, 400);
  }

  if (!approved) {
    const errorUrl = new URL(redirect_uri);
    errorUrl.searchParams.set('error', 'access_denied');
    if (state) errorUrl.searchParams.set('state', state);
    return c.json({ redirect_url: errorUrl.toString() });
  }

  // Create authorization code
  const code = await createAuthCode({
    clientId: client_id,
    redirectUri: redirect_uri,
    codeChallenge: code_challenge,
    scope: scope || 'mcp:full',
  });

  const callbackUrl = new URL(redirect_uri);
  callbackUrl.searchParams.set('code', code);
  if (state) callbackUrl.searchParams.set('state', state);

  return c.json({ redirect_url: callbackUrl.toString() });
});
