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
  token_hash  TEXT NOT NULL UNIQUE,
  hint        TEXT,
  active      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

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

-- Key-value settings (GitHub token, sync config)
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
