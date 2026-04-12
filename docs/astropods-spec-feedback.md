# Astropods Spec Feedback: Defining a Frontend-Serving Agent

Feedback from building memory-box — a personal knowledge management agent with a React dashboard, REST API, MCP server, and ingestion endpoints, all served from a single container using `interfaces.frontend: true`.

## What We Ended Up With

```yaml
agent:
  build:
    context: .
    dockerfile: Dockerfile
  interfaces:
    frontend: true
    messaging: false
```

The agent container is an HTTP server (Hono on port 80) that serves everything: the dashboard SPA, session-authenticated API routes, bearer-token ingestion endpoints, and an MCP server. No messaging sidecar, no separate ingestion container.

This works, but required significant workarounds to get here.

## Gap 1: Knowledge services don't inject connection info into the agent

### What happened

Custom container knowledge entries (no `provider` field) don't get their host/port injected into the agent container's environment. The compose builder's `BuildEnvironment()` only injects when the knowledge entry has a recognized provider with an `EnvPrefix`. Our pgvector and MinIO containers are custom images, so the agent got zero connection information.

The agent container crashed on startup with `ECONNREFUSED 127.0.0.1:5432` because it had no idea where Postgres was.

### What we expected

Defining a knowledge service should automatically make it reachable from the agent. The compose builder generates deterministic Docker service names (`knowledge-{name}`) — the agent should receive those as env vars without any manual wiring.

### What we had to do

Hard-code the Docker Compose service names (`knowledge-db`, `knowledge-files`) as defaults in our application code, with env var overrides for local dev. This couples the application to Astropods' internal naming convention.

Worse: the env var names differ between environments. The compose builder injects nothing (Gap 1), so we use `knowledge-db` as a fallback. But the Kubernetes deployment template injects `KNOWLEDGE_DB_HOST` — a different env var name that isn't documented anywhere. We only discovered this when the production deploy failed with `ENOTFOUND` because the code was falling through to the Docker Compose hostname. The fix was to check for both:

```typescript
const host = process.env.POSTGRES_HOST || process.env.KNOWLEDGE_DB_HOST || 'knowledge-db';
```

This three-way fallback (local dev env var, Kubernetes env var, Docker Compose hostname) is fragile and undiscoverable. The `KNOWLEDGE_{NAME}_HOST` naming convention is an implementation detail of the deployment template with no documentation trail from the spec to the application code.

### Ideal behavior

Any knowledge entry with a `container` block should automatically inject connection info into the agent (and any other dependent containers):

```
KNOWLEDGE_{NAME}_HOST=knowledge-{name}
KNOWLEDGE_{NAME}_PORT={container.port}
```

The Kubernetes deployment template already does this (confirmed in tests). The compose builder should match.

Even better, for well-known images, infer conventional env var names:

```yaml
knowledge:
  db:
    container:
      image: pgvector/pgvector:pg17
      port: 5432
```

Could automatically inject `POSTGRES_HOST` and `POSTGRES_PORT` based on recognizing the `pgvector/pgvector` or `postgres` image family — same way Docker Compose infers healthchecks for known images.

## Gap 2: Knowledge container credentials don't propagate

### What happened

The knowledge `db` entry has inputs for `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`. These get injected into the Postgres container (so it initializes with the right database and credentials) but NOT into the agent container. The agent needs the same credentials to connect, but has no way to receive them through the spec.

### What we had to do

Hard-coded the credentials in application code. For a personal single-user app this is fine, but for a real multi-tenant deployment you'd want these managed by the platform.

### Ideal behavior

Knowledge inputs should be available to the agent automatically, perhaps namespaced:

```
KNOWLEDGE_DB_POSTGRES_USER=postgres
KNOWLEDGE_DB_POSTGRES_PASSWORD=postgres
KNOWLEDGE_DB_POSTGRES_DB=memory_box
```

Or, simpler: the platform could construct and inject a connection string:

```
KNOWLEDGE_DB_URL=postgresql://postgres:postgres@knowledge-db:5432/memory_box
```

This is the information the agent almost always needs — a single connection string. The individual components (host, port, user, password, database) are rarely useful on their own.

## Gap 3: No way to declare "this container needs access to these knowledge services"

