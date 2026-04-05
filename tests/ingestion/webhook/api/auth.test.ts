import { describe, expect, test, beforeEach, mock } from 'bun:test';
import { createMockRedis } from '../../../helpers/mock-clients';

const mockRedis = createMockRedis();

// Mock clients module before importing anything that uses it
mock.module('../../../../lib/clients', () => ({
  getRedis: () => mockRedis.instance,
  getNeo4j: () => ({ session: () => ({ run: async () => ({ records: [] }), close: async () => {} }) }),
  getQdrant: () => ({}),
  QDRANT_INDEX_NAME: 'memories',
  EMBEDDING_DIMENSION: 768,
}));

// Now import the Hono app
const { auth } = await import('../../../../ingestion/webhook/api/auth');

const TEST_PASSWORD = 'test-admin-password';

describe('auth routes', () => {
  beforeEach(() => {
    mockRedis.reset();
    process.env.ADMIN_PASSWORD = TEST_PASSWORD;
  });

  describe('GET /status', () => {
    test('without session cookie → not authenticated', async () => {
      const res = await auth.request('/status');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.authenticated).toBe(false);
    });

    test('with valid session cookie → authenticated', async () => {
      // Create a session manually
      const sessionId = 'test-session-123';
      await mockRedis.instance.set(`session:${sessionId}`, 'active', 'EX', 86400);

      const res = await auth.request('/status', {
        headers: { Cookie: `mb_session=${sessionId}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.authenticated).toBe(true);
    });

    test('with invalid session cookie → not authenticated', async () => {
      const res = await auth.request('/status', {
        headers: { Cookie: 'mb_session=nonexistent' },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.authenticated).toBe(false);
    });
  });

  describe('POST /login', () => {
    test('correct password → 200 with session cookie', async () => {
      const res = await auth.request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: TEST_PASSWORD }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);

      // Should set a session cookie
      const setCookie = res.headers.get('Set-Cookie');
      expect(setCookie).toContain('mb_session=');
      expect(setCookie).toContain('HttpOnly');
    });

    test('wrong password → 401', async () => {
      const res = await auth.request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'wrong-password' }),
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toContain('Invalid');
    });

    test('repeated wrong attempts → 429 after max attempts', async () => {
      // Simulate 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await auth.request('/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': '1.2.3.4',
          },
          body: JSON.stringify({ password: 'wrong' }),
        });
      }

      // 6th attempt should be rate limited
      const res = await auth.request('/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '1.2.3.4',
        },
        body: JSON.stringify({ password: 'wrong' }),
      });
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.error).toContain('Too many');
    });

    test('no ADMIN_PASSWORD configured → 500', async () => {
      delete process.env.ADMIN_PASSWORD;
      const res = await auth.request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'anything' }),
      });
      expect(res.status).toBe(500);
    });
  });

  describe('POST /logout', () => {
    test('clears session cookie', async () => {
      const res = await auth.request('/logout', {
        method: 'POST',
        headers: { Cookie: 'mb_session=some-session' },
      });
      expect(res.status).toBe(200);
      const setCookie = res.headers.get('Set-Cookie');
      expect(setCookie).toContain('Max-Age=0');
    });
  });
});
