import { describe, expect, test, beforeEach, mock } from 'bun:test';
import { createMockPool } from '../../../helpers/mock-clients';

const mockPool = createMockPool();

mock.module('../../../../lib/db', () => ({
  getPool: () => mockPool.instance,
  query: mockPool.instance.query,
  getClient: mockPool.instance.connect,
}));

const { token } = await import('../../../../ingestion/webhook/api/token');

describe('token routes', () => {
  beforeEach(() => {
    mockPool.reset();
  });

  describe('GET /hint', () => {
    test('with no token → hasToken false', async () => {
      const res = await token.request('/hint');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.hasToken).toBe(false);
    });

    test('after generating token → shows hint', async () => {
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
      await token.request('/generate', { method: 'POST' });
      const res = await token.request('/generate', { method: 'POST' });
      expect(res.status).toBe(409);
    });
  });

  describe('POST /rotate', () => {
    test('revokes old and returns new token', async () => {
      const gen1 = await token.request('/generate', { method: 'POST' });
      const body1 = await gen1.json();
      const oldToken = body1.token;

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
