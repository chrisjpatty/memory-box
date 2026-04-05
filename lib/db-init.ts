import { readFileSync } from 'fs';
import { join } from 'path';
import { getPool } from './db';

/**
 * Initialize the database schema. Idempotent — safe to call on every startup.
 * Reads and executes db-schema.sql which uses IF NOT EXISTS throughout.
 */
export async function initDatabase(): Promise<void> {
  const schemaPath = join(import.meta.dir, 'db-schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  const pool = getPool();
  await pool.query(schema);
}
