import { readFileSync } from 'fs';
import { join } from 'path';
import { getPool } from './db';

/**
 * Initialize the database schema. Idempotent — safe to call on every startup.
 * Retries connection if Postgres isn't ready yet (common in Docker).
 */
export async function initDatabase(): Promise<void> {
  const schemaPath = join(import.meta.dir, 'db-schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  const pool = getPool();

  const maxRetries = 15;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await pool.query(schema);
      return;
    } catch (err: any) {
      if (attempt === maxRetries) throw err;
      const isConnectionError = err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === '57P03';
      if (!isConnectionError) throw err;
      console.log(`Waiting for database at ${err.address || 'unknown'}:${err.port || 'unknown'}... (attempt ${attempt}/${maxRetries})`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
