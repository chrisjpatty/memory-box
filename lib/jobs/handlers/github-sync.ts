import { query } from '../../db';
import { ingest } from '../../ingest';
import { githubFetch } from '../../pipeline/url-handlers/github';
import type { JobHandler } from '../types';

export interface NewStarredRepo {
  url: string;
  repo: any;
}

interface GitHubSyncPayload {
  username: string;
  token: string;
  newRepos?: NewStarredRepo[];
}

/**
 * Lightweight pre-check: fetches recent starred repos and returns only
 * those not yet imported. Used by the cron tick to decide whether a
 * full job is needed.
 */
export async function findNewStarredRepos(username: string, token: string): Promise<NewStarredRepo[]> {
  let batch: any;
  try {
    batch = await githubFetch(
      `/users/${username}/starred?per_page=30&sort=created&direction=desc`,
      token,
    );
  } catch (err) {
    throw new Error(`Failed to fetch starred repos for ${username}: ${(err as Error).message}`);
  }

  if (!Array.isArray(batch)) {
    throw new Error(`GitHub API returned unexpected response for ${username}'s stars`);
  }

  const publicRepos = batch.filter((repo: any) => !repo.private);
  if (publicRepos.length === 0) return [];

  const urls = publicRepos.map((r: any) => r.html_url);
  const existing = await query(
    'SELECT source_url FROM memories WHERE source_url = ANY($1)',
    [urls],
  );
  const importedUrls = new Set(existing.rows.map((r: any) => r.source_url));

  return publicRepos
    .filter((repo: any) => !importedUrls.has(repo.html_url))
    .map((repo: any) => ({ url: repo.html_url, repo }));
}

export const githubSyncHandler: JobHandler<GitHubSyncPayload> = {
  displayName: 'GitHub sync',
  exclusive: true,

  async process(payload, ctx) {
    const { username, token } = payload;

    // Use pre-filtered repos if provided (cron path), otherwise fetch + dedup (manual path)
    const repos = payload.newRepos ?? await findNewStarredRepos(username, token);
    await ctx.progress({ total: repos.length });

    for (const { url: repoUrl } of repos) {
      if (await ctx.isCancelled()) return;

      await ctx.progress({ currentItem: repoUrl });

      const originalToken = process.env.GITHUB_TOKEN;
      process.env.GITHUB_TOKEN = token;
      try {
        await ingest({ content: repoUrl });
        await ctx.tick();
      } catch (err) {
        console.warn(`Auto-sync failed for ${repoUrl}:`, err);
        await ctx.tickFailed();
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
  },
};
