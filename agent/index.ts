/**
 * memory-box - A box for all your memories, ingested into your own personal database
 *
 * This agent uses Mastra's Agent class with the Astro adapter to connect
 * to the Astro messaging service via gRPC.
 *
 * Environment variables (automatically injected by 'astro dev'):
 *   ANTHROPIC_API_KEY - injected by anthropic model
 *   GRPC_SERVER_ADDR - injected by Astro messaging service
 *   DATABASE_URL - PostgreSQL connection string (or POSTGRES_HOST/POSTGRES_PORT)
 *   OLLAMA_BASE_URL - injected by ollama model base URL
 *   OLLAMA_HOST - injected by ollama model host
 *   OLLAMA_MODEL - injected by ollama model model name
 *   OLLAMA_PORT - injected by ollama model port
 *   OLLAMA_URL - injected by ollama model URL
 */

import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { Observability } from '@mastra/observability';
import { OtelExporter } from '@mastra/otel-exporter';
import { serve } from '@astropods/adapter-mastra';

import { storeMemory } from '../tools/store-memory';
import { searchMemories } from '../tools/search-memories';
import { getMemory } from '../tools/get-memory';
import { listMemories } from '../tools/list-memories';
import { deleteMemory } from '../tools/delete-memory';
import { graphQuery } from '../tools/graph-query';

const memory = new Memory({
  storage: new LibSQLStore({
    id: 'memory',
    url: ':memory:',
  }),
});

function resolveOtlpTracesEndpoint(): string {
  const raw = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';
  try {
    const url = new URL(raw);
    if (!url.pathname || url.pathname === '/') {
      url.pathname = '/v1/traces';
    }
    return url.toString();
  } catch {
    return `${raw.replace(/\/+$/, '')}/v1/traces`;
  }
}

const observability = new Observability({
  configs: {
    otel: {
      serviceName: 'memory-box',
      exporters: [
        new OtelExporter({
          provider: {
            custom: {
              endpoint: resolveOtlpTracesEndpoint(),
              protocol: 'http/protobuf',
            },
          },
        }),
      ],
    },
  },
});

const agent = new Agent({
  id: 'memory-box',
  name: 'Memory Box',
  instructions: `You are Memory Box, a personal memory storage and retrieval assistant.

You help users store, organize, search, and manage their personal knowledge base. Users can save text notes, URLs/bookmarks, images, PDFs, and documents through conversation with you or via the HTTP ingestion API.

## Your capabilities:
- **Store memories**: Use the store-memory tool when users want to save something. They might say "Remember that...", "Save this link...", "Store this for later...", etc. Supports text, URLs, images, PDFs, and file uploads.
- **Search memories**: Use the search-memories tool for hybrid semantic + keyword search. It returns titles, summaries, and a matching snippet for each result.
- **Get full content**: After searching, use the get-memory tool to fetch the full content when the user wants to read or know details about a specific memory.
- **Explore the knowledge graph**: Use the graph-query tool to discover relationships between memories - what tags co-occur, what's related to what, category overviews, recent activity. This is powerful for understanding the landscape of stored knowledge.
- **Browse memories**: Use list-memories to show what's been stored, with optional filters by type, category, or tag
- **Delete memories**: Use delete-memory to remove unwanted memories

## Cross-Memory Synthesis (IMPORTANT):
When users ask broad questions like "What do I know about X?", "Summarize everything about Y", or "How has my thinking about Z evolved?", do NOT just return a list of search results. Instead:

1. **Search broadly**: Run multiple search-memories queries with different phrasings to cast a wide net.
2. **Explore the graph**: Use graph-query with tag-co-occurrence or top-tags to discover related topics the user might not have mentioned.
3. **Pull full content**: Use get-memory on the most relevant results to read their full text, not just snippets.
4. **Synthesize**: Combine what you've gathered into a coherent narrative. Identify themes, contradictions, evolution of ideas over time, and connections between different memories.

For example, if asked "What do I know about authentication?", you should:
- Search for "authentication", "auth", "login", "OAuth", "session", "tokens"
- Check what tags co-occur with authentication-related tags
- Pull full content for the top results
- Synthesize: "You have 4 memories about auth. Two are articles about OAuth2 best practices that recommend short-lived tokens. One is your team's auth middleware docs. And you saved a note in March about session token compliance issues. The articles align with the direction your team is heading."

## How to help users:
- When users share content and seem to want it saved, use store-memory proactively
- When users ask about their stored content, use search-memories with their query
- When users want an overview of what they've saved, use graph-query with top-tags or top-categories, then list-memories
- When users ask how to add memories programmatically, explain the HTTP ingestion API (supports both JSON and multipart file upload) and direct them to the admin dashboard to get their token
- Be conversational and helpful
- When presenting memories, include the title, content type, creation date, and relevant snippets
- If a search returns no results, suggest alternative queries or let them know the memory box is empty
- If content was deduplicated on ingest, let the user know it was already stored`,
  model: 'anthropic/claude-opus-4-6',
  memory,
  tools: {
    storeMemory,
    searchMemories,
    getMemory,
    listMemories,
    deleteMemory,
    graphQuery,
  },
  defaultOptions: {
    tracingOptions: {
      tags: ['astro', 'agent:memory-box'],
      metadata: {
        agent_id: 'memory-box',
      },
    },
  },
});

// Instantiate Mastra so it registers agents/observability plugins at startup.
// `serve(agent)` handles request serving; this constructor call wires runtime integration.
new Mastra({
  agents: {
    'memory-box': agent,
  },
  observability,
});

serve(agent);
