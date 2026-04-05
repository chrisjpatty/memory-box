# Astropods CLI Feedback: Custom Knowledge Containers & Persistence

## Context

While re-architecting memory-box to replace the built-in Qdrant/Redis/Neo4j knowledge providers with a single PostgreSQL + pgvector instance, I ran into several friction points with the Astropods spec and CLI around custom knowledge containers. This document captures what I expected vs what happened, intended as actionable feedback for improving the CLI.

---

## 1. Persistence for Custom Knowledge Containers

### What I wanted to do
Define a custom PostgreSQL container as a knowledge store with persistent data across `ast dev` restarts, the same way built-in providers work:

```yaml
knowledge:
  db:
    provider: qdrant       # ← this gets persistent: true for free
    persistent: true       # ← works perfectly
```

Replace with:

```yaml
knowledge:
  db:
    container:
      image: pgvector/pgvector:pg17
      port: 5432
      environment:
        POSTGRES_DB: memory_box
    persistent: true
```

### What happened
```
failed to start services: Error response from daemon: invalid volume specification:
'knowledge-db-data::rw': invalid mount config for type "volume": field Target must not be empty
```

Astropods correctly creates a named Docker volume (`knowledge-db-data`) but doesn't know where to mount it inside the container. For built-in providers (Qdrant, Redis, Neo4j), Astropods presumably hardcodes the mount target (e.g., `/qdrant/storage`, `/data`). For custom containers, there's no way to specify it.

### What I expected
I expected one of these to work:

**Option A — Explicit volume target on the knowledge entry:**
```yaml
knowledge:
  db:
    container:
      image: pgvector/pgvector:pg17
      port: 5432
    persistent: true
    volume: /var/lib/postgresql/data    # mount target for the named volume
```

**Option B — Volume target on the container:**
```yaml
knowledge:
  db:
    container:
      image: pgvector/pgvector:pg17
      port: 5432
      volume: /var/lib/postgresql/data  # ← currently rejected by schema validation
    persistent: true
```

**Option C — Auto-detect from image VOLUME declarations:**
Docker images declare their volumes (e.g., the postgres image declares `VOLUME /var/lib/postgresql/data`). Astropods could inspect the image metadata and use the first declared volume as the mount target. This would make `persistent: true` "just work" for any standard database image.

### What I tried as workarounds

1. **`volume` inside `container` block** — Schema validation rejects it: `additional properties 'volume' not allowed`
2. **`persistent: true` at container level instead of knowledge level** — Schema accepts it, but same Docker error at runtime
3. **Custom Dockerfile with `VOLUME` declaration, no `persistent` flag** — Container starts, but data is lost on `ast dev` restart because Astropods recreates the container with a new anonymous volume
4. **Using `image` instead of `build` with `persistent: true` at knowledge level** — Not yet confirmed if this works (testing)

### Suggested fix
Add a `volume` (or `volumes`) property to the container schema that specifies the mount target path(s) for persistent data. When `persistent: true` is set, Astropods would mount its named volume (`knowledge-{name}-data`) at the specified path.

```yaml
# Proposed syntax
knowledge:
  db:
    container:
      image: pgvector/pgvector:pg17
      port: 5432
      volume: /var/lib/postgresql/data   # where to mount the persistent volume
    persistent: true
```

Alternatively, auto-detect from the image's VOLUME declarations so no extra config is needed. This would make the UX identical to built-in providers.

---

## 2. `environment` vs `inputs` for Container Env Vars

### What happened
The container schema includes an `environment` property, but the Astropods convention for injecting env vars into containers is through `inputs` arrays at the knowledge entry level. I initially used `environment` on the container (Docker Compose convention), then `env` (shorthand convention). Neither is the Astropods way.

The correct approach is:
```yaml
knowledge:
  db:
    container:
      image: pgvector/pgvector:pg17
      port: 5432
    inputs:
      - name: POSTGRES_DB
        datatype: string
        default: memory_box
```

### What I expected
Since `environment` exists in the container schema, I expected it to work like Docker Compose's `environment` block. The distinction between `environment` (on container) and `inputs` (on knowledge entry) is not documented and was confusing.

### Suggested fix
1. Document when to use `inputs` vs `environment` — are they different? Does `environment` actually work, or is it vestigial in the schema?
2. If `environment` on containers is not the intended mechanism, consider removing it from the schema or adding a validation hint: "Use 'inputs' at the knowledge entry level instead of 'environment' on the container."
3. Add examples of `inputs` on knowledge entries in `ast docs`.

