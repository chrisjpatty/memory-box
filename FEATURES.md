# Memory Box - Feature Map

A personal knowledge ingestion service: dump anything into it (text, URLs, images, PDFs, files) and it gets classified, chunked, embedded, and stored across a multi-database backend for hybrid semantic + keyword search.

---

## 1. Content Ingestion

The core pipeline. Accepts content, detects its type, deduplicates, classifies via AI, then routes through a type-specific pipeline that chunks, embeds, and stores it across all databases.

### 1.1 Content Type Detection
- **Deterministic detection** from string content: URLs (http/https), PDFs (data:application/pdf;base64), images (data:image/)
- **Magic byte detection** from file buffers: PDF (%PDF), PNG, JPEG, GIF, WebP
- **MIME type fallback** from upload metadata
- **Classifier fallback**: if no deterministic match, Haiku classifies the content type

### 1.2 AI Classification (Haiku)
- Generates: title, 3-7 tags, category, summary, structured metadata
- Merges user-provided title/tags with AI-generated ones
- Categories: note, article, bookmark, recipe, reference, reminder, quote, contact, idea, document, report, code, etc.
- **Fallback**: simple heuristic classifier if the Haiku agent fails

### 1.3 Deduplication
- **Content hash**: SHA-256 of raw content, stored as `content-hash:{hash}` -> memoryId
- **URL dedup**: `url-dedup:{url}` -> memoryId (for URL content)
- **Stale key cleanup**: verifies the referenced memory still exists; removes orphaned dedup keys
- **Deletion cleanup**: SCAN-based removal of all dedup keys pointing to a deleted memory
- TTL: 365 days (matches memory metadata)

### 1.4 Text Pipeline
- **Content-aware chunking strategy detection**:
  - Markdown (2+ headings) -> markdown chunker, 4096 chars, 200 overlap
  - HTML (3+ structural tags) -> html chunker, 4096 chars, 200 overlap
  - Code (3+ code signals) -> recursive chunker, 4096 chars, 200 overlap
  - Plain text (default) -> recursive chunker, 2048 chars, 100 overlap
- **Oversized chunk splitting**: re-splits at sentence/word boundaries if >4000 chars
- **Embedding**: Ollama nomic-embed-text, batches of 32
- **Storage**: Qdrant (vectors + per-chunk metadata), Redis (memory metadata, 365-day TTL), Neo4j (Memory/Tag/Category nodes + relationships)

### 1.5 URL Pipeline
- **Site-specific handlers**: GitHub repos get rich metadata extraction (stars, language, README, topics)
- **Jina Reader**: fetches JS-rendered pages as clean markdown (30s timeout)
- **Static fallback**: raw HTML fetch + cheerio parse + turndown conversion (15s timeout)
- **HTML processing**: resolves relative URLs in DOM, strips scripts, preserves styles
- **HTML snapshot**: stores cleaned HTML in MinIO for iframe rendering
- **Markdown post-processing**: resolves relative URLs in converted markdown
- **Domain tag**: auto-adds the URL's domain as a tag
- Then routes through the text pipeline for chunking/embedding

### 1.6 Image Pipeline
- **Vision analysis**: Claude Sonnet generates detailed image description
- **Image resizing**: sharp resizes to max 1024px, converts to JPEG at 85% quality for Vision API
- **Storage**: original full-res image stored in MinIO
- **Searchability**: the AI description is embedded/chunked through the text pipeline
- **MIME detection**: magic byte detection for PNG, JPEG, GIF, WebP

### 1.7 PDF Pipeline
- **Text extraction**: pdf-parse extracts text from all pages
- **Re-classification**: runs the extracted text through the Haiku classifier for better metadata
- **Page count + PDF title** extracted from PDF metadata
- **Storage**: original PDF stored in MinIO
- Then routes through the text pipeline for chunking/embedding

### 1.8 File Upload Pipeline
- **Multipart form upload** via `/ingest/upload`
- Routes to PDF, image, or generic text pipeline based on detected type
- Generic files: decoded as UTF-8 text, classified, ingested as text with contentType='file'

### 1.9 Batch Ingestion
- `POST /ingest/batch` accepts an array of items
- Processes all in parallel via `Promise.allSettled`
- Returns per-item success/error results

---

## 2. Search

### 2.1 Hybrid Search (Vector + Keyword)
- **Vector search** (Qdrant): embeds query via Ollama, fetches 3x topK, deduplicates by memoryId
- **Keyword search** (Neo4j fulltext): Lucene-based fuzzy query on title, summary, searchContent (10K chars)
- **Reciprocal Rank Fusion** (k=60): merges both ranked lists, items in both get boosted scores
- Both searches run in parallel
- Returns: memoryId, title, contentType, snippet, summary, score, tags, category, createdAt, source

### 2.2 Fulltext Index
- Neo4j fulltext index `memory_fulltext` on Memory nodes: title, summary, searchContent
- Auto-created on first search; creation is idempotent
- Lucene special chars escaped; terms get fuzzy matching (~)

---

## 3. Knowledge Graph (Neo4j)

### 3.1 Data Model
- **Memory** nodes: id, title, contentType, category, createdAt, summary, searchContent
- **Tag** nodes: name
- **Category** nodes: name
- **Relationships**: Memory -[:TAGGED]-> Tag, Memory -[:CATEGORIZED]-> Category

### 3.2 Graph Queries (Agent Tool)
- **related-memories**: finds memories sharing tags with a given memory, ranked by overlap count
- **tag-co-occurrence**: tags that frequently appear alongside a given tag
- **top-tags**: most-used tags across all memories
- **top-categories**: most-used categories
- **tags-for-category**: tags within a specific category
- **recent-activity**: most recently saved memories with tags
- **memory-connections**: full connection graph for a single memory (tags, categories, related memories)

