import { Hono } from 'hono';
import { query } from '../../../lib/db';
import { saveGitHubToken, getGitHubToken, removeGitHubToken, getTokenInfo } from '../../../lib/import/token-store';
import { startReprocessJob } from '../../../lib/import/reprocess';
import {
  discoverStars,
  startImportJob,
  enableAutoSync,
  disableAutoSync,
  getSyncStatus,
} from '../../../lib/import/github-stars';

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

// --- Auto-Sync (must be before /:jobId routes to avoid param collision) ---

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

// --- Import Job ---

importApi.post('/github/start', async (c) => {
  const { repos, token } = await c.req.json<{ repos: string[]; token?: string }>();
  if (!Array.isArray(repos) || repos.length === 0) {
    return c.json({ error: 'Missing repos array' }, 400);
  }

  try {
    const jobId = await startImportJob(repos, token);
    return c.json({ jobId });
  } catch (err: any) {
    if (err.message.includes('already in progress')) {
      return c.json({ error: err.message }, 409);
    }
    return c.json({ error: err.message }, 500);
  }
});

// Check for any active import job (survives page refresh)
importApi.get('/github/active', async (c) => {
  const result = await query(
    `SELECT * FROM jobs WHERE type = 'import' AND status = 'running' ORDER BY started_at DESC LIMIT 1`
  );

  if (result.rows.length === 0) return c.json({ active: false });

  const job = result.rows[0];
  return c.json({
    active: true,
    jobId: job.id,
    status: job.status,
    completed: job.completed || 0,
    total: job.total || 0,
    skipped: job.skipped || 0,
    failed: job.failed || 0,
    currentRepo: job.current_item || '',
    results: job.results || [],
    startedAt: job.started_at,
    completedAt: job.completed_at,
  });
});

// Poll job status (simple HTTP -- works through any proxy)
importApi.get('/github/:jobId/status', async (c) => {
  const jobId = c.req.param('jobId');

  const result = await query('SELECT * FROM jobs WHERE id = $1', [jobId]);
  if (result.rows.length === 0) {
    return c.json({ error: 'Job not found' }, 404);
  }

  const job = result.rows[0];
  return c.json({
    status: job.status,
    completed: job.completed || 0,
    total: job.total || 0,
    skipped: job.skipped || 0,
    failed: job.failed || 0,
    currentRepo: job.current_item || '',
    results: job.results || [],
    startedAt: job.started_at,
    completedAt: job.completed_at,
    error: job.error,
  });
});

importApi.post('/github/:jobId/cancel', async (c) => {
  const jobId = c.req.param('jobId');

  const result = await query('SELECT status FROM jobs WHERE id = $1', [jobId]);
  if (result.rows.length === 0) return c.json({ error: 'Job not found' }, 404);

  const { status } = result.rows[0];
  if (status !== 'running') return c.json({ error: `Job is ${status}, not running` }, 400);

  await query(`UPDATE jobs SET status = 'cancelled' WHERE id = $1 AND status = 'running'`, [jobId]);
  return c.json({ success: true, message: 'Cancellation requested' });
});

// --- Reprocessing ---

importApi.post('/reprocess/start', async (c) => {
  try {
    const jobId = await startReprocessJob();
    return c.json({ jobId });
  } catch (err: any) {
    console.error('Reprocess start error:', err);
    if (err.message?.includes('already in progress')) {
      return c.json({ error: err.message }, 409);
    }
    return c.json({ error: err.message || 'Unknown error' }, 500);
  }
});

importApi.get('/reprocess/active', async (c) => {
  const result = await query(
    `SELECT * FROM jobs WHERE type = 'reprocess' AND status = 'running' ORDER BY started_at DESC LIMIT 1`
  );

  if (result.rows.length === 0) return c.json({ active: false });

  const job = result.rows[0];
  return c.json({
    active: true,
    jobId: job.id,
    status: job.status,
    completed: job.completed || 0,
    total: job.total || 0,
    skipped: job.skipped || 0,
    failed: job.failed || 0,
    currentMemory: job.current_item || '',
    startedAt: job.started_at,
    completedAt: job.completed_at,
    error: job.error,
  });
});

importApi.get('/reprocess/:jobId/status', async (c) => {
  const jobId = c.req.param('jobId');

  const result = await query('SELECT * FROM jobs WHERE id = $1', [jobId]);
  if (result.rows.length === 0) {
    return c.json({ error: 'Job not found' }, 404);
  }

  const job = result.rows[0];
  return c.json({
    status: job.status,
    completed: job.completed || 0,
    total: job.total || 0,
    skipped: job.skipped || 0,
    failed: job.failed || 0,
    currentMemory: job.current_item || '',
    startedAt: job.started_at,
    completedAt: job.completed_at,
    error: job.error,
  });
});

importApi.post('/reprocess/:jobId/cancel', async (c) => {
  const jobId = c.req.param('jobId');

  const result = await query('SELECT status FROM jobs WHERE id = $1', [jobId]);
  if (result.rows.length === 0) return c.json({ error: 'Job not found' }, 404);

  const { status } = result.rows[0];
  if (status !== 'running') return c.json({ error: `Job is ${status}, not running` }, 400);

  await query(`UPDATE jobs SET status = 'cancelled' WHERE id = $1 AND status = 'running'`, [jobId]);
  return c.json({ success: true, message: 'Cancellation requested' });
});

export { importApi };
