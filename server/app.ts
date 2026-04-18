import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { validateToken } from '../lib/auth';
import { ingest } from '../lib/ingest';
import { validateSession } from './session';
import { auth } from './api/auth';
import { token } from './api/token';
import { stats } from './api/stats';
import { memories } from './api/memories';
import { search } from './api/search';
import { ingestApi } from './api/ingest';
import { importApi } from './api/import';
import { chat } from './api/chat';
import { collections } from './api/collections';
import { conversations } from './api/conversations';
import { jobsApi } from './api/jobs';
import { createMcpHandler } from '../mcp/server';
import { mcpSettings } from './api/mcp-settings';
import { oauthWellKnown, oauthRoutes } from './api/oauth';
import { oauthConsentApi } from './api/oauth-consent';
import { mediaApi } from './api/media';
import { serveStatic } from 'hono/bun';
import type { IngestRequest } from '../lib/types';

export interface AppOptions {
  /** CORS origins to allow (for dev with Vite). Omit in production (same-origin). */
  corsOrigins?: string[];
  /** When true, skip mounting the SPA static file catch-all (for dev with Vite). */
  skipStatic?: boolean;
}

export function createApp(options?: AppOptions) {
  const app = new Hono();

  if (options?.corsOrigins) {
    app.use('*', cors({ origin: options.corsOrigins, credentials: true }));
  }

  // Health check
  app.get('/health', (c) => c.json({ status: 'ok' }));

  // --- OAuth 2.1 routes (no session auth) ---
  app.route('/', oauthWellKnown);        // /.well-known/* metadata endpoints
  app.route('/oauth', oauthRoutes);       // /oauth/register, /oauth/authorize, /oauth/token

  // --- Dashboard API routes ---

  // Auth routes (no session required)
  app.route('/api/auth', auth);

  // Session-protected API routes (skip Twitter OAuth callback and media serving)
  app.use('/api/*', async (c, next) => {
    if (c.req.path === '/api/import/twitter/callback') return next();
    if (c.req.path.startsWith('/api/media/')) return next();
    const authenticated = await validateSession(c);
    if (!authenticated) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    await next();
  });

  app.route('/api/token', token);
  app.route('/api/stats', stats);
  app.route('/api/memories', memories);
  app.route('/api/collections', collections);
  app.route('/api/search', search);
  app.route('/api/ingest', ingestApi);
  app.route('/api/import', importApi);
  app.route('/api/jobs', jobsApi);
  app.route('/api/conversations', conversations);
  app.route('/api/chat', chat);
  app.route('/api/mcp', mcpSettings);
  app.route('/api/oauth', oauthConsentApi);
  app.route('/api/media', mediaApi);

  // --- Ingestion routes (bearer token auth) ---

  const bearerAuth = createBearerAuthMiddleware();

  app.post('/ingest', bearerAuth, async (c) => {
    const body = await c.req.json<IngestRequest>();
    if (!body.content) {
      return c.json({ error: 'Missing "content" field' }, 400);
    }
    try {
      const result = await ingest(body);
      if (Array.isArray(result)) {
        return c.json({ success: true, results: result }, 201);
      }
      return c.json({ success: true, ...result }, 201);
    } catch (err: any) {
      console.error('Ingestion error:', err);
      return c.json({ error: `Ingestion failed: ${err.message}` }, 500);
    }
  });

  app.post('/ingest/upload', bearerAuth, async (c) => {
    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'Missing "file" field (multipart/form-data)' }, 400);
    }

    const title = typeof body['title'] === 'string' ? body['title'] : undefined;
    const tagsRaw = typeof body['tags'] === 'string' ? body['tags'] : undefined;
    const tags = tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : undefined;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const fileBuffer = Buffer.from(arrayBuffer);

      const result = await ingest({
        content: '',
        title,
        tags,
        fileBuffer,
        fileName: file.name,
        fileMimeType: file.type,
      });
      if (Array.isArray(result)) {
        return c.json({ success: true, results: result }, 201);
      }
      return c.json({ success: true, ...result }, 201);
    } catch (err: any) {
      console.error('File upload ingestion error:', err);
      return c.json({ error: `Ingestion failed: ${err.message}` }, 500);
    }
  });

  app.post('/ingest/batch', bearerAuth, async (c) => {
    const { items } = await c.req.json<{ items: IngestRequest[] }>();
    if (!Array.isArray(items) || items.length === 0) {
      return c.json({ error: 'Missing "items" array' }, 400);
    }
    const results = await Promise.allSettled(items.map((item) => ingest(item)));
    const response = results.map((r, i) =>
      r.status === 'fulfilled'
        ? { status: 'ok', ...r.value }
        : { status: 'error', content: items[i].content?.slice(0, 50), error: r.reason?.message },
    );
    return c.json({ results: response }, 201);
  });

  // --- MCP Server (bearer token auth) ---

  const mcpHandler = createMcpHandler();
  app.all('/mcp', bearerAuth, (c) => mcpHandler(c));

  // --- Dashboard SPA (static files in production) ---

  if (!options?.skipStatic) {
    app.use('/*', serveStatic({ root: './dashboard/dist' }));
    app.get('/*', serveStatic({ path: './dashboard/dist/index.html' }));
  }

  return app;
}

/**
 * Creates a reusable bearer token authentication middleware.
 * Validates the Authorization header against stored API tokens
 * and returns RFC 6750 compliant error responses.
 */
function createBearerAuthMiddleware() {
  return async (c: any, next: any) => {
    const authHeader = c.req.header('Authorization');
    const origin = new URL(c.req.url).origin;
    const resourceMetadataUrl = `${origin}/.well-known/oauth-protected-resource`;
    const wwwAuth = { 'WWW-Authenticate': `Bearer resource_metadata="${resourceMetadataUrl}"` };

    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Missing or invalid Authorization header' }, 401, wwwAuth);
    }

    const token = authHeader.slice(7);
    const valid = await validateToken(token);
    if (!valid) {
      return c.json({ error: 'Invalid or expired token' }, 401, wwwAuth);
    }

    await next();
  };
}
