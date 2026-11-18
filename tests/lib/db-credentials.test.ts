import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { resolveCredentials, type CredentialProbe } from '../../lib/db';

const original = { ...process.env };

beforeEach(() => {
  process.env.POSTGRES_HOST = 'db';
  process.env.POSTGRES_PORT = '5432';
  process.env.POSTGRES_DB = 'memory_box';
  process.env.POSTGRES_USER = 'astro';
  process.env.POSTGRES_PASSWORD = 'generated-secret';
});

afterEach(() => {
  process.env = { ...original };
});

function pgError(code: string): Error {
  return Object.assign(new Error(`pg error ${code}`), { code });
}

/** Probe that accepts only the listed users and fails others with `code`. */
function probeAccepting(users: string[], code = '28P01') {
  const tried: string[] = [];
  const probe: CredentialProbe = async (creds) => {
    tried.push(String(creds.user));
    if (!users.includes(String(creds.user))) throw pgError(code);
  };
  return { probe, tried };
}

describe('resolveCredentials', () => {
  test('uses platform credentials when they work', async () => {
    const { probe, tried } = probeAccepting(['astro']);
    const creds = await resolveCredentials(probe);
    expect(creds.user).toBe('astro');
    expect(creds.password).toBe('generated-secret');
    expect(tried).toEqual(['astro']);
  });

  test('falls back to legacy postgres role when the platform login is rejected', async () => {
    const { probe, tried } = probeAccepting(['postgres']);
    const creds = await resolveCredentials(probe);
    expect(creds).toMatchObject({ host: 'db', user: 'postgres', password: 'postgres', database: 'memory_box' });
    expect(tried).toEqual(['astro', 'postgres']);
  });

  test('falls back on "role does not exist" (28000) too', async () => {
    const { probe } = probeAccepting(['postgres'], '28000');
    expect((await resolveCredentials(probe)).user).toBe('postgres');
  });

  test('does not fall back on connection errors', async () => {
    const tried: string[] = [];
    const probe: CredentialProbe = async (creds) => {
      tried.push(String(creds.user));
      throw pgError('ECONNREFUSED');
    };
    await expect(resolveCredentials(probe)).rejects.toMatchObject({ code: 'ECONNREFUSED' });
    expect(tried).toEqual(['astro']);
  });

  test('reports the platform failure when both logins fail', async () => {
    const { probe, tried } = probeAccepting([]);
    await expect(resolveCredentials(probe)).rejects.toMatchObject({ code: '28P01' });
    expect(tried).toEqual(['astro', 'postgres']);
  });

  test('no injected credentials → single attempt with postgres defaults', async () => {
    delete process.env.POSTGRES_USER;
    delete process.env.POSTGRES_PASSWORD;
    const { probe, tried } = probeAccepting([]);
    await expect(resolveCredentials(probe)).rejects.toMatchObject({ code: '28P01' });
    expect(tried).toEqual(['postgres']);
  });
});
