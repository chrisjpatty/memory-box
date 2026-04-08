import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { query } from '../../../lib/db';
import { createMastra, AGENT_ID } from '../../../lib/agent';

export const conversations = new Hono();

// List conversations (most recent first)
conversations.get('/', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const result = await query(
    'SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC LIMIT $1',
    [limit],
  );
  return c.json({ conversations: result.rows });
});

// Create a new conversation (client may provide its own ID for Mastra thread alignment)
conversations.post('/', async (c) => {
  const { id: clientId, title } = await c.req.json<{ id?: string; title?: string }>();
  const id = clientId || nanoid();
  const result = await query(
    'INSERT INTO conversations (id, title) VALUES ($1, $2) RETURNING id, title, created_at, updated_at',
    [id, title || 'New conversation'],
  );
  return c.json(result.rows[0], 201);
});

// Update conversation title
conversations.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const { title } = await c.req.json<{ title: string }>();
  const result = await query(
    'UPDATE conversations SET title = $1 WHERE id = $2 RETURNING id, title, created_at, updated_at',
    [title, id],
  );
  if (result.rows.length === 0) return c.json({ error: 'Not found' }, 404);
  return c.json(result.rows[0]);
});

// Get messages for a conversation thread (from Mastra memory)
conversations.get('/:id/messages', async (c) => {
  const threadId = c.req.param('id');
  const mastra = createMastra();
  const agent = mastra.getAgentById(AGENT_ID);
  if (!agent) return c.json({ messages: [] });

  const memory = await agent.getMemory();
  if (!memory) return c.json({ messages: [] });

  try {
    const { messages: dbMessages } = await memory.recall({
      threadId,
      resourceId: 'user',
    });

    // Map MastraDBMessages to the frontend's expected format
    const messages: any[] = [];
    for (const msg of dbMessages) {
      if (msg.role === 'system') continue;

      const parts: any[] = [];
      const contentParts = msg.content?.parts ?? [];
      let textContent = '';

      for (const part of contentParts) {
        if (part.type === 'text') {
          parts.push({ type: 'text', content: part.text });
          textContent += (textContent ? '\n\n' : '') + part.text;
        } else if (part.type === 'tool-invocation') {
          parts.push({
            type: 'tool-call',
            toolCallId: part.toolInvocation.toolCallId,
            toolName: part.toolInvocation.toolName,
            args: part.toolInvocation.args ?? {},
            done: part.toolInvocation.state === 'result',
            output: part.toolInvocation.result ?? null,
          });
        }
      }

      // Fallback: if no parts but content.content exists (simple text message)
      if (parts.length === 0 && msg.content?.content) {
        textContent = msg.content.content;
        parts.push({ type: 'text', content: textContent });
      }

      messages.push({
        id: msg.id,
        role: msg.role,
        content: textContent,
        parts,
      });
    }

    return c.json({ messages });
  } catch {
    return c.json({ messages: [] });
  }
});

// Delete conversation
conversations.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await query('DELETE FROM conversations WHERE id = $1', [id]);
  return c.json({ success: true });
});
