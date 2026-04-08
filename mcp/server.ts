/**
 * MCP Server for Memory Box.
 *
 * Creates an McpServer with all membox_ tools registered, manages stateful
 * sessions via WebStandardStreamableHTTPServerTransport, and exports a
 * Hono-compatible route handler.
 *
 * Each MCP client session gets its own McpServer + transport pair. Sessions are
 * tracked in a Map and cleaned up on DELETE or transport close.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { Context } from 'hono';
import { query } from '../lib/db';
import { registerAllTools } from './tools';

interface Session {
  server: McpServer;
  transport: WebStandardStreamableHTTPServerTransport;
}

const sessions = new Map<string, Session>();

/**
 * Create a new McpServer instance with all tools registered.
 * One instance per session (required by the SDK for stateful Streamable HTTP).
 */
function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: 'Memory Box',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  );

  registerAllTools(server);
  return server;
}

// --- MCP enabled check with brief cache ---

let mcpEnabledCache: { value: boolean; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000; // 30 seconds

async function isMcpEnabled(): Promise<boolean> {
  const now = Date.now();
  if (mcpEnabledCache && now < mcpEnabledCache.expiresAt) {
    return mcpEnabledCache.value;
  }
  const result = await query(
    `SELECT value FROM settings WHERE key = 'mcp_enabled'`,
  );
  const enabled = result.rows[0]?.value === 'true';
  mcpEnabledCache = { value: enabled, expiresAt: now + CACHE_TTL_MS };
  return enabled;
}

/**
 * Create a Hono-compatible route handler for the /mcp endpoint.
 *
 * Handles all three HTTP methods required by Streamable HTTP:
 *   POST — JSON-RPC messages (init + subsequent)
 *   GET  — SSE stream for server-initiated notifications
 *   DELETE — session teardown
 *
 * Returns 404 when MCP is disabled (opt-in via dashboard settings).
 * Bearer token auth should be applied as middleware BEFORE this handler.
 */
export function createMcpHandler() {
  return async (c: Context): Promise<Response> => {
    // Check if MCP is enabled (opt-in setting)
    if (!(await isMcpEnabled())) {
      return new Response('Not Found', { status: 404 });
    }

    const method = c.req.method;
    const sessionId = c.req.header('mcp-session-id');

    // --- POST: JSON-RPC messages ---
    if (method === 'POST') {
      // Check if this is an initialization request (no session ID)
      if (!sessionId) {
        // New session — create server + transport
        const server = createMcpServer();
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          onsessioninitialized: (id) => {
            sessions.set(id, { server, transport });
          },
          onsessionclosed: (id) => {
            sessions.delete(id);
          },
        });

        transport.onclose = () => {
          if (transport.sessionId) {
            sessions.delete(transport.sessionId);
          }
        };

        await server.connect(transport);
        return transport.handleRequest(c.req.raw);
      }

      // Existing session — look up transport
      const session = sessions.get(sessionId);
      if (!session) {
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Session not found' },
            id: null,
          }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return session.transport.handleRequest(c.req.raw);
    }

    // --- GET: SSE stream for server-to-client notifications ---
    if (method === 'GET') {
      if (!sessionId) {
        return new Response('Missing MCP-Session-Id header', { status: 400 });
      }

      const session = sessions.get(sessionId);
      if (!session) {
        return new Response('Session not found', { status: 404 });
      }

      return session.transport.handleRequest(c.req.raw);
    }

    // --- DELETE: session teardown ---
    if (method === 'DELETE') {
      if (!sessionId) {
        return new Response('Missing MCP-Session-Id header', { status: 400 });
      }

      const session = sessions.get(sessionId);
      if (!session) {
        return new Response('Session not found', { status: 404 });
      }

      const response = await session.transport.handleRequest(c.req.raw);
      sessions.delete(sessionId);
      return response;
    }

    return new Response('Method not allowed', { status: 405 });
  };
}
