import { Hono } from 'hono';
import { handleChatStream } from '@mastra/ai-sdk';
import { createUIMessageStreamResponse } from 'ai';
import { createMastra, AGENT_ID } from '../../../lib/agent';

export const chat = new Hono();

chat.post('/', async (c) => {
  const mastra = createMastra();
  const params = await c.req.json();

  const stream = await handleChatStream({
    mastra,
    agentId: AGENT_ID,
    params,
  });

  // createUIMessageStreamResponse builds a Response with SSE headers and a
  // ReadableStream body. Bun's default ReadableStream buffers small writes,
  // so we re-pipe through a "direct" stream that flushes after every chunk.
  const sseResponse = createUIMessageStreamResponse({ stream });
  const sseBody = sseResponse.body;
  if (!sseBody) return sseResponse;

  const flushedStream = new ReadableStream({
    type: 'direct' as any,
    async pull(controller: any) {
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
