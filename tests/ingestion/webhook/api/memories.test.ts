import { describe, expect, test, beforeEach, mock } from 'bun:test';
import { createMockPool, createMockStorage } from '../../../helpers/mock-clients';

const mockPool = createMockPool();
const mockStorage = createMockStorage();

mock.module('../../../../lib/db', () => ({
  getPool: () => mockPool.instance,
  query: mockPool.instance.query,
  getClient: mockPool.instance.connect,
}));

mock.module('../../../../lib/storage', () => ({
  putFile: mockStorage.putFile,
  getFile: mockStorage.getFile,
  deleteFile: mockStorage.deleteFile,
  fileKey: mockStorage.fileKey,
}));

const { memories } = await import('../../../../ingestion/webhook/api/memories');

const sampleMemory = {
  id: 'test-mem-1',
  content_type: 'text',
  title: 'Test Memory',
  category: 'note',
  summary: 'A test memory',
  tags: ['test'],
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  processed_content: 'Some processed content',
  raw_content: 'Some raw content',
  search_content: 'Some search content',
  markdown: 'Some markdown content',
  source_url: null,
  content_hash: null,
  file_key: null,
  mime_type: null,
  has_html: false,
  metadata: {},
};

describe('memories routes', () => {
  beforeEach(() => {
    mockPool.reset();
    mockStorage.reset();
  });

  describe('GET /:id', () => {
    test('returns memory detail', async () => {
      mockPool.memories.set(sampleMemory.id, sampleMemory as any);

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
      const memWithHtml = { ...sampleMemory, has_html: true };
      mockPool.memories.set(sampleMemory.id, memWithHtml as any);

      const htmlContent = '<html><body><h1>Hello</h1></body></html>';
      mockStorage.files.set(`${sampleMemory.id}/original.html`, {
        data: Buffer.from(htmlContent),
        contentType: 'text/html',
      });

      const res = await memories.request(`/${sampleMemory.id}/html`);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Security-Policy')).toContain("script-src 'none'");
    });

    test('memory without HTML → 404', async () => {
      mockPool.memories.set(sampleMemory.id, sampleMemory as any);
      const res = await memories.request(`/${sampleMemory.id}/html`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /:id/image', () => {
    test('returns image with content-type', async () => {
      const memWithImage = { ...sampleMemory, file_key: `${sampleMemory.id}/original.png` };
      mockPool.memories.set(sampleMemory.id, memWithImage as any);

      mockStorage.files.set(`${sampleMemory.id}/original.png`, {
        data: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        contentType: 'image/png',
      });

      const res = await memories.request(`/${sampleMemory.id}/image`);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('image/png');
    });

    test('memory without file → 404', async () => {
      mockPool.memories.set(sampleMemory.id, sampleMemory as any);
      const res = await memories.request(`/${sampleMemory.id}/image`);
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /:id', () => {
    test('removes memory and returns success', async () => {
      mockPool.memories.set(sampleMemory.id, sampleMemory as any);

      const res = await memories.request(`/${sampleMemory.id}`, { method: 'DELETE' });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    test('deleting nonexistent memory still succeeds', async () => {
      const res = await memories.request('/nonexistent', { method: 'DELETE' });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });
});
