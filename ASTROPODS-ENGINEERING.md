# Astropods Engineering: Custom Container Persistence & Env Var Injection

Targeted feedback based on reading the Astropods CLI source code. References specific files and line numbers in the `astro` repo.

---

## 1. Custom Containers Can't Use Persistent Volumes

### Root Cause

`builder.go:374` resolves the volume mount path from the provider registry:

```go
mountPath := spec.GetProvider(knowledge.Provider).MountPath
```

When `knowledge.Provider` is empty (custom container without a provider), `GetProvider("")` returns a zero-value `BuiltinProvider` with an empty `MountPath`. The volume is created (`knowledge-{name}-data`) but mounted at `""`, which Docker rejects:

```
invalid volume specification: 'knowledge-db-data::rw': field Target must not be empty
```

### Proposed Fix (~5 lines)

**1. Add `Volume` field to `ContainerConfig`** in `packages/astro-spec/spec.go`:

```go
type ContainerConfig struct {
    // ... existing fields ...
    Volume     string `json:"volume,omitempty" yaml:"volume,omitempty" jsonschema:"description=Mount path for persistent data volume"`
}
```

**2. Use container volume path with provider fallback** in `apps/astro-cli/internal/compose/builder.go:374`:

```go
// Current:
mountPath := spec.GetProvider(knowledge.Provider).MountPath

// Proposed:
mountPath := container.Volume
if mountPath == "" {
    mountPath = spec.GetProvider(knowledge.Provider).MountPath
}
if mountPath == "" && container.Persistent {
    // Could also auto-detect from Docker image VOLUME declarations,
    // but explicit is better for now.
    log.Warnf("knowledge.%s: persistent is true but no volume path specified — skipping volume mount", name)
    continue // or return an error
}
```

**3. Update the JSON schema** to allow `volume` on container objects.

### Result

Users can write:

```yaml
knowledge:
  db:
    container:
      image: pgvector/pgvector:pg17
      port: 5432
      volume: /var/lib/postgresql/data
    persistent: true
```

And it works the same as built-in providers. The `volume` field is ignored when a provider is set (provider's `MountPath` takes precedence, unless you want to allow overrides there too).

### Current Workaround

Use `provider: postgres` with a `container.image` override:

```yaml
knowledge:
  db:
    provider: postgres
    persistent: true
    container:
      image: pgvector/pgvector:pg17
```

This works because `ResolvedContainer()` (`spec.go:193-198`) uses the user's container config when `Container != nil`, while `builder.go:374` still resolves the mount path from the `postgres` provider. Not obvious, but functional.

---

## 2. No Env Var Injection for Custom Knowledge Containers

### Root Cause

`builder.go:711-734` — `BuildEnvironment()` only injects `{PREFIX}_HOST` / `{PREFIX}_PORT` when the knowledge entry has a provider with a non-empty `EnvPrefix`:

```go
prov := spec.GetProvider(knowledge.Provider)
if prov.EnvPrefix != "" {
    hostKey := prov.EnvPrefix + "_HOST"
    portKey := prov.EnvPrefix + "_PORT"
    // ...
}
```

Custom containers (`knowledge.Provider == ""`) skip this entirely. The agent and ingestion containers receive no connection info for the knowledge store.

### Proposed Fix

For custom containers without a provider, derive the env prefix from the knowledge entry name:

```go
envPrefix := prov.EnvPrefix
if envPrefix == "" && knowledge.Container != nil {
    // Custom container: derive prefix from entry name
    // e.g., knowledge entry "db" → "DB_HOST", "DB_PORT"
    envPrefix = strings.ToUpper(strings.ReplaceAll(name, "-", "_"))
}

if envPrefix != "" {
    hostKey := envPrefix + "_HOST"
    portKey := envPrefix + "_PORT"
    // ...
}
```

This way a knowledge entry named `db` injects `DB_HOST=knowledge-db` and `DB_PORT=5432` into the agent. Follows the same pattern as built-in providers but auto-derived.

### Alternative: Explicit `env_prefix`

If auto-derivation feels too implicit, add an explicit field:

```go
type Knowledge struct {
    // ... existing fields ...
    EnvPrefix string `json:"env_prefix,omitempty" yaml:"env_prefix,omitempty"`
}
```

```yaml
knowledge:
  db:
    container:
      image: pgvector/pgvector:pg17
      port: 5432
    env_prefix: POSTGRES  # → POSTGRES_HOST, POSTGRES_PORT injected
```

---

## 3. `environment` on Container Config Is Never Applied

### Root Cause

The `ContainerConfig` struct (`spec.go`) has an `Environment` field, and the schema allows it, but `builder.go:290-397` never reads it. Only `DefaultEnv` from the provider registry (`builder.go:386-394`) and knowledge `Inputs` (via `envresolver.go`) are applied.

For custom containers, `DefaultEnv` is empty (no provider), and `Inputs` are injected into the **agent** container, not the knowledge container.

### What users see

```yaml
knowledge:
  db:
    container:
      image: postgres:17
      port: 5432
      environment:
        POSTGRES_PASSWORD: secret  # Silently ignored
```

Postgres crashes with "superuser password is not specified."

### Proposed Fix

In `builder.go`, after line 394 (where provider `DefaultEnv` is applied), add:

```go
// Apply user-specified container environment
if container.Environment != nil {
    if service.Environment == nil {
        service.Environment = make(types.MappingWithEquals)
    }
    for k, v := range container.Environment {
        val := v
        service.Environment[k] = &val
    }
}
```

This is the same pattern already used for `DefaultEnv` (lines 386-394), just reading from the user's container config instead of the provider registry.

---

## 4. No Startup Dependency Ordering for Knowledge Containers

### Root Cause

`builder.go` adds all services to the compose project but doesn't set `depends_on` between agent/ingestion services and knowledge services. Docker Compose starts them all simultaneously. If a knowledge container (like Postgres) takes a few seconds to initialize, dependent containers crash.

### Proposed Fix

When assembling agent and ingestion services, add `depends_on` for all knowledge services:

```go
// In the agent/ingestion service assembly section:
for name, knowledge := range s.Knowledge {
    if knowledge.DeploysContainer(s.Providers) {
        serviceName := fmt.Sprintf("knowledge-%s", name)
        service.DependsOn[serviceName] = types.ServiceDependency{
            Condition: types.ServiceConditionStarted,
        }
    }
}
```

For knowledge containers with health checks defined, use `ServiceConditionHealthy` instead of `ServiceConditionStarted` — this way the agent waits until Postgres is actually accepting connections, not just until the container process has started.

The `postgres` provider already has a health check (`pg_isready -U postgres`), so this would "just work" for the provider-based setup.

---

## Summary

| Issue | Fix Location | Effort | Impact |
|-------|-------------|--------|--------|
| Custom container persistence | `builder.go:374` + `spec.go` (add `Volume` field) | ~5 lines | High — enables any database image with persistent volumes |
| Custom container env var injection | `builder.go:711-734` | ~8 lines | High — removes need to hardcode Docker hostnames in app code |
| `environment` not applied to containers | `builder.go:394` (add block after DefaultEnv) | ~8 lines | Medium — makes container env vars work as expected |
| Startup dependency ordering | `builder.go` (agent/ingestion assembly) | ~10 lines | Medium — prevents race condition crashes |

Total: ~30 lines of Go across 2 files to resolve all four issues.
