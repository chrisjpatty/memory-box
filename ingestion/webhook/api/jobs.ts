import { Hono } from 'hono';
import { createJob, cancelJob, getJob, getActiveJob, listJobs } from '../../../lib/jobs/runner';
import { getRegisteredTypes } from '../../../lib/jobs/registry';
import type { JobStatus } from '../../../lib/jobs/types';

const jobsApi = new Hono();

// Create a new job
jobsApi.post('/', async (c) => {
  const { type, payload } = await c.req.json<{ type: string; payload?: any }>();
  if (!type) return c.json({ error: 'Missing "type" field' }, 400);

  try {
    const jobId = await createJob(type, payload);
    return c.json({ jobId });
  } catch (err: any) {
    if (err.message.includes('already running')) {
      return c.json({ error: err.message }, 409);
    }
    if (err.message.includes('Unknown job type')) {
      return c.json({ error: err.message, registeredTypes: getRegisteredTypes() }, 400);
    }
    return c.json({ error: err.message }, 500);
  }
});

// List jobs with optional filters
jobsApi.get('/', async (c) => {
  const type = c.req.query('type') || undefined;
  const status = (c.req.query('status') as JobStatus) || undefined;
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const result = await listJobs({ type, status, limit, offset });
  return c.json(result);
});

// Get active job for a type
jobsApi.get('/active/:type', async (c) => {
  const type = c.req.param('type');
  const job = await getActiveJob(type);

  if (!job) return c.json({ active: false });
  return c.json({ active: true, ...job });
});

// Get job by ID
jobsApi.get('/:id', async (c) => {
  const id = c.req.param('id');
  const job = await getJob(id);

  if (!job) return c.json({ error: 'Job not found' }, 404);
  return c.json(job);
});

// Cancel a running job
jobsApi.post('/:id/cancel', async (c) => {
  const id = c.req.param('id');
  const job = await getJob(id);

  if (!job) return c.json({ error: 'Job not found' }, 404);
  if (job.status !== 'running') return c.json({ error: `Job is ${job.status}, not running` }, 400);

  await cancelJob(id);
  return c.json({ success: true, message: 'Cancellation requested' });
});

export { jobsApi };
