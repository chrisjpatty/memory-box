/**
 * The agent's public origin, e.g. `https://my-agent.astropods.com`.
 *
 * When deployed with a frontend, Astropods injects ASTRO_EXTERNAL_AGENT_URL.
 * It's absent in local dev, so fall back to the request's forwarded headers
 * (or localhost when there's no request to inspect).
 */
export function publicOrigin(c?: { req: { url: string; header(name: string): string | undefined } }): string {
  const external = process.env.ASTRO_EXTERNAL_AGENT_URL?.trim();
  if (external) return external.replace(/\/+$/, '');

  if (c) {
    const url = new URL(c.req.url);
    const proto = c.req.header('x-forwarded-proto') || url.protocol.replace(':', '');
    const host = c.req.header('x-forwarded-host') || c.req.header('host') || url.host;
    return `${proto}://${host}`;
  }

  return `http://localhost:${process.env.PORT || '3001'}`;
}
