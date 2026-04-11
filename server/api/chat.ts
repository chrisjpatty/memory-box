import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { handleChatStream } from '@mastra/ai-sdk';
import { createUIMessageStreamResponse } from 'ai';
import { createMastra, AGENT_ID } from '../../lib/agent';
import { query } from '../../lib/db';

export const chat = new Hono();

chat.post('/', async (c) => {
  const mastra = createMastra();
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

  const stream = await handleChatStream({
    mastra,
    agentId: AGENT_ID,
    params,
  });

  const sseResponse = createUIMessageStreamResponse({ stream });
  const sseBody = sseResponse.body;
  if (!sseBody) return sseResponse;

  const encoder = new TextEncoder();

  const flushedStream = new ReadableStream({
    type: 'direct' as any,
    async pull(controller: any) {
      // If we created a new conversation, send its ID as the first event
      if (conversationId) {
        controller.write(encoder.encode(`data: ${JSON.stringify({ type: 'conversation-created', conversationId })}\n\n`));
        controller.flush();
      }

      const reader = sseBody.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.write(value);
          controller.flush();
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(flushedStream, {
    status: sseResponse.status,
    headers: sseResponse.headers,
  });
});
