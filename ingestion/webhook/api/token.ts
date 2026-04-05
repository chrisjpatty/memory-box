import { Hono } from 'hono';
import { generateToken, revokeCurrentToken, hasActiveToken, getTokenHint } from '../../../lib/auth';

const token = new Hono();

token.get('/hint', async (c) => {
  const hint = await getTokenHint();
  const active = await hasActiveToken();
  return c.json({ hint, hasToken: active });
});

token.post('/generate', async (c) => {
  if (await hasActiveToken()) {
    return c.json({ error: 'A token already exists. Use rotate to replace it.' }, 409);
  }

  const newToken = await generateToken();
  return c.json({ token: newToken });
});

token.post('/rotate', async (c) => {
  await revokeCurrentToken();
  const newToken = await generateToken();
  return c.json({ token: newToken });
});

export { token };
