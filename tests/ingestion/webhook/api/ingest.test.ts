import { describe, expect, test, beforeEach, mock } from 'bun:test';
import { Hono } from 'hono';
import { splitOversizedChunks } from '../../../../lib/embeddings';
import { fallbackClassify } from '../../../../lib/classifier';
import { createMockRedis, createMockNeo4j, createMockQdrant } from '../../../helpers/mock-clients';

const mockRedis = createMockRedis();
const mockNeo4j = createMockNeo4j();
const mockQdrant = createMockQdrant();

mock.module('../../../../lib/clients', () => ({
  getRedis: () => mockRedis.instance,
  getNeo4j: () => mockNeo4j.instance,
  getQdrant: () => mockQdrant.instance,
  QDRANT_INDEX_NAME: 'memories',
  EMBEDDING_DIMENSION: 768,
}));

mock.module('../../../../lib/embeddings', () => ({
  generateEmbedding: async () => new Array(768).fill(0),
  generateEmbeddings: async (texts: string[]) => texts.map(() => new Array(768).fill(0)),
  splitOversizedChunks,
}));

mock.module('../../../../lib/classifier', () => ({
  classifyContent: async (content: string, title?: string, tags?: string[]) => ({
    contentType: 'text',
    title: title || 'Test Title',
    tags: tags || ['test'],
    category: 'note',
    summary: content.slice(0, 100),
    metadata: {},
  }),
  fallbackClassify,
}));

mock.module('../../../../lib/storage', () => ({
  putFile: async () => {},
  getFile: async () => null,
  deleteFile: async () => {},
  fileKey: (id: string, name: string) => `${id}/${name}`,
}));

// We need to build a mini app with bearer auth to test the ingestion routes
const { validateToken } = await import('../../../../lib/auth');
const { ingest } = await import('../../../../lib/ingest');

// Build a test app that mirrors the real ingestion routes
const app = new Hono();

const bearerAuth = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }
  const token = authHeader.slice(7);
  const redis = mockRedis.instance;
  const valid = await validateToken(redis as any, token);
  if (!valid) {
    return c.json({ error: 'Invalid token' }, 401);
  }
  await next();
};

app.post('/ingest', bearerAuth, async (c) => {
  const body = await c.req.json();
  if (!body.content) {
    return c.json({ error: 'Missing "content" field' }, 400);
  }
  try {
    const result = await ingest(body);
    return c.json({ success: true, ...result }, 201);
  } catch (err: any) {
    return c.json({ error: `Ingestion failed: ${err.message}` }, 500);
  }
});

app.post('/ingest/batch', bearerAuth, async (c) => {
  const { items } = await c.req.json();
  if (!Array.isArray(items) || items.length === 0) {
    return c.json({ error: 'Missing "items" array' }, 400);
  }
  const results = await Promise.allSettled(items.map((item: any) => ingest(item)));
  const response = results.map((r, i) =>
    r.status === 'fulfilled'
      ? { status: 'ok', ...r.value }
      : { status: 'error', content: items[i].content?.slice(0, 50), error: r.reason?.message },
  );
  return c.json({ results: response }, 201);
});

// Setup: generate a valid token
async function setupToken(): Promise<string> {
  const { generateToken } = await import('../../../../lib/auth');
  return generateToken(mockRedis.instance as any);
}

describe('ingestion routes', () => {
  beforeEach(() => {
    mockRedis.reset();
    mockNeo4j.reset();
    mockQdrant.reset();
  });

  describe('POST /ingest', () => {
    test('without auth header → 401', async () => {
      const res = await app.request('/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'test' }),
      });
      expect(res.status).toBe(401);
    });

    test('with invalid token → 401', async () => {
      const res = await app.request('/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer invalid-token',
        },
        body: JSON.stringify({ content: 'test' }),
      });
      expect(res.status).toBe(401);
    });

    test('with valid token + text content → 201', async () => {
      const validToken = await setupToken();
      const res = await app.request('/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${validToken}`,
        },
        body: JSON.stringify({ content: 'Remember this: important meeting notes' }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.memoryId).toBeDefined();
    });

    test('without content field → 400', async () => {
      const validToken = await setupToken();
      const res = await app.request('/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${validToken}`,
        },
        body: JSON.stringify({ title: 'no content' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /ingest/batch', () => {
    test('with items array → 201 with per-item results', async () => {
      const validToken = await setupToken();
      const res = await app.request('/ingest/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${validToken}`,
        },
        body: JSON.stringify({
          items: [
            { content: 'first item' },
            { content: 'second item' },
          ],
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.results).toHaveLength(2);
      expect(body.results[0].status).toBe('ok');
      expect(body.results[1].status).toBe('ok');
    });

    test('with empty array → 400', async () => {
      const validToken = await setupToken();
      const res = await app.request('/ingest/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${validToken}`,
        },
        body: JSON.stringify({ items: [] }),
      });
      expect(res.status).toBe(400);
    });
  });
});
