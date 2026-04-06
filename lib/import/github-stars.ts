import { nanoid } from 'nanoid';
import { query } from '../db';
import { ingest } from '../ingest';
import { githubFetch, GitHubRateLimitError } from '../pipeline/url-handlers/github';
import { getGitHubToken } from './token-store';

// --- Discovery ---

export interface StarredRepo {
  url: string;
  fullName: string;
  description: string;
  stars: number;
  language: string | null;
  alreadyImported: boolean;
  existingMemoryId?: string;
}

export interface DiscoverResult {
  repos: StarredRepo[];
  totalStars: number;
  alreadyImported: number;
  newCount: number;
  privateExcluded: number;
  rateLimit: { remaining: number; limit: number; reset: string };
}

/**
 * Fetch all starred repos for a user, filter out private repos,
 * and check which are already imported via source_url dedup.
 */
export async function discoverStars(username: string, token?: string): Promise<DiscoverResult> {
  const resolvedToken = token || await getGitHubToken() || undefined;

  // Paginate through all starred repos
  let page = 1;
  let allRepos: any[] = [];
  let privateExcluded = 0;

  while (true) {
    const batch = await githubFetch(
      `/users/${username}/starred?per_page=100&page=${page}`,
      resolvedToken,
    );
    if (!Array.isArray(batch) || batch.length === 0) break;

    for (const repo of batch) {
      if (repo.private) {
        privateExcluded++;
      } else {
        allRepos.push(repo);
      }
    }

    if (batch.length < 100) break;
    page++;
  }

  // Batch dedup check: single query instead of N sequential queries
  const repoUrls = allRepos.map((r: any) => r.html_url);
  const dedupResult = await query(
    'SELECT id, source_url FROM memories WHERE source_url = ANY($1)',
    [repoUrls],
  );
  const importedMap = new Map<string, string>();
  for (const row of dedupResult.rows) {
    importedMap.set(row.source_url, row.id);
  }

  const repos: StarredRepo[] = allRepos.map((repo: any) => {
    const repoUrl = repo.html_url;
    const existingMemoryId = importedMap.get(repoUrl);
    return {
      url: repoUrl,
      fullName: repo.full_name,
      description: repo.description || '',
      stars: repo.stargazers_count || 0,
      language: repo.language || null,
      alreadyImported: !!existingMemoryId,
      existingMemoryId,
    };
  });

  // Get rate limit info
  let rateLimit = { remaining: 0, limit: 0, reset: '' };
  try {
    const rl = await githubFetch('/rate_limit', resolvedToken);
    rateLimit = {
      remaining: rl.rate?.remaining || 0,
      limit: rl.rate?.limit || 0,
      reset: new Date((rl.rate?.reset || 0) * 1000).toISOString(),
    };
  } catch { /* non-critical */ }

  const alreadyImported = repos.filter((r) => r.alreadyImported).length;

  return {
    repos,
    totalStars: repos.length + privateExcluded,
    alreadyImported,
    newCount: repos.length - alreadyImported,
    privateExcluded,
    rateLimit,
  };
}

// --- Import Job Processing ---

export interface ImportJobResult {
  repo: string;
  status: 'imported' | 'skipped' | 'failed';
  memoryId?: string;
  error?: string;
}

/**
 * Process an import job sequentially. Runs as a fire-and-forget async function.
 * Updates the jobs table after each repo so SSE can stream progress.
 */
export async function processImportJob(
  jobId: string,
  repos: string[],
  githubToken?: string,
): Promise<void> {
  const concurrency = githubToken ? 5 : 1;

  // Set token once for the entire job (safe: startImportJob enforces single active job)
  const originalToken = process.env.GITHUB_TOKEN;
  if (githubToken) process.env.GITHUB_TOKEN = githubToken;

  let cancelled = false;
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (!cancelled) {
      const i = nextIndex++;
      if (i >= repos.length) break;

      // Check for cancellation
      const statusResult = await query('SELECT status FROM jobs WHERE id = $1', [jobId]);
      if (statusResult.rows[0]?.status === 'cancelled') {
        cancelled = true;
        await query('UPDATE jobs SET completed_at = $1 WHERE id = $2', [new Date().toISOString(), jobId]);
        return;
      }

      const repoUrl = repos[i];
      await query('UPDATE jobs SET current_item = $1 WHERE id = $2', [repoUrl, jobId]);

      try {
        const result = await ingest({ content: repoUrl });

        const entry: ImportJobResult = result.deduplicated
          ? { repo: repoUrl, status: 'skipped', memoryId: result.existingMemoryId }
          : { repo: repoUrl, status: 'imported', memoryId: result.memoryId };

        await query('UPDATE jobs SET completed = completed + 1 WHERE id = $1', [jobId]);
        if (result.deduplicated) {
          await query('UPDATE jobs SET skipped = skipped + 1 WHERE id = $1', [jobId]);
        }

        await query(
          `UPDATE jobs SET results = results || $1::jsonb WHERE id = $2`,
          [JSON.stringify([entry]), jobId],
        );

      } catch (err: any) {
        if (err instanceof GitHubRateLimitError) {
          const waitMs = Math.max(0, err.resetAt * 1000 - Date.now()) + 1000;
          await query('UPDATE jobs SET current_item = $1 WHERE id = $2', [
            `Rate limited — resuming in ${Math.ceil(waitMs / 1000)}s`,
            jobId,
          ]);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          nextIndex--; // Put this slot back for retry
          continue;
        }

        console.error(`Import failed for ${repoUrl}:`, err.message, err.stack?.split('\n').slice(0, 3).join('\n'));

        await query('UPDATE jobs SET completed = completed + 1, failed = failed + 1 WHERE id = $1', [jobId]);

        await query(
          `UPDATE jobs SET results = results || $1::jsonb WHERE id = $2`,
          [JSON.stringify([{ repo: repoUrl, status: 'failed', error: err.message }]), jobId],
        );
      }
    }
  }

  try {
    await Promise.all(
      Array.from({ length: Math.min(concurrency, repos.length) }, () => worker()),
    );

    // Mark complete (unless cancelled)
    if (!cancelled) {
      await query(
        `UPDATE jobs SET status = 'completed', completed_at = $1, current_item = '' WHERE id = $2`,
        [new Date().toISOString(), jobId],
      );
    }
  } finally {
    if (githubToken) {
      if (originalToken) process.env.GITHUB_TOKEN = originalToken;
      else delete process.env.GITHUB_TOKEN;
    }
  }
}

