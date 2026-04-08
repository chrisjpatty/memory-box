# Memory Box

A personal memory storage agent. Save any content — text, links, images — and retrieve it later through conversation or semantic search. Built on the Astropods platform with Mastra.

## Quick Start

```bash
# Install dependencies
bun install
cd dashboard && bun install && cd ..

# Configure secrets (Anthropic API key, admin password)
ast configure

# Start everything
ast dev
```

- **Agent playground**: http://localhost:3000
- **Admin dashboard**: http://localhost:3001

## How It Works

1. **Ingest content** via the HTTP API (with a bearer token) or by chatting with the agent
2. A **classifier agent** (Haiku) identifies the content type and extracts metadata
3. Content is routed to a **type-specific pipeline**:
   - **Text**: chunked and embedded
   - **URL**: fetched via Jina Reader, converted to markdown, then chunked and embedded
   - **Image**: described via Claude Vision, then embedded
4. Vectors stored in **Qdrant**, metadata cached in **Redis**, relationships tracked in **Neo4j**
5. **Search and retrieve** through the chat agent or the dashboard

## Project Structure

```
memory-box/
├── agent/index.ts                # Chat agent (Claude Opus) with memory tools
├── dashboard/                    # React + Vite + Tailwind admin dashboard
│   └── src/
│       ├── pages/                # Login, Dashboard, Memories, Search
│       └── components/           # TokenCard, MemoryList, CodeSnippet, etc.
├── ingestion/webhook/
│   ├── index.ts                  # Hono HTTP server (API + ingestion endpoint)
│   ├── api/                      # JSON API routes (auth, token, stats, memories, search)
│   ├── dashboard/session.ts      # Session management
│   └── Dockerfile
├── lib/
│   ├── classifier.ts             # Haiku content classifier agent
│   ├── ingest.ts                 # Ingestion orchestrator
│   ├── pipelines/                # text.ts, url.ts, image.ts
│   ├── clients.ts                # Qdrant, Redis, Neo4j clients
│   ├── embeddings.ts             # Ollama embedding generation
│   └── auth.ts                   # Bearer token management
├── tools/                        # Agent tools (store, search, get, list, delete)
├── astropods.yml                 # Astropods spec
└── Dockerfile                    # Agent container
```

## Dashboard Development

The dashboard is a React SPA with a Hono JSON API backend. For development with hot module replacement:

```bash
# Terminal 1: Start Docker services
ast dev

# Terminal 2: Start the standalone API server
bun run dev:dashboard

# Terminal 3: Start Vite dev server with HMR
cd dashboard && bun run dev
```

Open http://localhost:5173 — Vite proxies `/api/*` to the standalone API server.

The default admin password in dev mode is `dev`.

## Ingestion API

After generating a token from the admin dashboard, send content to the ingestion endpoint:

```bash
curl -X POST http://localhost:3001/ingest \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"content": "https://example.com/article", "tags": ["reading-list"]}'
```

The API accepts:
- `content` (required): text, a URL, or base64 image data
- `title` (optional): title for the memory
- `tags` (optional): array of tags

Batch ingestion is available at `POST /ingest/batch` with `{"items": [...]}`.

## Configuration

Configured in `astropods.yml`. Key settings:

| Component | Provider | Notes |
|-----------|----------|-------|
| Chat model | Anthropic (Claude Opus) | Main agent |
| Classifier | Anthropic (Claude Haiku) | Content classification |
| Embeddings | Ollama (mxbai-embed-large) | Local, 1024-dim |
| Vector store | Qdrant | Persistent |
| Cache | Redis | Persistent |
| Graph DB | Neo4j | Persistent |

Secrets set via `ast configure`:
- `ANTHROPIC_API_KEY` — Claude API key
