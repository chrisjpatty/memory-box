# Ingestion container — webhook
FROM oven/bun:1 AS builder

WORKDIR /app

# Install backend dependencies (workspace requires dashboard/package.json to exist)
COPY package.json ./
COPY dashboard/package.json ./dashboard/
RUN bun install

# Build React dashboard
COPY dashboard ./dashboard
RUN cd dashboard && bun install && bun run build

# Copy backend source
COPY ingestion/webhook ./ingestion/webhook
COPY lib ./lib
COPY mcp ./mcp
COPY tools ./tools

# Runtime stage
FROM oven/bun:1-slim

WORKDIR /app

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/ingestion/webhook ./ingestion/webhook
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/mcp ./mcp
COPY --from=builder /app/dashboard/dist ./dashboard/dist
COPY --from=builder /app/dashboard/src/components/MemoryCard ./dashboard/src/components/MemoryCard
COPY --from=builder /app/package.json ./

# Use non-root user already present in oven/bun image (bun:1000)
RUN chown -R bun:bun /app
USER bun

EXPOSE 3001

# Run the webhook server
CMD ["bun", "run", "ingestion/webhook/index.ts"]