### The broader pattern

The current spec implicitly assumes the agent can reach all knowledge services. But there's no explicit declaration of which services a container depends on, and no mechanism for the platform to wire up the connections.

### Ideal syntax

Something like:

```yaml
agent:
  build: ...
  interfaces:
    frontend: true
  uses:
    - knowledge.db
    - knowledge.files
```

Where `uses` tells the platform: "inject connection info for these services into this container's environment." This makes the dependency explicit and gives the platform enough information to:
- Inject the right env vars
- Set up `depends_on` / readiness ordering
- Generate connection strings
- Scope access in production (network policies, IAM)

## Gap 4: `frontend: true` doesn't support hot-reload dev workflow

### What happened

With `frontend: true`, the agent container serves the frontend from built static files. During `ast dev`, the container runs the production build — no hot reload. To iterate on the frontend or API code, we need a separate dev workflow:

1. `ast dev` — starts infrastructure (Postgres, MinIO, Ollama)
2. `bun run dev:dashboard` — runs the server locally with `bun --watch`
3. `cd dashboard && bun run dev` — runs Vite with HMR

This requires a separate `scripts/dev-dashboard.ts` that reimports the app factory with CORS enabled, sets `localhost` overrides for service hostnames, and runs on a different port.

### What we expected

`ast dev` could run the agent in a "dev mode" where:
- The container's code is mounted as a volume (or run on the host)
- File changes trigger automatic restarts
- The frontend dev server (Vite) is started alongside

### Ideal behavior

```yaml
dev:
  interfaces:
    frontend:
      port: 3001          # agent's dev port
      hot_reload: true     # mount source, watch for changes
```

Or even: `ast dev` detects that the agent has `frontend: true` and automatically runs it on the host (not in Docker) with file watching, similar to how it handles models.

## Gap 5: Custom knowledge containers lack provider conveniences

### What happened

Using `container.image: pgvector/pgvector:pg17` gives us a raw container with no platform awareness. We had to:
- Specify the port (the platform can't infer 5432 from a Postgres image)
- Specify the volume path (the platform doesn't know where Postgres stores data)
- Define inputs for standard Postgres env vars
- Accept that no env vars would be auto-injected into dependent containers

### What we wanted

A middle ground between "use a built-in provider" and "bring your own raw container":

```yaml
knowledge:
  db:
    provider: postgres
    container:
      image: pgvector/pgvector:pg17   # custom image, but platform knows it's Postgres
    persistent: true
```

This tells the platform: "this is a Postgres-compatible service, but use my custom image instead of the default." The platform could then:
- Use the provider's `EnvPrefix` for env var injection (`POSTGRES_HOST`, `POSTGRES_PORT`)
- Use the provider's default port (5432) and volume path
- Skip requiring explicit `inputs` for standard Postgres env vars
- Still allow the custom image (pgvector extensions, custom configs)

For MinIO / S3-compatible storage, a similar pattern:

```yaml
knowledge:
  files:
    provider: s3
    container:
      build:
        context: .
        dockerfile: minio.Dockerfile
    persistent: true
```

## Summary: What an ideal spec could look like

Here's what the memory-box `astropods.yml` could look like if these gaps were addressed:

```yaml
spec: package/v1
name: memory-box

agent:
  build:
    context: .
    dockerfile: Dockerfile
  interfaces:
    frontend: true

models:
  ollama:
    provider: ollama
    models: [nomic-embed-text]
  anthropic:
    provider: anthropic

knowledge:
  db:
    provider: postgres
    image: pgvector/pgvector:pg17
    persistent: true
  files:
    provider: s3
    image: minio/minio
    persistent: true

dev:
  interfaces:
    frontend:
      port: 3001
```

What's different:
- **No `inputs` on knowledge entries** — provider handles standard env vars
- **No `container` wrapper** — `image` is a top-level shorthand when you just need a custom image
- **No `port` or `volume`** — inferred from the provider
- **No agent `inputs`** — connection info auto-injected because the platform knows which knowledge services exist
- **No `messaging: false`** — omitting it should default to false when `frontend: true` is set (the common case for frontend-serving agents is that they handle their own chat)
- **No credentials in application code** — the platform manages and injects them
