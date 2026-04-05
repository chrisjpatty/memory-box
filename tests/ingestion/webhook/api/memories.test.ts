import { describe, expect, test, beforeEach, mock } from 'bun:test';
import { createMockRedis, createMockNeo4j, createMockQdrant, createMockStorage } from '../../../helpers/mock-clients';

const mockRedis = createMockRedis();
const mockNeo4j = createMockNeo4j();
const mockQdrant = createMockQdrant();
const mockStorage = createMockStorage();

mock.module('../../../../lib/clients', () => ({
  getRedis: () => mockRedis.instance,
  getNeo4j: () => mockNeo4j.instance,
  getQdrant: () => mockQdrant.instance,
  QDRANT_INDEX_NAME: 'memories',
  EMBEDDING_DIMENSION: 768,
}));

mock.module('../../../../lib/storage', () => ({
  putFile: mockStorage.putFile,
  getFile: mockStorage.getFile,
  deleteFile: mockStorage.deleteFile,
  fileKey: mockStorage.fileKey,
}));

// Mock cleanupDedupKeys to avoid scanning Redis
mock.module('../../../../lib/ingest', () => ({
  cleanupDedupKeys: mock(async () => {}),
}));

const { memories } = await import('../../../../ingestion/webhook/api/memories');

const sampleMemory = {
  id: 'test-mem-1',
  contentType: 'text',
  title: 'Test Memory',
  category: 'note',
  summary: 'A test memory',
  tags: ['test'],
  createdAt: '2024-01-01T00:00:00Z',
  processedContent: 'Some processed content',
  markdown: 'Some markdown content',
  extra: {},
};

describe('memories routes', () => {
  beforeEach(() => {
    mockRedis.reset();
    mockNeo4j.reset();
    mockQdrant.reset();
    mockStorage.reset();
  });

  describe('GET /', () => {
    test('returns paginated memory list', async () => {
      // Add a memory to Neo4j mock
      mockNeo4j.memories.set('test-1', {
        id: 'test-1',
        title: 'Memory One',
        contentType: 'text',
        category: 'note',
        summary: 'First memory',
        createdAt: '2024-01-01',
      });

      const res = await memories.request('/');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.memories).toBeDefined();
      expect(Array.isArray(body.memories)).toBe(true);
      expect(body.total).toBeDefined();
    });

    test('returns empty list when no memories', async () => {
      const res = await memories.request('/');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.memories).toEqual([]);
    });
  });

  describe('GET /:id', () => {
    test('returns memory detail', async () => {
      await mockRedis.instance.set(`memory:${sampleMemory.id}`, JSON.stringify(sampleMemory));

      const res = await memories.request(`/${sampleMemory.id}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.found).toBe(true);
      expect(body.memory.id).toBe(sampleMemory.id);
      expect(body.memory.title).toBe(sampleMemory.title);
    });

    test('nonexistent memory → 404', async () => {
      const res = await memories.request('/nonexistent-id');
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.found).toBe(false);
    });
  });

  describe('GET /:id/html', () => {
    test('returns HTML with CSP headers', async () => {
      const memWithHtml = { ...sampleMemory, hasHtml: true };
      await mockRedis.instance.set(`memory:${sampleMemory.id}`, JSON.stringify(memWithHtml));

      const htmlContent = '<html><body><h1>Hello</h1></body></html>';
      mockStorage.files.set(`${sampleMemory.id}/original.html`, {
        data: Buffer.from(htmlContent),
        contentType: 'text/html',
      });

      const res = await memories.request(`/${sampleMemory.id}/html`);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Security-Policy')).toContain("script-src 'none'");
      expect(res.headers.get('Content-Type')).toContain('text/html');
    });

    test('memory without HTML → 404', async () => {
      await mockRedis.instance.set(`memory:${sampleMemory.id}`, JSON.stringify(sampleMemory));

      const res = await memories.request(`/${sampleMemory.id}/html`);
      expect(res.status).toBe(404);
    });

    test('nonexistent memory → 404', async () => {
      const res = await memories.request('/nonexistent/html');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /:id/image', () => {
    test('returns image with content-type', async () => {
      const memWithImage = { ...sampleMemory, fileKey: `${sampleMemory.id}/original.png` };
      await mockRedis.instance.set(`memory:${sampleMemory.id}`, JSON.stringify(memWithImage));

      mockStorage.files.set(`${sampleMemory.id}/original.png`, {
        data: Buffer.from([0x89, 0x50, 0x4e, 0x47]), // PNG header
        contentType: 'image/png',
      });

      const res = await memories.request(`/${sampleMemory.id}/image`);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('image/png');
    });

    test('memory without file → 404', async () => {
      await mockRedis.instance.set(`memory:${sampleMemory.id}`, JSON.stringify(sampleMemory));

      const res = await memories.request(`/${sampleMemory.id}/image`);
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /:id', () => {
    test('removes memory and returns success', async () => {
      await mockRedis.instance.set(`memory:${sampleMemory.id}`, JSON.stringify(sampleMemory));
      mockNeo4j.memories.set(sampleMemory.id, sampleMemory);

      const res = await memories.request(`/${sampleMemory.id}`, { method: 'DELETE' });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      // Redis key should be deleted
      const redisVal = await mockRedis.instance.get(`memory:${sampleMemory.id}`);
      expect(redisVal).toBeNull();
    });

    test('deleting nonexistent memory still succeeds (idempotent)', async () => {
      const res = await memories.request('/nonexistent', { method: 'DELETE' });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });
});
