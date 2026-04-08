# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# Install dependencies (workspace requires dashboard/package.json to exist)
COPY package.json ./
COPY dashboard/package.json ./dashboard/
RUN bun install

# Copy source
COPY . .

# Runtime stage
FROM oven/bun:1-slim

WORKDIR /app

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/agent ./agent
COPY --from=builder /app/tools ./tools
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/mcp ./mcp
COPY --from=builder /app/dashboard/src/components/MemoryCard ./dashboard/src/components/MemoryCard
COPY --from=builder /app/package.json ./

# Use non-root user already present in oven/bun image (bun:1000)
RUN chown -R bun:bun /app
USER bun

# Run the agent
CMD ["bun", "run", "agent/index.ts"]
