import { ingest } from '../../ingest';
import { getGitHubToken } from '../../import/token-store';
import { GitHubRateLimitError } from '../../pipeline/url-handlers/github';
import type { JobHandler, JobContext } from '../types';

interface GitHubImportPayload {
  repos: string[];
  githubToken?: string;
}

export const githubImportHandler: JobHandler<GitHubImportPayload> = {
  displayName: 'GitHub import',
  exclusive: true,

  async process(payload, ctx) {
    const { repos } = payload;
    const resolvedToken = payload.githubToken || await getGitHubToken() || undefined;
    const concurrency = resolvedToken ? 5 : 1;

    const originalToken = process.env.GITHUB_TOKEN;
    if (resolvedToken) process.env.GITHUB_TOKEN = resolvedToken;

    let cancelled = false;
    let nextIndex = 0;

    async function worker(): Promise<void> {
      while (!cancelled) {
        const i = nextIndex++;
        if (i >= repos.length) break;

        if (await ctx.isCancelled()) {
          cancelled = true;
          return;
        }

        const repoUrl = repos[i];
        await ctx.progress({ currentItem: repoUrl });

        try {
          const result = await ingest({ content: repoUrl });

          const entry = result.deduplicated
            ? { repo: repoUrl, status: 'skipped' as const, memoryId: result.existingMemoryId }
            : { repo: repoUrl, status: 'imported' as const, memoryId: result.memoryId };

          if (result.deduplicated) {
            await ctx.tickSkipped();
          } else {
            await ctx.tick();
          }

          await ctx.addResults([entry]);
        } catch (err: any) {
          if (err instanceof GitHubRateLimitError) {
            const waitMs = Math.max(0, err.resetAt * 1000 - Date.now()) + 1000;
            await ctx.progress({ currentItem: `Rate limited — resuming in ${Math.ceil(waitMs / 1000)}s` });
            await new Promise((resolve) => setTimeout(resolve, waitMs));
            nextIndex--;
            continue;
          }

          console.error(`Import failed for ${repoUrl}:`, err.message, err.stack?.split('\n').slice(0, 3).join('\n'));
          await ctx.tickFailed();
          await ctx.addResults([{ repo: repoUrl, status: 'failed', error: err.message }]);
        }
      }
    }

    try {
      await ctx.progress({ total: repos.length });
      await Promise.all(
        Array.from({ length: Math.min(concurrency, repos.length) }, () => worker()),
      );
    } finally {
      if (resolvedToken) {
        if (originalToken) process.env.GITHUB_TOKEN = originalToken;
        else delete process.env.GITHUB_TOKEN;
      }
    }
  },
};
