import { Hono } from 'hono';
import { generateToken, listTokens, revokeToken } from '../../lib/auth';

const token = new Hono();

token.get('/', async (c) => {
  const tokens = await listTokens();
  return c.json({ tokens });
});

token.post('/create', async (c) => {
  const body = await c.req.json<{ name?: string }>();
  const name = body.name?.trim();
  if (!name) {
    return c.json({ error: 'Token name is required.' }, 400);
  }

  const newToken = await generateToken(name);
  return c.json({ token: newToken });
});

token.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    return c.json({ error: 'Invalid token ID.' }, 400);
  }
  const revoked = await revokeToken(id);
  if (!revoked) {
    return c.json({ error: 'Token not found or already revoked.' }, 404);
  }
  return c.json({ success: true });
});

export { token };
