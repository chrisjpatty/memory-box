# Astropods HTTP Services — Current State & Gaps

## Summary

This document captures the current Astropods capabilities for exposing HTTP endpoints, identified gaps, and a proposal for supporting MCP servers and general-purpose HTTP services.

## Current Mechanisms for HTTP Exposure

### 1. Agent Frontend (`interfaces.frontend: true`)

When enabled, the agent container is expected to serve a web UI on **port 80**. Astropods exposes this as port 3200 locally during `ast dev`, and assigns a public URL on deploy.

```yaml
agent:
  build:
    context: .
    dockerfile: Dockerfile
  interfaces:
    frontend: true
```

**Limitation:** Semantically intended for the agent's own web UI, not for protocol endpoints like MCP. Also, the agent process typically runs the Mastra adapter (`serve(agent)`) which handles gRPC messaging — serving HTTP alongside it would require running both in the same process.

### 2. Webhook Ingestion (`trigger.type: webhook`)

A persistent HTTP server container that receives webhook requests. Gets a public port (default 3001) during `ast dev` and a public URL via K8s Ingress on deploy.

```yaml
ingestion:
  webhook:
    container:
      build:
        context: .
        dockerfile: ingestion/webhook/Dockerfile
      port: 3001
    trigger:
      type: webhook
```

**Limitation:** Semantically intended for data ingestion pipelines, not general-purpose HTTP services. Currently the only mechanism for user-defined HTTP endpoints, which means projects like memory-box overload it to also serve the dashboard SPA, API routes, and now MCP.

### 3. Messaging Interface (`interfaces.messaging: true`)

The messaging sidecar handles agent communication via gRPC. Adapters (`web`, `slack`) are hardcoded — no extensibility for custom adapters or protocols.

```yaml
dev:
  interfaces:
    messaging:
      adapters: [web, slack]
```

**Not suitable for MCP** — adapters are not user-extensible.

## What's Missing

### General-Purpose HTTP Service

There's no first-class concept for "this container serves an HTTP API that should be publicly accessible." The webhook ingestion fills this gap accidentally, but it conflates ingestion pipelines with HTTP services.

### MCP Server Support

MCP (Model Context Protocol) is referenced in the public spec docs as a future integration type:

> "Integrations can be HTTP APIs, MCP (Model Context Protocol) servers, or any service exposed over a network port"

But no MCP-specific handling exists in the codebase. MCP servers need:
- A persistent HTTP endpoint (Streamable HTTP transport)
- Bearer token authentication
- A public URL that MCP clients can connect to
- The ability to serve alongside (or as part of) the agent

## Proposal: `services` Section

A new top-level `services` section in `astropods.yml` for persistent HTTP services that aren't ingestion pipelines:

```yaml
services:
  mcp:
    container:
      build:
        context: .
        dockerfile: services/mcp/Dockerfile
      port: 3002
    # Or, to run in the same container as another service:
    # entrypoint: services/mcp/index.ts
```

Alternatively, MCP could be a recognized interface type:

```yaml
agent:
  interfaces:
    messaging: true
    mcp:
      port: 3002
      auth: bearer  # or oauth
```

This would let Astropods:
- Automatically expose the MCP endpoint with a public URL
- Inject the URL as an environment variable (`MCP_PUBLIC_URL`)
- Optionally generate connection configs for known MCP clients
- Handle MCP-specific deployment concerns (session management, health checks)

## Current Workaround

Memory-box mounts the MCP server on the webhook ingestion container at `/mcp`, sharing the same Hono server and bearer auth infrastructure. This works but overloads the ingestion webhook's purpose.

## Files Referenced

- Spec types: `astro/packages/astro-spec/spec.go` (Interfaces struct, IngestionTrigger)
- Compose builder: `astro/apps/astro-cli/internal/compose/builder.go` (port exposure logic)
- Deployment parser: `astro/packages/astro-spec/deployment_parser.go` (endpoint/ingress config)
- Public spec: `astro/docs-public/fern/docs/pages/astropods-package-spec.mdx` (MCP mention)
- Schema: `astro/packages/astro-spec/astropods.schema.json`
