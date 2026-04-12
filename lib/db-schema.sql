-- Memory Box database schema (PostgreSQL + pgvector)

CREATE EXTENSION IF NOT EXISTS vector;

-- Core memories table
CREATE TABLE IF NOT EXISTS memories (
  id                TEXT PRIMARY KEY,
  content_type      TEXT NOT NULL,
  title             TEXT NOT NULL,
  tags              TEXT[] NOT NULL DEFAULT '{}',
  category          TEXT NOT NULL DEFAULT '',
  summary           TEXT DEFAULT '',
  raw_content       TEXT DEFAULT '',
  processed_content TEXT DEFAULT '',
  search_content    TEXT DEFAULT '',
  markdown          TEXT,
  source_url        TEXT,
  content_hash      TEXT,
  file_key          TEXT,
  mime_type         TEXT,
  has_html          BOOLEAN DEFAULT FALSE,
  metadata          JSONB DEFAULT '{}',
  search_vector     TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(search_content, '')), 'C')
  ) STORED,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS memories_updated_at ON memories;
CREATE TRIGGER memories_updated_at
  BEFORE UPDATE ON memories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Dedup constraints (partial unique indexes allow NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_content_hash ON memories (content_hash) WHERE content_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_source_url ON memories (source_url) WHERE source_url IS NOT NULL;

-- Search indexes
CREATE INDEX IF NOT EXISTS idx_memories_search ON memories USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_memories_tags ON memories USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_memories_category ON memories (category);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories (content_type);
CREATE INDEX IF NOT EXISTS idx_memories_created ON memories (created_at DESC);

-- Vector chunks
CREATE TABLE IF NOT EXISTS memory_chunks (
  id          SERIAL PRIMARY KEY,
  memory_id   TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  text        TEXT NOT NULL,
  embedding   VECTOR(768),
  UNIQUE (memory_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON memory_chunks USING hnsw (embedding vector_cosine_ops);

-- Auth tokens (bearer tokens for API ingestion)
CREATE TABLE IF NOT EXISTS auth_tokens (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT 'default',
  token_hash  TEXT NOT NULL UNIQUE,
  hint        TEXT,
  active      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Migration: add name column if it doesn't exist (for existing databases)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'auth_tokens' AND column_name = 'name'
  ) THEN
    ALTER TABLE auth_tokens ADD COLUMN name TEXT NOT NULL DEFAULT 'default';
  END IF;
END $$;

-- Dashboard sessions
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);

-- Background jobs (import, reprocess)
CREATE TABLE IF NOT EXISTS jobs (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'running',
  total         INT DEFAULT 0,
  completed     INT DEFAULT 0,
  skipped       INT DEFAULT 0,
  failed        INT DEFAULT 0,
  current_item  TEXT DEFAULT '',
  results       JSONB DEFAULT '[]',
  error         TEXT,
  started_at    TIMESTAMPTZ DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

-- Job system: add payload and parent_job_id columns
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS parent_job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL;

-- Migrate legacy type names
UPDATE jobs SET type = 'github-import' WHERE type = 'import';

-- Job lookup indexes
CREATE INDEX IF NOT EXISTS idx_jobs_type_status ON jobs (type, status);
CREATE INDEX IF NOT EXISTS idx_jobs_parent ON jobs (parent_job_id) WHERE parent_job_id IS NOT NULL;

-- Chat conversations
CREATE TABLE IF NOT EXISTS conversations (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT 'New conversation',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS conversations_updated_at ON conversations;
CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations (updated_at DESC);

-- Key-value settings (GitHub token, sync config)
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- OAuth 2.1 Dynamic Client Registration (RFC 7591)
CREATE TABLE IF NOT EXISTS oauth_clients (
  id              TEXT PRIMARY KEY,
  client_name     TEXT NOT NULL,
  redirect_uris   JSONB NOT NULL DEFAULT '[]',
  grant_types     JSONB NOT NULL DEFAULT '["authorization_code"]',
  response_types  JSONB NOT NULL DEFAULT '["code"]',
  token_endpoint_auth_method TEXT NOT NULL DEFAULT 'none',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  created_by_ip   TEXT
);

-- OAuth authorization codes (short-lived, PKCE-protected)
CREATE TABLE IF NOT EXISTS oauth_auth_codes (
  code_hash        TEXT PRIMARY KEY,
  client_id        TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  redirect_uri     TEXT NOT NULL,
  code_challenge   TEXT NOT NULL,
  scope            TEXT NOT NULL DEFAULT '',
  expires_at       TIMESTAMPTZ NOT NULL,
  used             BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- OAuth refresh tokens
CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
  token_hash       TEXT PRIMARY KEY,
  client_id        TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  auth_token_id    INTEGER NOT NULL REFERENCES auth_tokens(id) ON DELETE CASCADE,
  scope            TEXT NOT NULL DEFAULT '',
  expires_at       TIMESTAMPTZ NOT NULL,
  revoked          BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
