import type { UrlHandler, UrlHandlerResult } from './index';
import { resolveRelativeUrls } from '../url';

const API_BASE = 'https://api.github.com';

/**
 * Thrown when GitHub returns 403/429 due to rate limiting.
 * Contains the Unix timestamp when the rate limit resets.
 */
export class GitHubRateLimitError extends Error {
  resetAt: number;
  constructor(resetAt: number) {
    super(`GitHub API rate limited. Resets at ${new Date(resetAt * 1000).toISOString()}`);
    this.resetAt = resetAt;
  }
}

export function githubHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'MemoryBox/1.0',
  };
  const resolvedToken = token || process.env.GITHUB_TOKEN;
  if (resolvedToken) {
    headers['Authorization'] = `Bearer ${resolvedToken}`;
  }
  return headers;
}

export async function githubFetch(path: string, token?: string): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: githubHeaders(token),
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status === 403 || res.status === 429) {
    const resetHeader = res.headers.get('X-RateLimit-Reset');
    const resetAt = resetHeader ? parseInt(resetHeader) : Math.floor(Date.now() / 1000) + 60;
    throw new GitHubRateLimitError(resetAt);
  }

  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${path}`);
  return res.json();
}

/**
 * Parse a GitHub URL into its component parts.
 * @internal Exported for testing.
 */
export function parseGitHubUrl(url: URL): {
  owner: string;
  repo: string;
  type: 'repo' | 'issue' | 'pull' | 'discussion' | 'file' | 'other';
  number?: number;
  path?: string;
} | null {
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;

  const [owner, repo, ...rest] = parts;

  if (rest.length === 0 || (rest.length === 1 && rest[0] === '')) {
    return { owner, repo, type: 'repo' };
  }

  if (rest[0] === 'issues' && rest[1]) {
    const num = parseInt(rest[1]);
    if (!isNaN(num)) return { owner, repo, type: 'issue', number: num };
  }

  if (rest[0] === 'pull' && rest[1]) {
    const num = parseInt(rest[1]);
    if (!isNaN(num)) return { owner, repo, type: 'pull', number: num };
  }

  if (rest[0] === 'discussions' && rest[1]) {
    const num = parseInt(rest[1]);
    if (!isNaN(num)) return { owner, repo, type: 'discussion', number: num };
  }

  if (rest[0] === 'blob' || rest[0] === 'tree') {
    return { owner, repo, type: 'file', path: rest.slice(1).join('/') };
  }

  return { owner, repo, type: 'other' };
}

// --- Handlers for different GitHub URL types ---

async function handleRepo(owner: string, repo: string, url: URL): Promise<UrlHandlerResult> {
  // Fetch repo metadata and README in parallel
  const [repoData, readmeData] = await Promise.all([
    githubFetch(`/repos/${owner}/${repo}`),
    githubFetch(`/repos/${owner}/${repo}/readme`).catch(() => null),
  ]);

  // Decode README and resolve relative URLs against raw.githubusercontent.com
  // so images like ./docs/logo.png actually render
  let readme = '';
  if (readmeData?.content) {
    const rawReadme = Buffer.from(readmeData.content, 'base64').toString('utf-8');
    const defaultBranch = repoData.default_branch || 'main';
    // README links/images should resolve relative to the directory containing the README
    const readmePath = readmeData.path || 'README.md';
    const readmeDir = readmePath.includes('/') ? readmePath.slice(0, readmePath.lastIndexOf('/') + 1) : '';
    const rawBase = `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${readmeDir}`;
    readme = resolveRelativeUrls(rawReadme, rawBase);
  }

  // Fetch languages
  let languages: Record<string, number> = {};
  try {
    languages = await githubFetch(`/repos/${owner}/${repo}/languages`);
  } catch { /* non-critical */ }

  const topLanguages = Object.entries(languages)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([lang]) => lang.toLowerCase());

  // Build the indexed content: repo overview + full README
  const sections = [
    `# ${repoData.full_name}`,
    '',
    repoData.description || '',
    '',
    `**Stars:** ${repoData.stargazers_count} | **Forks:** ${repoData.forks_count} | **Language:** ${repoData.language || 'N/A'}`,
    repoData.topics?.length ? `**Topics:** ${repoData.topics.join(', ')}` : '',
    repoData.license?.spdx_id ? `**License:** ${repoData.license.spdx_id}` : '',
    `**Last updated:** ${new Date(repoData.updated_at).toLocaleDateString()}`,
    '',
    '---',
    '',
    readme ? '## README\n\n' + readme : '*(No README)*',
  ];

  const tags = [
    'github',
    'repository',
    owner.toLowerCase(),
    ...(repoData.topics || []),
    ...topLanguages,
    repoData.language?.toLowerCase(),
  ].filter(Boolean) as string[];

  return {
    markdown: sections.join('\n').slice(0, 200_000),
    title: `${repoData.full_name} — ${repoData.description || 'GitHub Repository'}`,
    description: repoData.description || `GitHub repository: ${repoData.full_name}`,
    tags: [...new Set(tags)],
    category: 'repository',
    metadata: {
      githubType: 'repo',
      owner,
      repo,
      stars: String(repoData.stargazers_count || 0),
      forks: String(repoData.forks_count || 0),
      language: repoData.language || '',
      license: repoData.license?.spdx_id || '',
      topics: (repoData.topics || []).join(', '),
      defaultBranch: repoData.default_branch || 'main',
      createdAt: repoData.created_at || '',
      updatedAt: repoData.updated_at || '',
      url: url.href,
    },
  };
}

