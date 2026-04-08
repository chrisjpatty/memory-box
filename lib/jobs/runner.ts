import { nanoid } from 'nanoid';
import { query } from '../db';
import { getJobHandler } from './registry';
import type { JobContext, JobRecord, JobStatus } from './types';

const STALE_JOB_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

// Track jobs that are actually being processed in this server instance
const activeJobIds = new Set<string>();

/**
 * Recover orphaned jobs that are stuck in 'running' status from a previous
 * server instance (e.g., after a restart or crash). Any job marked 'running'
 * that isn't tracked by this process is assumed orphaned.
 */
export async function recoverStaleJobs(): Promise<number> {
  const result = await query(
    `UPDATE jobs
     SET status = 'failed',
         error = 'Job orphaned by server restart',
         completed_at = $1
     WHERE status = 'running'
       AND started_at < $2
     RETURNING id, type`,
    [
      new Date().toISOString(),
      new Date(Date.now() - STALE_JOB_THRESHOLD_MS).toISOString(),
    ],
  );

  if (result.rows.length > 0) {
    console.warn(
      `Recovered ${result.rows.length} stale job(s):`,
      result.rows.map((r: any) => `${r.type}/${r.id}`).join(', '),
    );
  }
  return result.rows.length;
}

export async function createJob(type: string, payload: any = {}): Promise<string> {
  const handler = getJobHandler(type);

  if (handler.exclusive !== false) {
    const active = await query(
      `SELECT id FROM jobs WHERE type = $1 AND status = 'running' LIMIT 1`,
      [type],
    );
    if (active.rows.length > 0) {
      throw new Error(`A ${handler.displayName} job is already running`);
    }
  }

  const jobId = nanoid(21);
  await query(
    `INSERT INTO jobs (id, type, status, payload, total, completed, skipped, failed, current_item, results, started_at)
     VALUES ($1, $2, 'running', $3::jsonb, 0, 0, 0, 0, '', '[]'::jsonb, $4)`,
    [jobId, type, JSON.stringify(payload), new Date().toISOString()],
  );

  // Fire and forget
  activeJobIds.add(jobId);
  processJob(jobId, handler, payload)
    .catch(async (err) => {
      console.error(`Job ${jobId} (${type}) failed:`, err);
      await query(
        `UPDATE jobs SET status = 'failed', error = $1, completed_at = $2 WHERE id = $3`,
        [err.message, new Date().toISOString(), jobId],
      );
    })
    .finally(() => {
      activeJobIds.delete(jobId);
    });

  return jobId;
}

async function processJob(jobId: string, handler: any, payload: any): Promise<void> {
  const ctx = createJobContext(jobId);
  await handler.process(payload, ctx);

  // Mark complete unless cancelled during processing
  const result = await query('SELECT status FROM jobs WHERE id = $1', [jobId]);
  if (result.rows[0]?.status === 'cancelled') return;

  await query(
    `UPDATE jobs SET status = 'completed', completed_at = $1, current_item = '' WHERE id = $2 AND status = 'running'`,
    [new Date().toISOString(), jobId],
  );
}

function createJobContext(jobId: string): JobContext {
  return {
    jobId,
    async progress(update) {
      const sets: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      if (update.total !== undefined) { sets.push(`total = $${idx++}`); vals.push(update.total); }
      if (update.completed !== undefined) { sets.push(`completed = $${idx++}`); vals.push(update.completed); }
      if (update.skipped !== undefined) { sets.push(`skipped = $${idx++}`); vals.push(update.skipped); }
      if (update.failed !== undefined) { sets.push(`failed = $${idx++}`); vals.push(update.failed); }
      if (update.currentItem !== undefined) { sets.push(`current_item = $${idx++}`); vals.push(update.currentItem); }
      if (sets.length === 0) return;
      vals.push(jobId);
      await query(`UPDATE jobs SET ${sets.join(', ')} WHERE id = $${idx}`, vals);
    },
    async addResults(results) {
      await query(
        `UPDATE jobs SET results = results || $1::jsonb WHERE id = $2`,
        [JSON.stringify(results), jobId],
      );
    },
    async isCancelled() {
      const result = await query('SELECT status FROM jobs WHERE id = $1', [jobId]);
      return result.rows[0]?.status === 'cancelled';
    },
    async tick() {
      await query('UPDATE jobs SET completed = completed + 1 WHERE id = $1', [jobId]);
    },
    async tickFailed() {
      await query('UPDATE jobs SET completed = completed + 1, failed = failed + 1 WHERE id = $1', [jobId]);
    },
    async tickSkipped() {
      await query('UPDATE jobs SET completed = completed + 1, skipped = skipped + 1 WHERE id = $1', [jobId]);
    },
  };
}

export async function cancelJob(jobId: string): Promise<void> {
  await query(
    `UPDATE jobs SET status = 'cancelled' WHERE id = $1 AND status = 'running'`,
    [jobId],
  );
}

export async function getJob(jobId: string): Promise<JobRecord | null> {
  const result = await query('SELECT * FROM jobs WHERE id = $1', [jobId]);
  if (result.rows.length === 0) return null;
  return mapJobRow(result.rows[0]);
}

export async function getActiveJob(type: string): Promise<JobRecord | null> {
  const result = await query(
    `SELECT * FROM jobs WHERE type = $1 AND status = 'running' ORDER BY started_at DESC LIMIT 1`,
    [type],
  );
  if (result.rows.length === 0) return null;
  return mapJobRow(result.rows[0]);
}

export async function listJobs(filter?: {
  type?: string;
  status?: JobStatus;
  limit?: number;
  offset?: number;
}): Promise<{ jobs: JobRecord[]; total: number }> {
  const conditions: string[] = [];
  const vals: any[] = [];
  let idx = 1;

  if (filter?.type) { conditions.push(`type = $${idx++}`); vals.push(filter.type); }
  if (filter?.status) { conditions.push(`status = $${idx++}`); vals.push(filter.status); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filter?.limit || 50;
  const offset = filter?.offset || 0;

  const countVals = [...vals];
  vals.push(limit, offset);

  const [dataResult, countResult] = await Promise.all([
    query(`SELECT * FROM jobs ${where} ORDER BY started_at DESC LIMIT $${idx++} OFFSET $${idx++}`, vals),
    query(`SELECT COUNT(*) FROM jobs ${where}`, countVals),
  ]);

  return {
    jobs: dataResult.rows.map(mapJobRow),
    total: parseInt(countResult.rows[0].count),
  };
}

function mapJobRow(row: any): JobRecord {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    payload: row.payload || {},
    total: row.total || 0,
    completed: row.completed || 0,
    skipped: row.skipped || 0,
    failed: row.failed || 0,
    currentItem: row.current_item || '',
    results: row.results || [],
    error: row.error || null,
    parentJobId: row.parent_job_id || null,
    startedAt: row.started_at,
    completedAt: row.completed_at || null,
  };
}
