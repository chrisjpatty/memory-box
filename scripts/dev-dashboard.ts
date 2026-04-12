/**
 * Local API server for dashboard development with hot reload.
 *
 * Requires `ast dev` to be running (provides Postgres, MinIO, Ollama).
 * This script runs the server outside the Docker container so code
 * changes are picked up immediately via bun --watch.
 *
 * Usage:
 *   ast dev              # start infrastructure in one terminal
 *   bun run dev:dashboard # start this server in another terminal
 *   cd dashboard && bun run dev  # start Vite in a third terminal
 *
 * Open http://localhost:5173
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createApp } from '../server/app';
import { initDatabase } from '../lib/db-init';
import { initJobSystem } from '../lib/jobs/init';
import { startCleanupJob } from '../lib/oauth';

// Load secrets from ast project config
try {
  const configPath = join(homedir(), '.ast', 'project-configs.json');
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  const projects = config.projects || {};
  for (const key of Object.keys(projects)) {
    if (key.toLowerCase().includes('memory-box')) {
      const vars = projects[key].vars || {};
      for (const [k, v] of Object.entries(vars)) {
        if (v && !process.env[k]) process.env[k] = v as string;
      }
      break;
    }
  }
} catch { /* config not found, rely on manual env */ }

// Host defaults — assumes ast dev is running and exposing services on localhost.
process.env.POSTGRES_HOST ??= 'localhost';
process.env.MINIO_HOST ??= 'localhost';

const app = createApp({
  corsOrigins: ['http://localhost:5173', 'http://localhost:5174'],
  skipStatic: true,
});

await initDatabase();
initJobSystem();
startCleanupJob();

const port = parseInt(process.env.PORT || '3002', 10);
console.log(`\n  Dashboard API server: http://localhost:${port}`);
console.log(`  Requires ast dev to be running for Postgres/MinIO/Ollama`);
console.log(`\n  Now run: cd dashboard && bun run dev\n`);

export default { port, fetch: app.fetch };
