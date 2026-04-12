import pg from 'pg';
import pgvector from 'pgvector/pg';

let pool: pg.Pool | null = null;
let typesRegistered = false;

function resolveConnectionConfig(): pg.PoolConfig {
  const host = process.env.POSTGRES_HOST || 'localhost';
  const port = parseInt(process.env.POSTGRES_PORT || '5432');
  return {
    host,
    port,
    database: 'memory_box',
    user: 'postgres',
    password: 'postgres',
    max: 10,
  };
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
