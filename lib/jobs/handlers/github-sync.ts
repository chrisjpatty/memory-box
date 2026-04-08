import { query } from '../../db';
import { ingest } from '../../ingest';
import { githubFetch } from '../../pipeline/url-handlers/github';
import type { JobHandler } from '../types';

interface GitHubSyncPayload {
  username: string;
  token: string;
}

export const githubSyncHandler: JobHandler<GitHubSyncPayload> = {
  displayName: 'GitHub sync',
  exclusive: true,

  async process(payload, ctx) {
    const { username, token } = payload;

    const batch = await githubFetch(
      `/users/${username}/starred?per_page=30&sort=created&direction=desc`,
      token,
    );

    if (!Array.isArray(batch)) return;

    const publicRepos = batch.filter((repo: any) => !repo.private);
    await ctx.progress({ total: publicRepos.length });

    for (const repo of publicRepos) {
      if (await ctx.isCancelled()) return;

      const repoUrl = repo.html_url;
      await ctx.progress({ currentItem: repoUrl });

      // Quick dedup check
      const existing = await query('SELECT id FROM memories WHERE source_url = $1', [repoUrl]);
      if (existing.rows.length > 0) {
        await ctx.tickSkipped();
        continue;
      }

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
