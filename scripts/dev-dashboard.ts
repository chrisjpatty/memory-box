/**
 * Standalone API server for dashboard development.
 *
 * Automatically starts a local PostgreSQL container if one isn't available.
 * No need to run `ast dev` separately — this script is self-contained.
 *
 * Usage:
 *   bun --watch scripts/dev-dashboard.ts
 *
 * Then in another terminal:
 *   cd dashboard && bun run dev
 *
 * Open http://localhost:5173
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';
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
import { chat } from '../ingestion/webhook/api/chat';
import { jobsApi } from '../ingestion/webhook/api/jobs';
import { initDatabase } from '../lib/db-init';
import { initJobSystem } from '../lib/jobs/init';

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

// Default env for local dev
process.env.POSTGRES_DB ??= 'memory_box';
process.env.POSTGRES_USER ??= 'postgres';
process.env.POSTGRES_PASSWORD ??= 'postgres';
process.env.ADMIN_PASSWORD ??= 'dev';

// MinIO defaults
process.env.MINIO_HOST = 'localhost';
process.env.MINIO_PORT = '9000';
process.env.MINIO_ROOT_USER = 'minioadmin';
process.env.MINIO_ROOT_PASSWORD = 'minioadmin';

// --- Ensure PostgreSQL is available ---

const PG_CONTAINER = 'memory-box-dev-postgres';
const PG_PORT = process.env.POSTGRES_PORT || '5432';

async function ensurePostgres(): Promise<void> {
  // If DATABASE_URL is explicitly set, trust it
  if (process.env.DATABASE_URL || process.env.DB_URL) {
    console.log('  Using DATABASE_URL from environment');
    return;
  }

  // Check if something is already listening on the postgres port
  try {
    const net = await import('net');
    await new Promise<void>((resolve, reject) => {
      const sock = net.createConnection({ host: '127.0.0.1', port: parseInt(PG_PORT) });
      sock.on('connect', () => { sock.destroy(); resolve(); });
      sock.on('error', reject);
      sock.setTimeout(1000, () => { sock.destroy(); reject(new Error('timeout')); });
    });
    process.env.POSTGRES_HOST = 'localhost';
    process.env.POSTGRES_PORT = PG_PORT;
    console.log(`  PostgreSQL already available on port ${PG_PORT}`);
    return;
  } catch {
    // Not available, start a container
  }

  // Check if container exists but is stopped
  try {
    const state = execSync(`docker inspect -f '{{.State.Running}}' ${PG_CONTAINER} 2>/dev/null`, { encoding: 'utf-8' }).trim();
    if (state === 'true') {
      console.log(`  PostgreSQL container '${PG_CONTAINER}' is running`);
      process.env.POSTGRES_HOST = 'localhost';
      process.env.POSTGRES_PORT = PG_PORT;
      return;
    }
    // Container exists but stopped — start it
    console.log(`  Starting existing PostgreSQL container '${PG_CONTAINER}'...`);
    execSync(`docker start ${PG_CONTAINER}`, { stdio: 'pipe' });
  } catch {
    // Container doesn't exist — create it
    console.log(`  Starting new PostgreSQL container '${PG_CONTAINER}'...`);
    const db = process.env.POSTGRES_DB;
    const user = process.env.POSTGRES_USER;
    const pass = process.env.POSTGRES_PASSWORD;
    execSync(
      `docker run -d --name ${PG_CONTAINER} ` +
      `-e POSTGRES_DB=${db} -e POSTGRES_USER=${user} -e POSTGRES_PASSWORD=${pass} ` +
      `-p ${PG_PORT}:5432 ` +
      `pgvector/pgvector:pg17 `,
      { stdio: 'pipe' },
    );
  }

  process.env.POSTGRES_HOST = 'localhost';
  process.env.POSTGRES_PORT = PG_PORT;

  // Wait for postgres to be ready
  console.log('  Waiting for PostgreSQL to be ready...');
  for (let i = 0; i < 30; i++) {
    try {
      execSync(`docker exec ${PG_CONTAINER} pg_isready -U ${process.env.POSTGRES_USER}`, { stdio: 'pipe' });
      console.log('  PostgreSQL is ready');
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error('PostgreSQL container failed to start');
}

await ensurePostgres();

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
app.route('/api/jobs', jobsApi);
app.route('/api/chat', chat);

// Initialize database and job system
await initDatabase();
initJobSystem();

const port = parseInt(process.env.PORT || '3002', 10);
console.log(`\n  Dashboard API server: http://localhost:${port}`);
console.log(`  Admin password: ${process.env.ADMIN_PASSWORD}`);
console.log(`\n  Now run: cd dashboard && bun run dev\n`);

export default { port, fetch: app.fetch };
