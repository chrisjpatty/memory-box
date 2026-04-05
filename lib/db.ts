import pg from 'pg';
import pgvector from 'pgvector/pg';

let pool: pg.Pool | null = null;
let typesRegistered = false;

function resolveConnectionConfig(): pg.PoolConfig {
  // Check for explicit connection string first
  if (process.env.DATABASE_URL || process.env.DB_URL) {
    return { connectionString: (process.env.DATABASE_URL || process.env.DB_URL)!, max: 10 };
  }
  // Astropods custom knowledge containers are accessible by service name on the Docker network.
  // The "db" entry in astropods.yml becomes "knowledge-db" as the Docker service name.
  // Astropods injects POSTGRES_HOST/POSTGRES_PORT for the postgres provider.
  const host = process.env.POSTGRES_HOST || process.env.DB_HOST || '127.0.0.1';
  const port = parseInt(process.env.DB_PORT || process.env.POSTGRES_PORT || '5432');
  const database = process.env.POSTGRES_DB || 'memory_box';
  const user = process.env.POSTGRES_USER || 'postgres';
  const password = process.env.POSTGRES_PASSWORD || 'postgres';
  return { host, port, database, user, password, max: 10 };
}

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool(resolveConnectionConfig());
  }
  return pool;
}

async function ensureVectorTypes(): Promise<void> {
  if (typesRegistered) return;
  const client = await getPool().connect();
  try {
    await pgvector.registerTypes(client);
  } finally {
    client.release();
  }
  typesRegistered = true;
}

/**
 * Execute a parameterized query against the pool.
 * Automatically registers pgvector types on first call.
 */
export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[],
): Promise<pg.QueryResult<T>> {
  await ensureVectorTypes();
  return getPool().query<T>(text, params);
}

/**
 * Get a client from the pool for transaction use.
 * Caller must release the client when done.
 */
export async function getClient(): Promise<pg.PoolClient> {
  await ensureVectorTypes();
  return getPool().connect();
}