---

## 4. Memory Management

### 4.1 CRUD Operations
- **Create**: via ingestion pipeline (no direct create)
- **Read single**: from Redis cache (full metadata including rawContent, processedContent, markdown)
- **List**: from Neo4j with filters (contentType, category, tag) + pagination (skip/limit)
- **Delete**: removes from all 4 stores (Qdrant vectors, Redis metadata, Neo4j nodes, MinIO files) + dedup key cleanup

### 4.2 File Serving
- **HTML snapshots**: served with CSP headers (no scripts, inline styles allowed) for safe iframe rendering
- **Images/files**: served from MinIO via Redis fileKey lookup
- Both cached with immutable Cache-Control headers (1 year)

### 4.3 Stats
- Memory count, tag count, category count (from Neo4j)

---

## 5. GitHub Stars Import

### 5.1 Discovery
- Fetches all starred repos for a username (paginated, 100/page)
- Filters out private repos
- Checks dedup keys to identify already-imported repos
- Returns: repo list with metadata (stars, language, description) + import status + rate limit info

### 5.2 Import Jobs
- Creates a background job, processes repos sequentially
- Rate limit courtesy delay: 200ms with token, 3s without
- Handles GitHub rate limiting: waits until reset + retries
- Single-concurrency enforcement (one active job at a time)
- Job state tracked in Redis HSET: status, total, completed, skipped, failed, currentRepo, results
- Cancellable via status flag check between repos
- 24-hour job TTL

### 5.3 Auto-Sync
- Polls every 15 minutes for new starred repos (30 most recent)
- Only ingests new public repos not already imported
- Enable/disable via API
- Persists enabled state in Redis; auto-restarts on server startup
- Requires saved GitHub token

### 5.4 GitHub Token Management
- Stored encrypted in Redis
- Validates against GitHub API on save (returns username)
- Token hint stored for UI display
- Revocation removes token and disables auto-sync

---

## 6. Reprocessing

- Re-chunks and re-embeds all existing memories with current model/settings
- Deletes and recreates the Qdrant index from scratch
- Uses content from Redis (markdown > rawContent > processedContent > summary)
- Content-aware re-chunking (markdown vs recursive)
- Background job with same tracking pattern as imports
- Cancellable, single-concurrency

---

## 7. Authentication & Security

### 7.1 Bearer Token (API Ingestion)
- 48-char nanoid, SHA-256 hashed before storage
- Timing-safe validation via constant-time comparison
- Token hint: first 8 + last 4 chars
- Generate (fails if one exists), rotate (revoke + generate), validate

### 7.2 Session Auth (Dashboard)
- Cookie-based: `mb_session={sessionId}`, HttpOnly, SameSite=Lax
- 24-hour TTL, server-side in Redis
- Password stored as bcrypt hash in PostgreSQL `settings` table
- First-run setup flow prompts user to create a password
- Change password available in Settings

### 7.3 Rate Limiting
- Login: 5 attempts per IP, 5-minute lockout

### 7.4 Content Security
- HTML snapshots served with restrictive CSP (no scripts, no frames)
- MinIO isolated (no direct external access)

---

## 8. Chat Agent (Mastra/Claude Opus)

### 8.1 Agent Tools
- **store-memory**: ingest content (text/URL/image/base64)
- **search-memories**: hybrid semantic + keyword search
- **get-memory**: fetch full metadata by ID
- **list-memories**: browse with filters (contentType, category, tag, limit, skip)
- **delete-memory**: remove from all stores
- **graph-query**: explore knowledge graph (7 query types)

### 8.2 Agent Config
- Model: Claude Opus
- Memory: LibSQL (in-memory, for conversation state)
- Deployed via Astropods adapter

---

## 9. Dashboard (React SPA)

- Login page with admin password
- Token generation/rotation UI
- Memory browsing with filters + pagination
- Search interface
- Memory detail view (markdown, HTML iframe, image preview)
- Memory deletion
- GitHub stars discovery + import UI with progress tracking
- Reprocessing trigger + progress tracking
- Stats overview
- Built with React + Vite + Tailwind CSS
- Served as static files from the ingestion API

---

## 10. Infrastructure

### 10.1 Databases
- **Qdrant** (port 6333): vector store, `memories` collection
- **Redis** (port 6379): cache, sessions, dedup keys, job state, auth tokens
- **Neo4j** (port 7687): knowledge graph, fulltext search
- **MinIO** (port 9000): S3-compatible file storage, `memories` bucket
- **Ollama** (port 11434): local embedding model (nomic-embed-text)

### 10.2 Services
- **Agent** (port 3000): Mastra agent via Astropods
- **Ingestion/Dashboard API** (port 3001): Hono HTTP server

### 10.3 Deployment
- Astropods platform with Docker containers
- Config: `astropods.yml`
- Secrets: ANTHROPIC_API_KEY

### 10.4 Observability
- OpenTelemetry tracing via @mastra/observability
- Exports to configurable OTLP endpoint

---

## Database Interaction Summary

| Store | Purpose | Data |
|-------|---------|------|
| **Qdrant** | Semantic search | Chunk vectors + metadata |
| **Redis** | Fast reads, state | Memory metadata, sessions, dedup keys, auth, job state |
| **Neo4j** | Relationships, keyword search | Memory/Tag/Category graph, fulltext index |
| **MinIO** | File storage | HTML snapshots, images, PDFs |
| **Ollama** | Embedding generation | nomic-embed-text model |
