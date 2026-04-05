/**
 * Standalone API server for dashboard development.
 *
 * Run this alongside `ast dev` (for Docker services) and `cd dashboard && bun run dev`
 * (for the Vite React app). The Vite dev server proxies /api/* to this server.
 *
 * Usage:
 *   bun --watch scripts/dev-dashboard.ts
 *
 * Then in another terminal:
 *   cd dashboard && bun run dev
 *
 * Open http://localhost:5173/dashboard
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { validateSession } from '../ingestion/webhook/dashboard/session';
import { auth } from '../ingestion/webhook/api/auth';
import { token } from '../ingestion/webhook/api/token';
import { stats } from '../ingestion/webhook/api/stats';
import { memories } from '../ingestion/webhook/api/memories';
import { search } from '../ingestion/webhook/api/search';
import { ingestApi } from '../ingestion/webhook/api/ingest';
import { importApi } from '../ingestion/webhook/api/import';
import { startAutoSync } from '../lib/import/github-stars';

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

// Default env for local dev (Docker services on localhost)
process.env.REDIS_HOST ??= 'localhost';
process.env.REDIS_PORT ??= '6379';
process.env.NEO4J_HOST ??= 'localhost';
process.env.NEO4J_PORT ??= '7687';
process.env.QDRANT_HOST ??= 'localhost';
process.env.QDRANT_PORT ??= '6333';
process.env.ADMIN_PASSWORD ??= 'dev';

// MinIO in Docker uses its built-in defaults — force these for local dev
process.env.MINIO_HOST = 'localhost';
process.env.MINIO_PORT = '9000';
process.env.MINIO_ROOT_USER = 'minioadmin';
process.env.MINIO_ROOT_PASSWORD = 'minioadmin';

const app = new Hono();

// CORS for Vite dev server
app.use('*', cors({ origin: ['http://localhost:5173', 'http://localhost:5174'], credentials: true }));

// Auth routes (no session required)
app.route('/api/auth', auth);

// Session-protected API routes
app.use('/api/*', async (c, next) => {
  const authenticated = await validateSession(c);
  if (!authenticated) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});

app.route('/api/token', token);
app.route('/api/stats', stats);
app.route('/api/memories', memories);
app.route('/api/search', search);
app.route('/api/ingest', ingestApi);
app.route('/api/import', importApi);

// Initialize auto-sync if previously enabled
startAutoSync().catch(() => {});

const port = parseInt(process.env.PORT || '3002', 10);
console.log(`\n  Dashboard API server: http://localhost:${port}`);
console.log(`  Admin password: ${process.env.ADMIN_PASSWORD}`);
console.log(`\n  Now run: cd dashboard && bun run dev\n`);

export default { port, fetch: app.fetch };
