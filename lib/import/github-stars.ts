import { query } from '../db';
import { githubFetch, githubHeaders } from '../pipeline/url-handlers/github';
import { getGitHubToken } from './token-store';
import { startCronSync, stopCronSync, getCronSyncSchedule } from '../jobs/cron';

/** Parse GitHub Link header to find the "next" page URL. */
function parseLinkNext(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

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

  // Paginate through all starred repos using the Link header
  let allRepos: any[] = [];
  let privateExcluded = 0;
  let nextUrl: string | null =
    `https://api.github.com/users/${username}/starred?per_page=100`;

  while (nextUrl) {
    const res = await fetch(nextUrl, {
      headers: githubHeaders(resolvedToken),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) break;

    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;

    for (const repo of batch) {
      if (repo.private) {
        privateExcluded++;
      } else {
        allRepos.push(repo);
      }
    }

    nextUrl = parseLinkNext(res.headers.get('Link'));
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

// --- Auto-Sync (delegates to Bun.cron) ---

export async function enableAutoSync(): Promise<void> {
  await query(
    `INSERT INTO settings (key, value) VALUES ('github_sync_enabled', 'true')
     ON CONFLICT (key) DO UPDATE SET value = 'true'`,
  );
  startCronSync('github-sync');
}

export async function disableAutoSync(): Promise<void> {
  await query(
    `INSERT INTO settings (key, value) VALUES ('github_sync_enabled', 'false')
     ON CONFLICT (key) DO UPDATE SET value = 'false'`,
  );
  stopCronSync('github-sync');
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
  const schedule = getCronSyncSchedule('github-sync');
  if (enabled && schedule) {
    const next = Bun.cron.parse(schedule);
    if (next) nextCheck = next.toISOString();
  }

  return { enabled, lastCheck, nextCheck };
}
