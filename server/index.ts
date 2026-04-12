import { createApp } from './app';
import { initDatabase } from '../lib/db-init';
import { initJobSystem } from '../lib/jobs/init';
import { startCleanupJob } from '../lib/oauth';

const app = createApp();

await initDatabase();
initJobSystem();
startCleanupJob();

const port = parseInt(process.env.PORT || '80', 10);
console.log(`Memory Box server listening on port ${port}`);

export default { port, fetch: app.fetch };
