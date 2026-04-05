import { Hono } from 'hono';
import { getRedis } from '../../../lib/clients';
import { generateToken, revokeCurrentToken, hasActiveToken, getTokenHint } from '../../../lib/auth';

const token = new Hono();

token.get('/hint', async (c) => {
  const redis = getRedis();
  const hint = await getTokenHint(redis);
  const active = await hasActiveToken(redis);
  return c.json({ hint, hasToken: active });
});

token.post('/generate', async (c) => {
  const redis = getRedis();

  if (await hasActiveToken(redis)) {
    return c.json({ error: 'A token already exists. Use rotate to replace it.' }, 409);
  }

  const newToken = await generateToken(redis);
  return c.json({ token: newToken });
});

token.post('/rotate', async (c) => {
  const redis = getRedis();
  await revokeCurrentToken(redis);
  const newToken = await generateToken(redis);
  return c.json({ token: newToken });
});

export { token };
