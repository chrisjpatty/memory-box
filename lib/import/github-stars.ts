import { query } from '../db';
import { githubFetch } from '../pipeline/url-handlers/github';
import { getGitHubToken } from './token-store';
import { startSchedule, stopSchedule, isScheduleRunning } from '../jobs/scheduler';

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

// --- Auto-Sync (delegates to job scheduler) ---

const SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export async function startAutoSync(): Promise<void> {
  await startSchedule('github-sync');
}

export async function stopAutoSync(): Promise<void> {
  await stopSchedule('github-sync');
}

export async function enableAutoSync(): Promise<void> {
  await query(
    `INSERT INTO settings (key, value) VALUES ('github_sync_enabled', 'true')
     ON CONFLICT (key) DO UPDATE SET value = 'true'`,
  );
  await startSchedule('github-sync');
}

export async function disableAutoSync(): Promise<void> {
  await query(
    `INSERT INTO settings (key, value) VALUES ('github_sync_enabled', 'false')
     ON CONFLICT (key) DO UPDATE SET value = 'false'`,
  );
  await stopSchedule('github-sync');
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
