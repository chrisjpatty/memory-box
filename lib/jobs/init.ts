import { query } from '../db';
import { getGitHubToken } from '../import/token-store';
import { registerJobType } from './registry';
import { registerSchedule, startSchedule } from './scheduler';
import { githubImportHandler } from './handlers/github-import';
import { reprocessHandler } from './handlers/reprocess';
import { githubSyncHandler } from './handlers/github-sync';
import { twitterImportHandler } from './handlers/twitter-import';

const SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export function initJobSystem(): void {
  registerJobType('github-import', githubImportHandler);
  registerJobType('reprocess', reprocessHandler);
  registerJobType('github-sync', githubSyncHandler);
  registerJobType('twitter-import', twitterImportHandler);

  // Register the auto-sync schedule
  registerSchedule({
    type: 'github-sync',
    intervalMs: SYNC_INTERVAL_MS,
    async shouldRun() {
      const enabledResult = await query(
        `SELECT value FROM settings WHERE key = 'github_sync_enabled'`,
      );
      if (enabledResult.rows[0]?.value !== 'true') return false;

      const token = await getGitHubToken();
      return !!token;
    },
    async payload() {
      const token = (await getGitHubToken())!;
      const usernameResult = await query(
        `SELECT value FROM settings WHERE key = 'github_sync_username'`,
      );
      const username = usernameResult.rows[0]?.value;
      if (!username) throw new Error('No GitHub sync username configured');
      return { username, token };
    },
  });

  // Start auto-sync if previously enabled
  startSchedule('github-sync').catch((err) =>
    console.warn('Auto-sync scheduler startup failed:', err),
  );
}
