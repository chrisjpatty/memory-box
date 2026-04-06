import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { validateToken } from '../../lib/auth';
import { ingest } from '../../lib/ingest';
import { initDatabase } from '../../lib/db-init';
import { validateSession } from './dashboard/session';
import { auth } from './api/auth';
import { token } from './api/token';
import { stats } from './api/stats';
import { memories } from './api/memories';
import { search } from './api/search';
import { ingestApi } from './api/ingest';
import { importApi } from './api/import';
import { chat } from './api/chat';
import { startAutoSync } from '../../lib/import/github-stars';
import type { IngestRequest } from '../../lib/types';

const app = new Hono();

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

// --- API routes ---

// Auth routes (no session required)
app.route('/api/auth', auth);

// Session-protected API routes
app.use('/api/*', async (c, next) => {
  const authenticated = await validateSession(c);
  if (!authenticated) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});

app.route('/api/token', token);
app.route('/api/stats', stats);
app.route('/api/memories', memories);
app.route('/api/search', search);
app.route('/api/ingest', ingestApi);
app.route('/api/import', importApi);
app.route('/api/chat', chat);

// --- Ingestion routes (bearer token auth) ---

const bearerAuth = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }
  const bearerToken = authHeader.slice(7);
  const valid = await validateToken(bearerToken);
  if (!valid) {
    return c.json({ error: 'Invalid token' }, 401);
  }
  await next();
};

app.post('/ingest', bearerAuth, async (c) => {
  const body = await c.req.json<IngestRequest>();
  if (!body.content) {
    return c.json({ error: 'Missing "content" field' }, 400);
  }
  try {
    const result = await ingest(body);
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

// --- Dashboard SPA (static files in production) ---

app.use('/*', serveStatic({ root: './dashboard/dist' }));
app.get('/*', serveStatic({ path: './dashboard/dist/index.html' }));

// Initialize database and start server
await initDatabase();

const port = parseInt(process.env.PORT || '3001', 10);
console.log(`Memory Box ingestion webhook listening on port ${port}`);

// Initialize auto-sync if it was previously enabled
startAutoSync().catch((err) => console.warn('Auto-sync startup failed:', err));

export default { port, fetch: app.fetch };