/**
 * Create a new import job and start processing in the background.
 * Returns the jobId. Throws if an import is already running.
 */
export async function startImportJob(repos: string[], token?: string): Promise<string> {
  const resolvedToken = token || await getGitHubToken() || undefined;

  // Enforce single import at a time
  const activeResult = await query(
    `SELECT id FROM jobs WHERE type = 'import' AND status = 'running' LIMIT 1`,
  );
  if (activeResult.rows.length > 0) {
    throw new Error('An import is already in progress');
  }

  const jobId = nanoid(21);

  await query(
    `INSERT INTO jobs (id, type, status, total, completed, skipped, failed, current_item, results, started_at)
     VALUES ($1, 'import', 'running', $2, 0, 0, 0, '', '[]'::jsonb, $3)`,
    [jobId, repos.length, new Date().toISOString()],
  );

  // Fire and forget
  processImportJob(jobId, repos, resolvedToken).catch(async (err) => {
    console.error('Import job failed:', err);
    await query(
      `UPDATE jobs SET status = 'failed', error = $1, completed_at = $2 WHERE id = $3`,
      [err.message, new Date().toISOString(), jobId],
    );
  });

  return jobId;
}

// --- Auto-Sync ---

let syncInterval: ReturnType<typeof setInterval> | null = null;

const SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Run a single sync check: fetch recent stars and ingest any new public ones.
 */
export async function runSyncCheck(): Promise<void> {
  const token = await getGitHubToken();
  if (!token) return;

  const usernameResult = await query(
    `SELECT value FROM settings WHERE key = 'github_sync_username'`,
  );
  const username = usernameResult.rows[0]?.value;
  if (!username) return;

  try {
    // Fetch most recent stars (newest first)
    const batch = await githubFetch(
      `/users/${username}/starred?per_page=30&sort=created&direction=desc`,
      token,
    );

    if (!Array.isArray(batch)) return;

    for (const repo of batch) {
      if (repo.private) continue;

      const repoUrl = repo.html_url;

      // Quick dedup check before calling full ingest
      const existing = await query('SELECT id FROM memories WHERE source_url = $1', [repoUrl]);
      if (existing.rows.length > 0) continue;

      // New public star — ingest it
      const originalToken = process.env.GITHUB_TOKEN;
      process.env.GITHUB_TOKEN = token;
      try {
        await ingest({ content: repoUrl });
      } catch (err) {
        console.warn(`Auto-sync failed for ${repoUrl}:`, err);
      } finally {
        if (originalToken) process.env.GITHUB_TOKEN = originalToken;
        else delete process.env.GITHUB_TOKEN;
      }

      // Small delay between repos
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    await query(
      `INSERT INTO settings (key, value) VALUES ('github_sync_last_check', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [new Date().toISOString()],
    );
  } catch (err) {
    console.warn('Auto-sync check failed:', err);
  }
}

export async function startAutoSync(): Promise<void> {
  if (syncInterval) return;

  const enabledResult = await query(
    `SELECT value FROM settings WHERE key = 'github_sync_enabled'`,
  );
  if (enabledResult.rows[0]?.value !== 'true') return;

  const token = await getGitHubToken();
  if (!token) return;

  syncInterval = setInterval(() => {
    runSyncCheck().catch((err) => console.warn('Auto-sync error:', err));
  }, SYNC_INTERVAL_MS);

  // Run an immediate check
  runSyncCheck().catch((err) => console.warn('Auto-sync initial check error:', err));
}

export async function stopAutoSync(): Promise<void> {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

export async function enableAutoSync(): Promise<void> {
  await query(
    `INSERT INTO settings (key, value) VALUES ('github_sync_enabled', 'true')
     ON CONFLICT (key) DO UPDATE SET value = 'true'`,
  );
  await startAutoSync();
}

export async function disableAutoSync(): Promise<void> {
  await query(
    `INSERT INTO settings (key, value) VALUES ('github_sync_enabled', 'false')
     ON CONFLICT (key) DO UPDATE SET value = 'false'`,
  );
  await stopAutoSync();
}

export async function getSyncStatus(): Promise<{
  enabled: boolean;
  lastCheck?: string;
  nextCheck?: string;
}> {
  const enabledResult = await query(
    `SELECT value FROM settings WHERE key = 'github_sync_enabled'`,
  );
  const enabled = enabledResult.rows[0]?.value === 'true';

  const lastCheckResult = await query(
    `SELECT value FROM settings WHERE key = 'github_sync_last_check'`,
  );
  const lastCheck = lastCheckResult.rows[0]?.value || undefined;

  let nextCheck: string | undefined;
  if (enabled && lastCheck) {
    const next = new Date(new Date(lastCheck).getTime() + SYNC_INTERVAL_MS);
    nextCheck = next.toISOString();
  }

  return { enabled, lastCheck, nextCheck };
}
