import { ingestTweet, TwitterRateLimitError } from '../../import/ingest-tweet';
import { getTwitterToken } from '../../import/twitter-token-store';
import type { JobHandler } from '../types';

interface TwitterImportPayload {
  tweets: string[];
  twitterToken?: string;
}

export const twitterImportHandler: JobHandler<TwitterImportPayload> = {
  displayName: 'Twitter bookmarks import',
  exclusive: true,

  async process(payload, ctx) {
    const { tweets } = payload;
    const resolvedToken =
      payload.twitterToken || (await getTwitterToken()) || undefined;
    // Twitter rate limits are stricter than GitHub, keep concurrency low
    const concurrency = 3;

    let cancelled = false;
    let nextIndex = 0;

    async function worker(): Promise<void> {
      while (!cancelled) {
        const i = nextIndex++;
        if (i >= tweets.length) break;

        if (await ctx.isCancelled()) {
          cancelled = true;
          return;
        }

        const tweetIdOrUrl = tweets[i];
        await ctx.progress({ currentItem: tweetIdOrUrl });

        try {
          const result = await ingestTweet(tweetIdOrUrl, resolvedToken);

          const entry = result.deduplicated
            ? {
                tweet: tweetIdOrUrl,
                status: 'skipped' as const,
                memoryId: result.existingMemoryId,
              }
            : {
                tweet: tweetIdOrUrl,
                status: 'imported' as const,
                memoryId: result.memoryId,
              };

          if (result.deduplicated) {
            await ctx.tickSkipped();
          } else {
            await ctx.tick();
          }

          await ctx.addResults([entry]);
        } catch (err: any) {
          if (err instanceof TwitterRateLimitError) {
            const waitMs =
              Math.max(0, err.resetAt * 1000 - Date.now()) + 1000;
            await ctx.progress({
              currentItem: `Rate limited — resuming in ${Math.ceil(waitMs / 1000)}s`,
            });
            await new Promise((resolve) => setTimeout(resolve, waitMs));
            nextIndex--; // Retry this tweet
            continue;
          }

          console.error(
            `Import failed for ${tweetIdOrUrl}:`,
            err.message,
            err.stack?.split('\n').slice(0, 3).join('\n'),
          );
          await ctx.tickFailed();
          await ctx.addResults([
            { tweet: tweetIdOrUrl, status: 'failed', error: err.message },
          ]);
        }
      }
    }

    try {
      await ctx.progress({ total: tweets.length });
      await Promise.all(
        Array.from({ length: Math.min(concurrency, tweets.length) }, () =>
          worker(),
        ),
      );
    } finally {
      // No env var manipulation needed — ingestTweet resolves token internally
    }
  },
};
