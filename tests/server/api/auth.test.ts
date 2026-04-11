import { describe, expect, test, beforeEach, mock } from 'bun:test';
import { createMockPool } from '../../helpers/mock-clients';

const mockPool = createMockPool();

mock.module('../../../lib/db', () => ({
  getPool: () => mockPool.instance,
  query: mockPool.instance.query,
  getClient: mockPool.instance.connect,
}));

const { auth } = await import('../../../server/api/auth');
const { hashPassword } = await import('../../../lib/auth');

const TEST_PASSWORD = 'test-admin-password';

async function seedPassword(password: string) {
  const hash = await hashPassword(password);
  mockPool.settings.set('password_hash', hash);
}

describe('auth routes', () => {
  beforeEach(() => {
    mockPool.reset();
  });

  describe('GET /status', () => {
    test('no password set → setupRequired true', async () => {
      const res = await auth.request('/status');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.authenticated).toBe(false);
      expect(body.setupRequired).toBe(true);
    });

    test('password set, no session → setupRequired false, not authenticated', async () => {
      await seedPassword(TEST_PASSWORD);
      const res = await auth.request('/status');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.authenticated).toBe(false);
      expect(body.setupRequired).toBe(false);
    });

    test('with valid session → authenticated', async () => {
      await seedPassword(TEST_PASSWORD);
      const sessionId = 'test-session-123';
      const expiresAt = new Date(Date.now() + 86400_000).toISOString();
      mockPool.sessions.set(sessionId, { id: sessionId, expires_at: expiresAt });

      const res = await auth.request('/status', {
        headers: { Cookie: `mb_session=${sessionId}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.authenticated).toBe(true);
      expect(body.setupRequired).toBe(false);
    });
  });

  describe('POST /setup', () => {
    test('sets initial password and creates session', async () => {
      const res = await auth.request('/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: TEST_PASSWORD }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(mockPool.settings.has('password_hash')).toBe(true);
      const setCookie = res.headers.get('Set-Cookie');
      expect(setCookie).toContain('mb_session=');
    });

    test('rejects if password already exists', async () => {
      await seedPassword(TEST_PASSWORD);
      const res = await auth.request('/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'new-password-123' }),
      });
      expect(res.status).toBe(400);
    });

    test('rejects password shorter than 8 characters', async () => {
      const res = await auth.request('/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'short' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /login', () => {
    test('correct password → 200 with session cookie', async () => {
      await seedPassword(TEST_PASSWORD);
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
      await seedPassword(TEST_PASSWORD);
      const res = await auth.request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'wrong-password' }),
      });
      expect(res.status).toBe(401);
    });

    test('no password configured → 400', async () => {
      const res = await auth.request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'anything' }),
      });
      expect(res.status).toBe(400);
    });

    test('repeated wrong attempts → 429 after max attempts', async () => {
      await seedPassword(TEST_PASSWORD);
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
