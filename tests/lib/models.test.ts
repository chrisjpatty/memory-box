import { afterEach, describe, expect, test } from 'bun:test';
import { chatModel, CHAT_MODELS, DEFAULT_CHAT_MODEL } from '../../lib/models';
import { publicOrigin } from '../../lib/public-url';

const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
});

describe('chatModel', () => {
  test('unset → default model', () => {
    delete process.env.CHAT_MODEL;
    expect(chatModel()).toBe(`anthropic/${DEFAULT_CHAT_MODEL}`);
  });

  test('each allowed model is passed through', () => {
    for (const id of CHAT_MODELS) {
      process.env.CHAT_MODEL = id;
      expect(chatModel()).toBe(`anthropic/${id}`);
    }
  });

  test('unknown model → default', () => {
    process.env.CHAT_MODEL = 'claude-nonexistent-1';
    expect(chatModel()).toBe(`anthropic/${DEFAULT_CHAT_MODEL}`);
  });
});

describe('publicOrigin', () => {
  const req = (url: string, headers: Record<string, string> = {}) => ({
    req: { url, header: (name: string) => headers[name.toLowerCase()] },
  });

  test('prefers ASTRO_EXTERNAL_AGENT_URL, without trailing slash', () => {
    process.env.ASTRO_EXTERNAL_AGENT_URL = 'https://box.example.com/';
    expect(publicOrigin(req('http://internal:80/x', { host: 'internal' }))).toBe('https://box.example.com');
  });

  test('falls back to forwarded headers', () => {
    delete process.env.ASTRO_EXTERNAL_AGENT_URL;
    expect(
      publicOrigin(req('http://internal/x', { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'box.example.com' })),
    ).toBe('https://box.example.com');
  });

  test('no request → localhost', () => {
    delete process.env.ASTRO_EXTERNAL_AGENT_URL;
    process.env.PORT = '3002';
    expect(publicOrigin()).toBe('http://localhost:3002');
  });
});
