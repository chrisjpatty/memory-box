/**
 * MCP tool adapter — maps existing Mastra tools to MCP tools with membox_ prefix.
 *
 * Each tool reuses the existing Mastra tool's execute function and Zod input schema.
 * The membox_ prefix prevents naming collisions with agents' internal "memory" tools.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';

import { storeMemory } from '../tools/store-memory';
import { searchMemories } from '../tools/search-memories';
import { getMemory } from '../tools/get-memory';
import { listMemories } from '../tools/list-memories';
import { deleteMemory } from '../tools/delete-memory';
import { graphQuery } from '../tools/graph-query';
import { displayMemories } from '../tools/display-memories';
import { renderMemoryCards, buildDisplayResourceHtml } from './display';

const DISPLAY_RESOURCE_URI = 'ui://memory-box/display';

/**
 * Standard tool definitions — each maps a Mastra tool to an MCP tool.
 */
const standardTools = [
  {
    name: 'membox_store',
    description:
      'Memory Box: Store a new memory. Content is automatically classified, chunked, embedded, and made searchable. Supports text, URLs, and base64 image data.',
    inputSchema: {
      content: z
        .string()
        .describe('The content to store — text, a URL, or base64 image data'),
      title: z.string().optional().describe('Optional title for the memory'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Optional tags for categorization'),
    },
    execute: storeMemory,
  },
  {
    name: 'membox_search',
    description:
      'Memory Box: Search stored memories using hybrid semantic + keyword search. Returns ranked results with snippets and summaries.',
    inputSchema: {
      query: z
        .string()
        .describe('The search query — a question, topic, or concept'),
      limit: z
        .number()
        .optional()
        .describe('Maximum number of results to return (default: 5)'),
    },
    execute: searchMemories,
  },
  {
    name: 'membox_get',
    description:
      'Memory Box: Get a specific memory by ID. Returns the full metadata and content.',
    inputSchema: {
      memoryId: z
        .string()
        .describe('The unique ID of the memory to retrieve'),
    },
    execute: getMemory,
  },
  {
    name: 'membox_list',
    description:
      'Memory Box: List stored memories with optional filters. Good for browsing what has been stored.',
    inputSchema: {
      contentType: z
        .enum(['text', 'url', 'image'])
        .optional()
        .describe('Filter by content type'),
      category: z.string().optional().describe('Filter by category'),
      tag: z.string().optional().describe('Filter by a specific tag'),
      limit: z
        .number()
        .optional()
        .describe('Maximum number of results (default: 20)'),
      skip: z
        .number()
        .optional()
        .describe('Number of results to skip for pagination'),
    },
    execute: listMemories,
  },
  {
    name: 'membox_delete',
    description:
      'Memory Box: Delete a specific memory by ID. Removes it from all stores.',
    inputSchema: {
      memoryId: z.string().describe('The unique ID of the memory to delete'),
    },
    annotations: {
      destructiveHint: true as const,
    },
    execute: deleteMemory,
  },
  {
    name: 'membox_graph',
    description:
      'Memory Box: Explore the knowledge graph. Discover relationships between memories, tag co-occurrence, category overviews, and temporal patterns.',
    inputSchema: {
      queryType: z
        .enum([
          'related-memories',
          'tag-co-occurrence',
          'top-tags',
          'top-categories',
          'tags-for-category',
          'recent-activity',
          'memory-connections',
        ])
        .describe('The type of graph query to run'),
      memoryId: z
        .string()
        .optional()
        .describe(
          'Memory ID (for related-memories and memory-connections queries)',
        ),
      tag: z
        .string()
        .optional()
        .describe('Tag name (for tag-co-occurrence query)'),
      category: z
        .string()
        .optional()
        .describe('Category name (for tags-for-category query)'),
      limit: z.number().optional().describe('Max results (default: 10)'),
    },
    execute: graphQuery,
  },
] as const;

/**
 * Register all Memory Box tools on an McpServer instance.
 */
export function registerAllTools(server: McpServer): void {
  // --- Standard tools (text-only results) ---
  for (const tool of standardTools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: 'annotations' in tool ? tool.annotations : undefined,
      },
      async (args: any) => {
        const result = await tool.execute.execute!(args);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        };
      },
    );
  }

  // --- membox_display (MCP Apps — rich card rendering) ---

  // Register the static HTML resource that serves as the card renderer shell
  registerAppResource(
    server,
    'Memory Box Display',
    DISPLAY_RESOURCE_URI,
    {
      description: 'Renders Memory Box memories as rich visual cards',
    },
    async () => {
      const html = buildDisplayResourceHtml();
      const blob = Buffer.from(html, 'utf-8').toString('base64');
      return {
        contents: [
          {
            uri: DISPLAY_RESOURCE_URI,
            mimeType: RESOURCE_MIME_TYPE,
            blob,
          },
        ],
      };
    },
  );

  // Register the display tool linked to the UI resource
  registerAppTool(
    server,
    'membox_display',
    {
      description:
        'Memory Box: Display one or more memories as rich visual cards. Pass memory IDs to show. Clients that support MCP Apps will render interactive cards; others receive structured text.',
      inputSchema: {
        memoryIds: z
          .array(z.string())
          .min(1)
          .describe('One or more memory IDs to display as cards'),
      },
      _meta: {
        ui: { resourceUri: DISPLAY_RESOURCE_URI },
      },
    },
    async (args: any) => {
      const result = await displayMemories.execute!(args);
      const memories = (result as any).memories || [];

      // React SSR: render the real dashboard card components to HTML
      const html = renderMemoryCards(memories);

      // Pass the dashboard base URL so the iframe can link to memory pages
      const port = process.env.PORT || '3001';
      const baseUrl = process.env.PUBLIC_URL
        || process.env.BASE_URL
        || `http://localhost:${port}`;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ memories, html, baseUrl }),
          },
        ],
      };
    },
  );

  // --- membox_ask (agent conversation) ---

  server.registerTool(
    'membox_ask',
    {
      description:
        'Memory Box: Ask the Memory Box agent a question. The agent can search, synthesize, and reason across your stored memories. Supports multi-turn conversations via threadId.',
      inputSchema: {
        message: z.string().describe('The message to send to the Memory Box agent'),
        threadId: z
          .string()
          .optional()
          .describe(
            'Optional thread ID for conversation continuity. Omit to start a new conversation.',
          ),
      },
    },
    async (args: { message: string; threadId?: string }) => {
      // Lazy-import to avoid circular dependency
      const { Agent } = await import('@mastra/core/agent');
      const { Mastra } = await import('@mastra/core/mastra');

      // Get or create the agent — reuse the same tools and config
      const { storeMemory } = await import('../tools/store-memory');
      const { searchMemories } = await import('../tools/search-memories');
      const { getMemory } = await import('../tools/get-memory');
      const { listMemories } = await import('../tools/list-memories');
      const { deleteMemory } = await import('../tools/delete-memory');
      const { graphQuery } = await import('../tools/graph-query');
      const { displayMemories } = await import('../tools/display-memories');

      const agent = new Agent({
        id: 'memory-box-mcp',
        name: 'Memory Box',
        instructions:
          'You are Memory Box, a personal memory storage and retrieval assistant. Help the user search, store, and explore their memories.',
        model: 'anthropic/claude-opus-4-6',
        tools: {
          storeMemory,
          searchMemories,
          getMemory,
          listMemories,
          deleteMemory,
          graphQuery,
          displayMemories,
        },
      });

      const response = await agent.generate(args.message, {
        threadId: args.threadId,
      });

      return {
        content: [{ type: 'text' as const, text: response.text }],
      };
    },
  );
}