async function handleIssue(owner: string, repo: string, number: number, url: URL): Promise<UrlHandlerResult> {
  // Fetch issue and its comments in parallel
  const [issue, comments] = await Promise.all([
    githubFetch(`/repos/${owner}/${repo}/issues/${number}`),
    githubFetch(`/repos/${owner}/${repo}/issues/${number}/comments?per_page=50`).catch(() => []),
  ]);

  const sections = [
    `# ${issue.title}`,
    '',
    `**${owner}/${repo}#${number}** — ${issue.state} | ${issue.labels?.map((l: any) => l.name).join(', ') || 'no labels'}`,
    `**Author:** ${issue.user?.login} | **Created:** ${new Date(issue.created_at).toLocaleDateString()}`,
    issue.assignees?.length ? `**Assignees:** ${issue.assignees.map((a: any) => a.login).join(', ')}` : '',
    '',
    '---',
    '',
    issue.body || '*(No description)*',
  ];

  if (comments.length > 0) {
    sections.push('', '---', '', '## Comments', '');
    for (const c of comments) {
      sections.push(
        `### ${c.user?.login} — ${new Date(c.created_at).toLocaleDateString()}`,
        '',
        c.body || '',
        '',
      );
    }
  }

  const labels = (issue.labels || []).map((l: any) => l.name.toLowerCase());

  return {
    markdown: sections.join('\n').slice(0, 200_000),
    title: `${owner}/${repo}#${number}: ${issue.title}`,
    description: (issue.body || '').slice(0, 300),
    tags: ['github', 'issue', owner.toLowerCase(), repo.toLowerCase(), issue.state, ...labels],
    category: 'issue',
    metadata: {
      githubType: 'issue',
      owner,
      repo,
      number: String(number),
      state: issue.state,
      author: issue.user?.login || '',
      labels: labels.join(', '),
      commentCount: String(comments.length),
      url: url.href,
    },
  };
}

async function handlePullRequest(owner: string, repo: string, number: number, url: URL): Promise<UrlHandlerResult> {
  const [pr, comments] = await Promise.all([
    githubFetch(`/repos/${owner}/${repo}/pulls/${number}`),
    githubFetch(`/repos/${owner}/${repo}/issues/${number}/comments?per_page=50`).catch(() => []),
  ]);

  const sections = [
    `# ${pr.title}`,
    '',
    `**${owner}/${repo}#${number}** — ${pr.state}${pr.merged ? ' (merged)' : ''} | ${pr.labels?.map((l: any) => l.name).join(', ') || 'no labels'}`,
    `**Author:** ${pr.user?.login} | **Created:** ${new Date(pr.created_at).toLocaleDateString()}`,
    `**Base:** ${pr.base?.ref} ← **Head:** ${pr.head?.ref} | **Changed files:** ${pr.changed_files} | +${pr.additions} -${pr.deletions}`,
    pr.assignees?.length ? `**Assignees:** ${pr.assignees.map((a: any) => a.login).join(', ')}` : '',
    pr.requested_reviewers?.length ? `**Reviewers:** ${pr.requested_reviewers.map((r: any) => r.login).join(', ')}` : '',
    '',
    '---',
    '',
    pr.body || '*(No description)*',
  ];

  if (comments.length > 0) {
    sections.push('', '---', '', '## Comments', '');
    for (const c of comments) {
      sections.push(
        `### ${c.user?.login} — ${new Date(c.created_at).toLocaleDateString()}`,
        '',
        c.body || '',
        '',
      );
    }
  }

  const labels = (pr.labels || []).map((l: any) => l.name.toLowerCase());
  const state = pr.merged ? 'merged' : pr.state;

  return {
    markdown: sections.join('\n').slice(0, 200_000),
    title: `${owner}/${repo}#${number}: ${pr.title}`,
    description: (pr.body || '').slice(0, 300),
    tags: ['github', 'pull-request', owner.toLowerCase(), repo.toLowerCase(), state, ...labels],
    category: 'pull-request',
    metadata: {
      githubType: 'pull-request',
      owner,
      repo,
      number: String(number),
      state,
      author: pr.user?.login || '',
      labels: labels.join(', '),
      additions: String(pr.additions || 0),
      deletions: String(pr.deletions || 0),
      changedFiles: String(pr.changed_files || 0),
      baseBranch: pr.base?.ref || '',
      headBranch: pr.head?.ref || '',
      url: url.href,
    },
  };
}

// --- Main handler export ---

export const githubHandler: UrlHandler = {
  name: 'github',

  match(url: URL): boolean {
    return url.hostname === 'github.com' || url.hostname === 'www.github.com';
  },

  async fetch(url: URL): Promise<UrlHandlerResult> {
    const parsed = parseGitHubUrl(url);

    if (!parsed) {
      throw new Error(`Could not parse GitHub URL: ${url.href}`);
    }

    switch (parsed.type) {
      case 'repo':
        return handleRepo(parsed.owner, parsed.repo, url);

      case 'issue':
        return handleIssue(parsed.owner, parsed.repo, parsed.number!, url);

      case 'pull':
        return handlePullRequest(parsed.owner, parsed.repo, parsed.number!, url);

      // For discussions, file views, and other pages, fall through to generic handler
      default:
        throw new Error(`Unhandled GitHub URL type "${parsed.type}" — falling through to generic`);
    }
  },
};
