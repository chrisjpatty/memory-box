import { describe, expect, test, beforeEach, mock } from 'bun:test';
import { createMockRedis } from '../../../helpers/mock-clients';

const mockRedis = createMockRedis();

mock.module('../../../../lib/clients', () => ({
  getRedis: () => mockRedis.instance,
  getNeo4j: () => ({ session: () => ({ run: async () => ({ records: [] }), close: async () => {} }) }),
  getQdrant: () => ({}),
  QDRANT_INDEX_NAME: 'memories',
  EMBEDDING_DIMENSION: 768,
}));

const { token } = await import('../../../../ingestion/webhook/api/token');

describe('token routes', () => {
  beforeEach(() => {
    mockRedis.reset();
  });

  describe('GET /hint', () => {
    test('with no token → hasToken false', async () => {
      const res = await token.request('/hint');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.hasToken).toBe(false);
    });

    test('after generating token → shows hint', async () => {
      // Generate a token first
      const genRes = await token.request('/generate', { method: 'POST' });
      expect(genRes.status).toBe(200);

      const hintRes = await token.request('/hint');
      const body = await hintRes.json();
      expect(body.hasToken).toBe(true);
      expect(body.hint).toContain('...');
    });
  });

  describe('POST /generate', () => {
    test('returns a new token', async () => {
      const res = await token.request('/generate', { method: 'POST' });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.token).toBeDefined();
      expect(body.token.length).toBe(48);
    });

    test('fails if token already exists → 409', async () => {
      // Generate first token
      await token.request('/generate', { method: 'POST' });

      // Try to generate again
      const res = await token.request('/generate', { method: 'POST' });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain('already exists');
    });
  });

  describe('POST /rotate', () => {
    test('revokes old and returns new token', async () => {
      // Generate initial token
      const gen1 = await token.request('/generate', { method: 'POST' });
      const body1 = await gen1.json();
      const oldToken = body1.token;

      // Rotate
      const rotateRes = await token.request('/rotate', { method: 'POST' });
      expect(rotateRes.status).toBe(200);
      const body2 = await rotateRes.json();
      expect(body2.token).toBeDefined();
      expect(body2.token).not.toBe(oldToken);
      expect(body2.token.length).toBe(48);
    });

    test('works even with no existing token', async () => {
      const res = await token.request('/rotate', { method: 'POST' });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.token).toBeDefined();
    });
  });
});
