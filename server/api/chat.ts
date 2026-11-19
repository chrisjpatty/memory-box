import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { handleChatStream } from '@mastra/ai-sdk';
import { createMastra, AGENT_ID } from '../../lib/agent';
import { query } from '../../lib/db';
import { chatErrorMessage } from '../../lib/chat-errors';
import { getRun, startRun, streamRun } from '../../lib/chat-runs';

/** Produces the agent's stream of UI message chunks for a chat request. */
export type AgentStreamFactory = (params: any) => Promise<ReadableStream<unknown>>;

const mastraAgentStream: AgentStreamFactory = (params) =>
  handleChatStream({
    mastra: createMastra(),
    agentId: AGENT_ID,
    params,
    onError: (error) => {
      console.error('[chat] stream error:', error);
      return chatErrorMessage(error);
    },
  }) as Promise<ReadableStream<unknown>>;

export function createChatRoutes(agentStream: AgentStreamFactory = mastraAgentStream) {
  const chat = new Hono();

  // Start a turn. The agent runs as a background run (lib/chat-runs.ts); this
  // response streams it from the start, and the client resumes it via
  // GET /runs/:id/stream if the connection ends before the run does.
  chat.post('/', async (c) => {
    const params = await c.req.json();

    // If no thread ID provided, create a new conversation
    let conversationId: string | null = null;
    if (!params.memory?.thread) {
      conversationId = nanoid();
      const firstMessage = params.messages?.[0]?.content ?? '';
      const title = firstMessage.length > 60 ? firstMessage.slice(0, 60) + '...' : firstMessage || 'New conversation';
      await query(
        'INSERT INTO conversations (id, title) VALUES ($1, $2)',
        [conversationId, title],
      );
      params.memory = { thread: conversationId, resource: 'user' };
    }

    const stream = await agentStream(params);
    const run = startRun(stream, {
      initialEvents: conversationId ? [{ type: 'conversation-created', conversationId }] : [],
      errorMessage: chatErrorMessage,
    });
    return streamRun(run, -1);
  });

  // Resume a run after the given event id (query `after`, or the standard
  // Last-Event-ID header). 404 once the run has expired or the server restarted.
  chat.get('/runs/:id/stream', (c) => {
    const run = getRun(c.req.param('id'));
    if (!run) return c.json({ error: 'Run not found' }, 404);
    const raw = c.req.query('after') ?? c.req.header('last-event-id') ?? '-1';
    const after = Number.parseInt(raw, 10);
    return streamRun(run, Number.isFinite(after) ? after : -1);
  });

  return chat;
}

export const chat = createChatRoutes();