---

## 3. Environment Variable Naming for Custom Knowledge Containers

### What happened
For built-in providers, Astropods injects predictably named env vars:
- `QDRANT_HOST`, `QDRANT_PORT`, `QDRANT_URL`
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_URL`
- `NEO4J_HOST`, `NEO4J_PORT`, `NEO4J_URL`

For my custom container named `db`, I had to guess what env vars would be injected. I assumed `DB_HOST`/`DB_PORT` following the pattern, but this isn't documented.

### What I expected
- Documentation of the env var naming convention for custom knowledge containers: `{UPPER_SNAKE_NAME}_HOST`, `{UPPER_SNAKE_NAME}_PORT`, `{UPPER_SNAKE_NAME}_URL`
- Or: a way to see what env vars are injected, e.g., `ast dev env` command that prints all injected variables

### Suggested fix
1. Document the naming convention in `ast docs agent`
2. Consider adding `ast dev env` to print all injected environment variables
3. Optionally allow explicit env var mapping in the spec:
```yaml
knowledge:
  db:
    container:
      image: pgvector/pgvector:pg17
      port: 5432
    env_prefix: POSTGRES   # → injects POSTGRES_HOST, POSTGRES_PORT, POSTGRES_URL
```

---

## 4. `ast docs` Coverage

### What happened
`ast docs agent` covers quick start, tools, project structure, and packages. `ast docs help` covers CLI commands. Neither covers the `knowledge` section of the spec in any detail — no examples of custom containers, persistence, environment variables, or the container schema properties.

### What I expected
A section in `ast docs` covering:
- Built-in knowledge providers and their env vars
- How to use custom container images as knowledge stores
- How persistence works (named volumes, data retention)
- The complete container schema (image, build, port, environment, healthcheck, persistent, gpu)
- How env vars are injected for each knowledge entry

### Suggested fix
Add an `ast docs knowledge` section (or expand `ast docs agent`) with examples like:

```
## Knowledge Stores

Knowledge entries define sidecar databases for your agent.

### Built-in providers
  knowledge:
    vectors:
      provider: qdrant
      persistent: true    # data survives ast dev restart

### Custom containers
  knowledge:
    db:
      container:
        image: pgvector/pgvector:pg17
        port: 5432
        volume: /var/lib/postgresql/data
      persistent: true
      inputs:
        - name: POSTGRES_DB
          datatype: string
          default: my_db

### Environment variables
Each knowledge entry injects HOST/PORT/URL vars into the agent:
  - knowledge.db → DB_HOST, DB_PORT, DB_URL
  - knowledge.cache → CACHE_HOST, CACHE_PORT, CACHE_URL
```

---

## 5. Schema Validation UX

### What happened
`ast validate` correctly caught the invalid `volume` property. However, `ast dev` gave a Docker-level error instead of catching the issue at validation time. The Docker error (`invalid volume specification: 'knowledge-db-data::rw'`) is cryptic and doesn't point to the astropods.yml config as the root cause.

### What I expected
`ast dev` should run schema validation before generating Docker Compose and show a user-friendly error:

```
✗ knowledge.db: persistent: true requires a volume mount path for custom containers.
  Add 'volume: /path/to/data' to the container configuration.
