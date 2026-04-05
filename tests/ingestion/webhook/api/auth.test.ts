import { describe, expect, test, beforeEach, mock } from 'bun:test';
import { createMockPool } from '../../../helpers/mock-clients';

const mockPool = createMockPool();

mock.module('../../../../lib/db', () => ({
  getPool: () => mockPool.instance,
  query: mockPool.instance.query,
  getClient: mockPool.instance.connect,
}));

const { auth } = await import('../../../../ingestion/webhook/api/auth');

const TEST_PASSWORD = 'test-admin-password';

describe('auth routes', () => {
  beforeEach(() => {
    mockPool.reset();
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
      const sessionId = 'test-session-123';
      const expiresAt = new Date(Date.now() + 86400_000).toISOString();
      mockPool.sessions.set(sessionId, { id: sessionId, expires_at: expiresAt });

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
    });

    test('repeated wrong attempts → 429 after max attempts', async () => {
      for (let i = 0; i < 5; i++) {
        await auth.request('/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '1.2.3.4' },
          body: JSON.stringify({ password: 'wrong' }),
        });
      }
      const res = await auth.request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '1.2.3.4' },
        body: JSON.stringify({ password: 'wrong' }),
      });
      expect(res.status).toBe(429);
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
