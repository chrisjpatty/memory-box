import { Hono } from 'hono';
import { saveGitHubToken, getGitHubToken, removeGitHubToken, getTokenInfo } from '../../lib/import/token-store';
import {
  discoverStars,
  enableAutoSync,
  disableAutoSync,
  getSyncStatus,
} from '../../lib/import/github-stars';
import {
  saveTwitterCredentials,
  getTwitterTokenInfo,
  generateAuthUrl,
  handleOAuthCallback,
  removeTwitterConnection,
} from '../../lib/import/twitter-token-store';
import {
  discoverBookmarks,
  discoverBookmarkFolders,
  parseBookmarksFromExport,
} from '../../lib/import/twitter-bookmarks';

const importApi = new Hono();

// --- Token Management ---

importApi.post('/github/token', async (c) => {
  const { token } = await c.req.json<{ token: string }>();
  if (!token) return c.json({ error: 'Missing token' }, 400);

  try {
    const { username, hint } = await saveGitHubToken(token);
    return c.json({ success: true, username, hint });
  } catch (err: any) {
    return c.json({ error: `Invalid token: ${err.message}` }, 400);
  }
});

importApi.get('/github/token', async (c) => {
  try {
    const info = await getTokenInfo();
    return c.json(info);
  } catch (err: any) {
    console.error('Token info error:', err);
    return c.json({ hasToken: false, error: err.message }, 200);
  }
});

importApi.delete('/github/token', async (c) => {
  await removeGitHubToken();
  await disableAutoSync();
  return c.json({ success: true });
});

// --- Discovery ---

importApi.post('/github/discover', async (c) => {
  const { username, token } = await c.req.json<{ username: string; token?: string }>();
  if (!username) return c.json({ error: 'Missing username' }, 400);

  try {
    const result = await discoverStars(username, token);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: `Discovery failed: ${err.message}` }, 500);
  }
});

// --- Auto-Sync ---

importApi.post('/github/sync/enable', async (c) => {
  const token = await getGitHubToken();
  if (!token) return c.json({ error: 'No GitHub token saved' }, 400);

  await enableAutoSync();
  return c.json({ success: true });
});

importApi.post('/github/sync/disable', async (c) => {
  await disableAutoSync();
  return c.json({ success: true });
});

importApi.get('/github/sync/status', async (c) => {
  const status = await getSyncStatus();
  return c.json(status);
});

// --- Twitter OAuth 2.0 ---

// Callback handler — session middleware is skipped for this path (see index.ts)
importApi.get('/twitter/callback', async (c) => {
  const error = c.req.query('error');
  if (error) {
    const desc = c.req.query('error_description') || error;
    return c.redirect(`/import/twitter?error=${encodeURIComponent(desc)}`);
  }

  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!code || !state) {
    return c.redirect('/import/twitter?error=Missing+authorization+code');
  }

  try {
    await handleOAuthCallback(code, state);
    return c.redirect('/import/twitter?connected=true');
  } catch (err: any) {
    console.error('Twitter OAuth callback error:', err);
    return c.redirect(`/import/twitter?error=${encodeURIComponent(err.message)}`);
  }
});

importApi.post('/twitter/credentials', async (c) => {
  const { clientId, clientSecret } = await c.req.json<{ clientId: string; clientSecret: string }>();
  if (!clientId || !clientSecret) return c.json({ error: 'Missing clientId or clientSecret' }, 400);

  try {
    await saveTwitterCredentials(clientId, clientSecret);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

importApi.get('/twitter/status', async (c) => {
  try {
    const info = await getTwitterTokenInfo();
    return c.json(info);
  } catch (err: any) {
    console.error('Twitter status error:', err);
    return c.json({ hasCredentials: false, hasToken: false, error: err.message }, 200);
  }
});

importApi.get('/twitter/authorize', async (c) => {
  try {
    const proto = c.req.header('x-forwarded-proto') || 'http';
    const host = c.req.header('host') || 'localhost:3001';
    const callbackUrl = `${proto}://${host}/api/import/twitter/callback`;

    const url = await generateAuthUrl(callbackUrl);
    return c.json({ url });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

importApi.delete('/twitter/disconnect', async (c) => {
  await removeTwitterConnection();
  return c.json({ success: true });
});

// --- Twitter Bookmark Discovery ---

importApi.get('/twitter/folders', async (c) => {
  try {
    const folders = await discoverBookmarkFolders();
    return c.json({ folders });
  } catch (err: any) {
    return c.json({ error: `Failed to fetch folders: ${err.message}` }, 500);
  }
});

importApi.post('/twitter/discover', async (c) => {
  const { folderId } = await c.req.json<{ folderId?: string }>();

  try {
    const result = await discoverBookmarks(folderId);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: `Discovery failed: ${err.message}` }, 500);
  }
});

importApi.post('/twitter/upload', async (c) => {
  const body = await c.req.parseBody();
  const file = body['file'];

  if (!file || !(file instanceof File)) {
    return c.json({ error: 'Missing zip file' }, 400);
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const result = await parseBookmarksFromExport(buffer);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

export { importApi };
