import { createApp } from './app';
import { initDatabase } from '../lib/db-init';
import { initJobSystem } from '../lib/jobs/init';
import { startCleanupJob } from '../lib/oauth';
import { maybeResetPasswordFromEnv } from '../lib/auth';

const app = createApp();

await initDatabase();
await maybeResetPasswordFromEnv();
initJobSystem();
startCleanupJob();

const port = parseInt(process.env.PORT || '80', 10);
console.log(`Memory Box server listening on port ${port}`);

// Bun closes connections that send nothing for idleTimeout seconds (default
// 10), which cut off slow requests like ingest. Chat streams also send
// heartbeats (lib/chat-runs.ts).
export default { port, fetch: app.fetch, idleTimeout: 120 };
