# Bun is pinned so the image's bun can read the lockfile format (bun.lock v2
# needs bun 1.4+). Bump all three stages together.

# Build stage
FROM oven/bun:1.4.4 AS builder

WORKDIR /app

# Install dependencies from the lockfile so builds are reproducible
# (workspace requires dashboard/package.json to exist)
COPY package.json bun.lock ./
COPY dashboard/package.json ./dashboard/
RUN bun install --frozen-lockfile

# Copy source and build dashboard
COPY . .
RUN cd dashboard && bun run build

# Production dependencies only, so build/test tooling (Vite, Storybook,
# Vitest, esbuild) doesn't ship in the runtime image
FROM oven/bun:1.4.4 AS deps

WORKDIR /app

COPY package.json bun.lock ./
COPY dashboard/package.json ./dashboard/
RUN bun install --frozen-lockfile --production

# sharp's prebuilt libvips needs the C++ runtime, which distroless doesn't
# ship. Both images are Debian 13, so the builder's copies are ABI-compatible.
RUN mkdir /runtime-libs && cp -L /usr/lib/*-linux-gnu/libstdc++.so.6 /usr/lib/*-linux-gnu/libgcc_s.so.1 /runtime-libs/

# Runtime stage. Distroless has no shell or package manager; files stay
# root-owned and the app runs as the image's nonroot user.
FROM oven/bun:1.4.4-distroless

WORKDIR /app

COPY --from=deps /runtime-libs/ /usr/lib/
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/dashboard/node_modules ./dashboard/node_modules
COPY --from=builder /app/server ./server
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/tools ./tools
COPY --from=builder /app/mcp ./mcp
COPY --from=builder /app/dashboard/dist ./dashboard/dist
COPY --from=builder /app/dashboard/src/components/MemoryCard ./dashboard/src/components/MemoryCard
COPY --from=builder /app/dashboard/src/lib ./dashboard/src/lib
COPY --from=builder /app/dashboard/package.json ./dashboard/package.json
COPY --from=builder /app/package.json ./

USER nonroot

EXPOSE 80

# The distroless image's entrypoint is bun
CMD ["run", "server/index.ts"]
