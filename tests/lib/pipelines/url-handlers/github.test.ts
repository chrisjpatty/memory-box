import { describe, expect, test } from 'bun:test';
import { parseGitHubUrl, githubHandler, githubHeaders } from '../../../../lib/pipelines/url-handlers/github';

describe('githubHandler.match', () => {
  test('github.com → true', () => {
    expect(githubHandler.match(new URL('https://github.com/owner/repo'))).toBe(true);
  });

  test('www.github.com → true', () => {
    expect(githubHandler.match(new URL('https://www.github.com/owner/repo'))).toBe(true);
  });

  test('gitlab.com → false', () => {
    expect(githubHandler.match(new URL('https://gitlab.com/owner/repo'))).toBe(false);
  });

  test('github.io → false', () => {
    expect(githubHandler.match(new URL('https://user.github.io/repo'))).toBe(false);
  });
});

describe('parseGitHubUrl', () => {
  test('owner/repo → repo type', () => {
    const result = parseGitHubUrl(new URL('https://github.com/owner/repo'));
    expect(result).toEqual({ owner: 'owner', repo: 'repo', type: 'repo' });
  });

  test('trailing slash → repo type', () => {
    const result = parseGitHubUrl(new URL('https://github.com/owner/repo/'));
    expect(result).toEqual({ owner: 'owner', repo: 'repo', type: 'repo' });
  });

  test('issues URL → issue type with number', () => {
    const result = parseGitHubUrl(new URL('https://github.com/owner/repo/issues/42'));
    expect(result).toEqual({ owner: 'owner', repo: 'repo', type: 'issue', number: 42 });
  });

  test('pull URL → pull type with number', () => {
    const result = parseGitHubUrl(new URL('https://github.com/owner/repo/pull/7'));
    expect(result).toEqual({ owner: 'owner', repo: 'repo', type: 'pull', number: 7 });
  });

  test('discussions URL → discussion type', () => {
    const result = parseGitHubUrl(new URL('https://github.com/owner/repo/discussions/10'));
    expect(result).toEqual({ owner: 'owner', repo: 'repo', type: 'discussion', number: 10 });
  });

  test('blob URL → file type with path', () => {
    const result = parseGitHubUrl(new URL('https://github.com/owner/repo/blob/main/src/file.ts'));
    expect(result).toEqual({ owner: 'owner', repo: 'repo', type: 'file', path: 'main/src/file.ts' });
  });

  test('tree URL → file type with path', () => {
    const result = parseGitHubUrl(new URL('https://github.com/owner/repo/tree/main/src'));
    expect(result).toEqual({ owner: 'owner', repo: 'repo', type: 'file', path: 'main/src' });
  });

  test('wiki URL → other type', () => {
    const result = parseGitHubUrl(new URL('https://github.com/owner/repo/wiki'));
    expect(result).toEqual({ owner: 'owner', repo: 'repo', type: 'other' });
  });

  test('only owner (no repo) → null', () => {
    const result = parseGitHubUrl(new URL('https://github.com/owner'));
    expect(result).toBeNull();
  });

  test('root github.com → null', () => {
    const result = parseGitHubUrl(new URL('https://github.com/'));
    expect(result).toBeNull();
  });

  test('issues without number → other type', () => {
    const result = parseGitHubUrl(new URL('https://github.com/owner/repo/issues'));
    expect(result).toEqual({ owner: 'owner', repo: 'repo', type: 'other' });
  });
});

describe('githubHeaders', () => {
  test('always includes Accept and User-Agent', () => {
    const headers = githubHeaders();
    expect(headers['Accept']).toBe('application/vnd.github.v3+json');
    expect(headers['User-Agent']).toBe('MemoryBox/1.0');
  });

  test('with token param → Bearer header', () => {
    const headers = githubHeaders('ghp_test123');
    expect(headers['Authorization']).toBe('Bearer ghp_test123');
  });

  test('without token param and no env → no Authorization header', () => {
    const original = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    try {
      const headers = githubHeaders();
      expect(headers['Authorization']).toBeUndefined();
    } finally {
      if (original) process.env.GITHUB_TOKEN = original;
    }
  });
});
