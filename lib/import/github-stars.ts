import { nanoid } from 'nanoid';
import { getRedis } from '../clients';
import { ingest } from '../ingest';
import { githubFetch, GitHubRateLimitError } from '../pipelines/url-handlers/github';
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
 * and check which are already imported via dedup keys.
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

  // Check dedup for each public repo
  const redis = getRedis();
  const repos: StarredRepo[] = [];

  for (const repo of allRepos) {
    const repoUrl = repo.html_url;
    const dedupKey = `url-dedup:${repoUrl}`;
    const existingId = await redis.get(dedupKey);

    let alreadyImported = false;
    let existingMemoryId: string | undefined;

    if (existingId) {
      // Verify the memory still exists
      const memoryData = await redis.get(`memory:${existingId}`);
      if (memoryData) {
        alreadyImported = true;
        existingMemoryId = existingId;
      }
    }

    repos.push({
      url: repoUrl,
      fullName: repo.full_name,
      description: repo.description || '',
      stars: repo.stargazers_count || 0,
      language: repo.language || null,
      alreadyImported,
      existingMemoryId,
    });
  }

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
 * Updates Redis job state after each repo so SSE can stream progress.
 */
export async function processImportJob(
  jobId: string,
  repos: string[],
  githubToken?: string,
): Promise<void> {
  const redis = getRedis();
  const hasToken = !!githubToken;
  const delayMs = hasToken ? 200 : 3000;

  for (let i = 0; i < repos.length; i++) {
    // Check for cancellation
    const status = await redis.hget(`import-job:${jobId}`, 'status');
    if (status === 'cancelled') {
      await redis.hset(`import-job:${jobId}`, 'completedAt', new Date().toISOString());
      return;
    }

    const repoUrl = repos[i];
    await redis.hset(`import-job:${jobId}`, 'currentRepo', repoUrl);

    // Temporarily set the GitHub token for the ingest pipeline
    const originalToken = process.env.GITHUB_TOKEN;
    if (githubToken) process.env.GITHUB_TOKEN = githubToken;

    try {
      const result = await ingest({ content: repoUrl });

      const entry: ImportJobResult = result.deduplicated
        ? { repo: repoUrl, status: 'skipped', memoryId: result.existingMemoryId }
        : { repo: repoUrl, status: 'imported', memoryId: result.memoryId };

      await redis.hincrby(`import-job:${jobId}`, 'completed', 1);
      if (result.deduplicated) {
        await redis.hincrby(`import-job:${jobId}`, 'skipped', 1);
      }

      // Append result
      const existingResults = JSON.parse(await redis.hget(`import-job:${jobId}`, 'results') || '[]');
      existingResults.push(entry);
      await redis.hset(`import-job:${jobId}`, 'results', JSON.stringify(existingResults));

    } catch (err: any) {
      // Handle rate limiting: wait and retry this repo
      if (err instanceof GitHubRateLimitError) {
        const waitMs = Math.max(0, err.resetAt * 1000 - Date.now()) + 1000;
        await redis.hset(`import-job:${jobId}`, 'currentRepo', `Rate limited — resuming in ${Math.ceil(waitMs / 1000)}s`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        i--; // Retry this repo
        continue;
      }

      console.error(`Import failed for ${repoUrl}:`, err.message, err.stack?.split('\n').slice(0, 3).join('\n'));

      await redis.hincrby(`import-job:${jobId}`, 'completed', 1);
      await redis.hincrby(`import-job:${jobId}`, 'failed', 1);

      const existingResults = JSON.parse(await redis.hget(`import-job:${jobId}`, 'results') || '[]');
      existingResults.push({ repo: repoUrl, status: 'failed', error: err.message });
      await redis.hset(`import-job:${jobId}`, 'results', JSON.stringify(existingResults));
    } finally {
      // Restore original token
      if (githubToken) {
        if (originalToken) process.env.GITHUB_TOKEN = originalToken;
        else delete process.env.GITHUB_TOKEN;
      }
    }

    // Rate limit courtesy delay
    if (i < repos.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // Mark complete
  await redis.hset(`import-job:${jobId}`, {
    status: 'completed',
    completedAt: new Date().toISOString(),
    currentRepo: '',
  });
  await redis.del('active-import-job');
}

/**
 * Create a new import job and start processing in the background.
 * Returns the jobId. Throws if an import is already running.
 */
export async function startImportJob(repos: string[], token?: string): Promise<string> {
  const redis = getRedis();
  const resolvedToken = token || await getGitHubToken() || undefined;

  // Enforce single import at a time
  const activeJob = await redis.get('active-import-job');
  if (activeJob) {
    // Check if it's actually still running
    const activeStatus = await redis.hget(`import-job:${activeJob}`, 'status');
    if (activeStatus === 'running') {
      throw new Error('An import is already in progress');
    }
    // Stale key — clean up
    await redis.del('active-import-job');
  }

  const jobId = nanoid(21);

  await redis.hset(`import-job:${jobId}`, {
    status: 'running',
    total: String(repos.length),
    completed: '0',
    skipped: '0',
    failed: '0',
    currentRepo: '',
    results: '[]',
    startedAt: new Date().toISOString(),
  });
  await redis.expire(`import-job:${jobId}`, 86400); // 24hr TTL
  await redis.set('active-import-job', jobId, 'EX', 86400);

  // Fire and forget
  processImportJob(jobId, repos, resolvedToken).catch(async (err) => {
    console.error('Import job failed:', err);
    await redis.hset(`import-job:${jobId}`, {
      status: 'failed',
      error: err.message,
      completedAt: new Date().toISOString(),
    });
    await redis.del('active-import-job');
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

  const redis = getRedis();
  const username = await redis.get('github-sync:username');
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
      const dedupKey = `url-dedup:${repoUrl}`;
      const existing = await redis.get(dedupKey);
      if (existing) {
        const memoryExists = await redis.get(`memory:${existing}`);
        if (memoryExists) continue;
      }

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

    await redis.set('github-sync:lastCheck', new Date().toISOString());
  } catch (err) {
    console.warn('Auto-sync check failed:', err);
  }
}

export async function startAutoSync(): Promise<void> {
  if (syncInterval) return;

  const redis = getRedis();
  const enabled = await redis.get('github-sync:enabled');
  if (enabled !== 'true') return;

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
  const redis = getRedis();
  await redis.set('github-sync:enabled', 'true');
  await startAutoSync();
}

export async function disableAutoSync(): Promise<void> {
  const redis = getRedis();
  await redis.set('github-sync:enabled', 'false');
  await stopAutoSync();
}

export async function getSyncStatus(): Promise<{
  enabled: boolean;
  lastCheck?: string;
  nextCheck?: string;
}> {
  const redis = getRedis();
  const enabled = (await redis.get('github-sync:enabled')) === 'true';
  const lastCheck = await redis.get('github-sync:lastCheck') || undefined;

  let nextCheck: string | undefined;
  if (enabled && lastCheck) {
    const next = new Date(new Date(lastCheck).getTime() + SYNC_INTERVAL_MS);
    nextCheck = next.toISOString();
  }

  return { enabled, lastCheck, nextCheck };
}
