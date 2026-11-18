import { describe, expect, test } from 'bun:test';
import { chatErrorMessage } from '../../lib/chat-errors';

describe('chatErrorMessage', () => {
  test('401 / invalid API key → API key message', () => {
    const err = { statusCode: 401, message: 'invalid x-api-key', data: { error: { type: 'authentication_error' } } };
    expect(chatErrorMessage(err)).toContain('API key');
  });

  test('rate limit → retry message', () => {
    expect(chatErrorMessage({ statusCode: 429 })).toContain('rate limiting');
  });

  test('overloaded → try again message', () => {
    expect(chatErrorMessage({ data: { error: { type: 'overloaded_error' } } })).toContain('overloaded');
  });

  test('unknown error → generic message without internals', () => {
    const msg = chatErrorMessage(new Error('secret stack detail at /app/node_modules'));
    expect(msg).not.toContain('/app');
    expect(msg).toContain('Something went wrong');
  });

  test('null / undefined does not throw', () => {
    expect(() => chatErrorMessage(undefined)).not.toThrow();
    expect(() => chatErrorMessage(null)).not.toThrow();
  });
});
