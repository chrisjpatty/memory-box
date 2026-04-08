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

  describe('GET /', () => {
    test('with no tokens → empty list', async () => {
      const res = await token.request('/');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.tokens).toEqual([]);
    });

    test('after creating tokens → lists all', async () => {
      await token.request('/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'CLI' }),
      });
      await token.request('/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'CI/CD' }),
      });

      const res = await token.request('/');
      const body = await res.json();
      expect(body.tokens).toHaveLength(2);
      expect(body.tokens[0].name).toBeDefined();
      expect(body.tokens[0].hint).toContain('...');
    });
  });

  describe('POST /create', () => {
    test('returns a new token', async () => {
      const res = await token.request('/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test Token' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.token).toBeDefined();
      expect(body.token.length).toBe(48);
    });

    test('requires a name → 400', async () => {
      const res = await token.request('/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    test('rejects empty name → 400', async () => {
      const res = await token.request('/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '   ' }),
      });
      expect(res.status).toBe(400);
    });

    test('allows multiple tokens to coexist', async () => {
      const res1 = await token.request('/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Token A' }),
      });
      const res2 = await token.request('/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Token B' }),
      });
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      const listRes = await token.request('/');
      const listBody = await listRes.json();
      expect(listBody.tokens).toHaveLength(2);
    });
  });

  describe('DELETE /:id', () => {
    test('revokes a specific token', async () => {
      await token.request('/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'To Revoke' }),
      });

      const listRes = await token.request('/');
      const listBody = await listRes.json();
      const id = listBody.tokens[0].id;

      const res = await token.request(`/${id}`, { method: 'DELETE' });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      const afterRes = await token.request('/');
      const afterBody = await afterRes.json();
      expect(afterBody.tokens).toHaveLength(0);
    });

    test('does not revoke other tokens', async () => {
      await token.request('/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Keep' }),
      });
      await token.request('/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Remove' }),
      });

      const listRes = await token.request('/');
      const listBody = await listRes.json();
      const removeId = listBody.tokens.find((t: any) => t.name === 'Remove').id;

      await token.request(`/${removeId}`, { method: 'DELETE' });

      const afterRes = await token.request('/');
      const afterBody = await afterRes.json();
      expect(afterBody.tokens).toHaveLength(1);
      expect(afterBody.tokens[0].name).toBe('Keep');
    });

    test('returns 404 for non-existent token', async () => {
      const res = await token.request('/99999', { method: 'DELETE' });
      expect(res.status).toBe(404);
    });

    test('returns 400 for invalid ID', async () => {
      const res = await token.request('/abc', { method: 'DELETE' });
      expect(res.status).toBe(400);
    });
  });
});
