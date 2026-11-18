import pg from 'pg';
import pgvector from 'pgvector/pg';

let pool: pg.Pool | null = null;
let typesRegistered = false;
let resolvedConfig: pg.PoolConfig | null = null;

type Credentials = Pick<pg.PoolConfig, 'host' | 'port' | 'database' | 'user' | 'password'>;

/** Credentials injected by the platform's postgres provider. */
function platformCredentials(): Credentials {
  return {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'memory_box',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
  };
}

/**
 * Credentials used by deployments created before the platform managed them.
 * Postgres only applies POSTGRES_USER/PASSWORD when it initializes a fresh
 * volume, so those existing volumes still only have this role.
 */
function legacyCredentials(): Credentials {
  return { ...platformCredentials(), database: 'memory_box', user: 'postgres', password: 'postgres' };
}

// invalid_password (also returned for a nonexistent role under scram auth)
// and invalid_authorization_specification ("role does not exist").
const AUTH_FAILURE_CODES = new Set(['28P01', '28000']);

export type CredentialProbe = (creds: Credentials) => Promise<void>;

async function probeCredentials(creds: Credentials): Promise<void> {
  const client = new pg.Client(creds);
  try {
    await client.connect();
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * Pick the credentials to connect with: the platform's first, then the legacy
 * ones if Postgres rejects the platform login. Connection errors (database not
 * up yet) are rethrown so the caller's retry loop handles them.
 */
export async function resolveCredentials(probe: CredentialProbe = probeCredentials): Promise<Credentials> {
  const primary = platformCredentials();
  try {
    await probe(primary);
    return primary;
  } catch (err: any) {
    const legacy = legacyCredentials();
    const sameAsLegacy = primary.user === legacy.user && primary.password === legacy.password && primary.database === legacy.database;
    if (!AUTH_FAILURE_CODES.has(err?.code) || sameAsLegacy) throw err;

    try {
      await probe(legacy);
    } catch {
      throw err; // report the platform-credential failure, it's the expected path
    }
    console.warn(
      `[db] Platform credentials for user "${primary.user}" were rejected; connected with the legacy "postgres" role. ` +
        'This database volume predates platform-managed credentials.',
    );
    return legacy;
  }
}

/**
 * Resolve credentials once and use them for the shared pool. Call at startup
 * before any queries (initDatabase does this).
 */
export async function connectDatabase(probe?: CredentialProbe): Promise<void> {
  if (resolvedConfig) return;
  const creds = await resolveCredentials(probe);
  resolvedConfig = { ...creds, max: 10 };
}

/** Connection config for other clients (e.g. Mastra's PostgresStore). */
export function getConnectionConfig(): pg.PoolConfig {
  return resolvedConfig ?? { ...platformCredentials(), max: 10 };
}

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool(getConnectionConfig());
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
