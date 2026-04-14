import { registerJobType } from './registry';
import { recoverStaleJobs } from './runner';
import { registerCronSync, startCronSync } from './cron';
import { githubImportHandler } from './handlers/github-import';
import { reprocessHandler } from './handlers/reprocess';
import { githubSyncHandler } from './handlers/github-sync';
import { twitterImportHandler } from './handlers/twitter-import';
import { githubSync } from './syncs/github';

export function initJobSystem(): void {
  // Register job handlers
  registerJobType('github-import', githubImportHandler);
  registerJobType('reprocess', reprocessHandler);
  registerJobType('github-sync', githubSyncHandler);
  registerJobType('twitter-import', twitterImportHandler);

  // Register cron-based syncs
  registerCronSync(githubSync);

  // Recover any orphaned jobs from a previous server instance, then start syncs
  recoverStaleJobs()
    .then(() => startCronSync('github-sync'))
    .catch((err) => console.warn('Job system startup failed:', err));
}
