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

  return createUIMessageStreamResponse({ stream });
});
