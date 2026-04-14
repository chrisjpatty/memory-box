import { query } from '../../db';
import { getGitHubToken } from '../../import/token-store';
import { findNewStarredRepos } from '../handlers/github-sync';
import type { CronSync } from '../cron';

export const githubSync: CronSync = {
  name: 'github-sync',
  schedule: '*/15 * * * *',
  enabledKey: 'github_sync_enabled',
  lastCheckKey: 'github_sync_last_check',

  async canRun() {
    const token = await getGitHubToken();
    if (!token) return false;

    const result = await query(
      `SELECT value FROM settings WHERE key = 'github_sync_username'`,
    );
    return !!result.rows[0]?.value;
  },

  async findNew() {
    const token = (await getGitHubToken())!;
    const result = await query(
      `SELECT value FROM settings WHERE key = 'github_sync_username'`,
    );
    const username = result.rows[0]?.value;
    if (!username) return [];

    return findNewStarredRepos(username, token);
  },

  async buildPayload(items) {
    const token = (await getGitHubToken())!;
    const result = await query(
      `SELECT value FROM settings WHERE key = 'github_sync_username'`,
    );
    return { username: result.rows[0]?.value, token, newRepos: items };
  },
};
