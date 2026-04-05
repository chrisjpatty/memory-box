import { describe, expect, test, mock } from 'bun:test';
import { splitOversizedChunks } from '../../../../lib/pipeline/embed';
import { createMockPool } from '../../../helpers/mock-clients';

const mockPool = createMockPool();

mock.module('../../../../lib/db', () => ({
  getPool: () => mockPool.instance,
  query: mockPool.instance.query,
  getClient: mockPool.instance.connect,
}));

mock.module('../../../../lib/pipeline/embed', () => ({
  getEmbeddingProvider: () => ({
    embed: async (texts: string[]) => texts.map(() => new Array(768).fill(0)),
    embedOne: async () => new Array(768).fill(0),
    dimension: 768,
  }),
  setEmbeddingProvider: () => {},
  splitOversizedChunks,
}));

const { search } = await import('../../../../ingestion/webhook/api/search');

describe('search routes', () => {
  test('POST / with query → returns results array', async () => {
    const res = await search.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test query' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toBeDefined();
    expect(Array.isArray(body.results)).toBe(true);
  });

  test('POST / without query → 400', async () => {
    const res = await search.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Missing query');
  });

  test('POST / with limit → respects limit param', async () => {
    const res = await search.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', limit: 3 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results.length).toBeLessThanOrEqual(3);
  });
});