```

### Suggested fix
Run `ast validate` as part of `ast dev` startup (before Docker Compose generation). If validation passes but the generated compose is invalid (e.g., empty volume target), catch that at generation time with a descriptive error rather than passing it through to Docker.

---

## 6. Neither `environment` nor `inputs` Reaches Custom Knowledge Containers

### What happened
The Postgres container crashed on startup because it didn't receive `POSTGRES_PASSWORD`:

```
Error: Database is uninitialized and superuser password is not specified.
```

I tried three approaches to pass env vars to the knowledge container:

1. **`environment` on the container** — Accepted by schema but the container didn't receive the vars
2. **`inputs` on the knowledge entry** — Accepted by schema but the container didn't receive the vars
3. **Baking ENV into a Dockerfile** — This was the only approach that worked

### What I expected
Either `environment` or `inputs` should inject env vars into the knowledge container itself. For built-in providers this isn't needed (Astropods knows how to configure them), but for custom containers, users need a way to pass configuration to the container.

### Workaround
Created a `postgres.Dockerfile` that bakes in the env vars:
```dockerfile
FROM pgvector/pgvector:pg17
ENV POSTGRES_DB=memory_box
ENV POSTGRES_USER=postgres
ENV POSTGRES_PASSWORD=postgres
```

This works but means credentials are hardcoded in the Dockerfile rather than configurable through `ast configure`.

### Suggested fix
`environment` on a custom knowledge container should be passed through as Docker environment variables. This is the standard Docker Compose behavior and what users expect when they see the property in the schema.

---

## 7. No Connection Env Vars Injected for Custom Knowledge Containers

### What happened
For built-in providers, Astropods injects `{NAME}_HOST`, `{NAME}_PORT`, `{NAME}_URL` into the agent and ingestion containers so they can connect. For a custom knowledge container named `db`, **no env vars were injected at all**.

I verified by inspecting the agent container's environment:
```bash
docker exec memory-box-agent-1 env | grep -iE 'db|postgres'
# (empty — no results)
```

Compare with Ollama (a built-in model), which correctly injects `OLLAMA_HOST`, `OLLAMA_PORT`, `OLLAMA_URL`, `OLLAMA_BASE_URL`.

### What I expected
At minimum, Astropods should inject `DB_HOST` and `DB_PORT` (following the `{UPPER_NAME}_HOST/PORT` convention) into the agent and ingestion containers, pointing to the Docker service hostname (`knowledge-db`) and the declared port (`5432`).

### Workaround
Hardcoded the Docker service hostname in the application code:
```typescript
const host = process.env.DB_HOST || process.env.POSTGRES_HOST || 'knowledge-db';
```

This couples the application to Astropods' Docker Compose service naming convention (`knowledge-{name}`), which is fragile.

### Suggested fix
When a custom container is declared in the `knowledge` section, Astropods should inject connection env vars into all dependent containers (agent, ingestion) following the same pattern as built-in providers:
- `{NAME}_HOST` → Docker service hostname (e.g., `knowledge-db`)
- `{NAME}_PORT` → Declared port (e.g., `5432`)
- `{NAME}_URL` → `http://{host}:{port}` or appropriate protocol

---

## 8. No Startup Dependency Ordering Between Knowledge and Dependent Containers

### What happened
The ingestion-webhook container started and immediately tried to connect to Postgres, which was still initializing. The connection was refused and the container crashed:

```
error: connect ECONNREFUSED 172.21.0.3:5432
```

For built-in providers, Astropods may handle startup ordering or health checks. For custom containers, there's no dependency ordering — all containers start simultaneously.

### What I expected
Containers that depend on knowledge stores should wait until the knowledge container is healthy before starting. Docker Compose supports this via `depends_on` with `condition: service_healthy`, and the Astropods container schema already includes a `healthcheck` property.

### Workaround
Added a retry loop in the application code (`lib/db-init.ts`) that attempts to connect up to 15 times with 2-second delays:
```typescript
for (let attempt = 1; attempt <= maxRetries; attempt++) {
  try {
    await pool.query(schema);
    return;
  } catch (err) {
    if (attempt === maxRetries) throw err;
    console.log(`Waiting for database... (attempt ${attempt}/${maxRetries})`);
    await new Promise(r => setTimeout(r, 2000));
  }
}
```

This works but pushes infrastructure concerns into application code.

### Suggested fix
1. For custom knowledge containers with `healthcheck` defined, use Docker Compose `depends_on: condition: service_healthy` for agent and ingestion containers
2. If no healthcheck is defined, add a default TCP port check (wait until the declared `port` accepts connections)
3. For database images specifically, the standard health check is: `pg_isready` for Postgres, `redis-cli ping` for Redis, etc.

---

## Summary of Suggested Improvements

| Priority | Area | Suggestion |
|----------|------|------------|
| **High** | **Env vars** | **Inject `{NAME}_HOST/PORT/URL` for custom knowledge containers into agent/ingestion containers** |
| **High** | **Env vars** | **Pass `environment` from container config as Docker env vars to the container itself** |
| **High** | **Persistence** | Add `volume` property to container schema for custom persistent containers |
| **High** | **Docs** | Add `ast docs knowledge` with custom container + persistence examples |
| Medium | Startup | Add dependency ordering — wait for knowledge containers to be healthy before starting agent/ingestion |
| Medium | DX | Run validation before Docker Compose generation in `ast dev` |
| Medium | DX | Add `ast dev env` to print all injected environment variables |
| Low | DX | Clarify `environment` vs `inputs` — document when to use each, or remove `environment` from schema if not functional |
| Low | DX | Support `env_prefix` for custom env var naming |
