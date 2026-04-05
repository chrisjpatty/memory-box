import { Hono } from 'hono';
import { getRedis } from '../../../lib/clients';
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
  const redis = getRedis();
  const activeJobId = await redis.get('active-import-job');
  if (!activeJobId) return c.json({ active: false });

  const jobData = await redis.hgetall(`import-job:${activeJobId}`);
  if (!jobData || !jobData.status) {
    await redis.del('active-import-job');
    return c.json({ active: false });
  }

  const completed = parseInt(jobData.completed || '0');
  const total = parseInt(jobData.total || '0');
  const skipped = parseInt(jobData.skipped || '0');
  const failed = parseInt(jobData.failed || '0');

  return c.json({
    active: true,
    jobId: activeJobId,
    status: jobData.status,
    completed,
    total,
    skipped,
    failed,
    currentRepo: jobData.currentRepo || '',
    results: JSON.parse(jobData.results || '[]'),
    startedAt: jobData.startedAt,
    completedAt: jobData.completedAt,
  });
});

// Poll job status (simple HTTP — works through any proxy)
importApi.get('/github/:jobId/status', async (c) => {
  const jobId = c.req.param('jobId');
  const redis = getRedis();

  const jobData = await redis.hgetall(`import-job:${jobId}`);
  if (!jobData || !jobData.status) {
    return c.json({ error: 'Job not found' }, 404);
  }

  const completed = parseInt(jobData.completed || '0');
  const total = parseInt(jobData.total || '0');
  const skipped = parseInt(jobData.skipped || '0');
  const failed = parseInt(jobData.failed || '0');

  return c.json({
    status: jobData.status,
    completed,
    total,
    skipped,
    failed,
    currentRepo: jobData.currentRepo || '',
    results: JSON.parse(jobData.results || '[]'),
    startedAt: jobData.startedAt,
    completedAt: jobData.completedAt,
    error: jobData.error,
  });
});

importApi.post('/github/:jobId/cancel', async (c) => {
  const jobId = c.req.param('jobId');
  const redis = getRedis();

  const status = await redis.hget(`import-job:${jobId}`, 'status');
  if (!status) return c.json({ error: 'Job not found' }, 404);
  if (status !== 'running') return c.json({ error: `Job is ${status}, not running` }, 400);

  await redis.hset(`import-job:${jobId}`, 'status', 'cancelled');
  await redis.del('active-import-job');
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
  const redis = getRedis();
  const activeJobId = await redis.get('active-reprocess-job');
  if (!activeJobId) return c.json({ active: false });

  const jobData = await redis.hgetall(`reprocess-job:${activeJobId}`);
  if (!jobData || !jobData.status) {
    await redis.del('active-reprocess-job');
    return c.json({ active: false });
  }

  return c.json({
    active: true,
    jobId: activeJobId,
    status: jobData.status,
    completed: parseInt(jobData.completed || '0'),
    total: parseInt(jobData.total || '0'),
    skipped: parseInt(jobData.skipped || '0'),
    failed: parseInt(jobData.failed || '0'),
    currentMemory: jobData.currentMemory || '',
    startedAt: jobData.startedAt,
    completedAt: jobData.completedAt,
    error: jobData.error,
  });
});

importApi.get('/reprocess/:jobId/status', async (c) => {
  const jobId = c.req.param('jobId');
  const redis = getRedis();

  const jobData = await redis.hgetall(`reprocess-job:${jobId}`);
  if (!jobData || !jobData.status) {
    return c.json({ error: 'Job not found' }, 404);
  }

  return c.json({
    status: jobData.status,
    completed: parseInt(jobData.completed || '0'),
    total: parseInt(jobData.total || '0'),
    skipped: parseInt(jobData.skipped || '0'),
    failed: parseInt(jobData.failed || '0'),
    currentMemory: jobData.currentMemory || '',
    startedAt: jobData.startedAt,
    completedAt: jobData.completedAt,
    error: jobData.error,
  });
});

importApi.post('/reprocess/:jobId/cancel', async (c) => {
  const jobId = c.req.param('jobId');
  const redis = getRedis();

  const status = await redis.hget(`reprocess-job:${jobId}`, 'status');
  if (!status) return c.json({ error: 'Job not found' }, 404);
  if (status !== 'running') return c.json({ error: `Job is ${status}, not running` }, 400);

  await redis.hset(`reprocess-job:${jobId}`, 'status', 'cancelled');
  await redis.del('active-reprocess-job');
  return c.json({ success: true, message: 'Cancellation requested' });
});

export { importApi };
