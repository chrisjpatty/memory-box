import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { MemoryDetail } from './MemoryDetail';

const urlMemory = {
  id: 'mem-1',
  title: 'How React Server Components Work',
  contentType: 'url',
  category: 'Engineering',
  summary: 'A deep dive into React Server Components architecture and rendering model.',
  source: 'https://example.com/react-server-components',
  tags: ['react', 'architecture', 'frontend'],
  createdAt: '2026-03-15T10:30:00Z',
  hasImage: false,
  hasHtml: true,
  markdown: `# React Server Components

React Server Components (RSC) allow you to render components on the server, reducing the amount of JavaScript sent to the client.

## Key Benefits

- **Smaller bundle size** — server components don't add to the client bundle
- **Direct data access** — query databases without an API layer
- **Streaming** — progressively render content as data loads

## How It Works

\`\`\`jsx
// This component runs only on the server
async function UserProfile({ id }) {
  const user = await db.users.find(id);
  return <div>{user.name}</div>;
}
\`\`\`

> Server Components are a fundamentally new way to think about React applications.
`,
};

const textMemory = {
  id: 'mem-2',
  title: 'Meeting notes: Q2 planning',
  contentType: 'text',
  category: 'Work',
  summary: 'Key decisions from the quarterly planning session.',
  tags: ['meetings', 'planning', 'q2'],
  createdAt: '2026-03-20T14:00:00Z',
  hasImage: false,
  hasHtml: false,
  markdown: `# Q2 Planning Notes

## Priorities
1. Ship memory-box v1.0
2. Add GitHub import feature
3. Improve search relevance

## Action Items
- [ ] Finalize API schema
- [ ] Write integration tests
- [ ] Deploy staging environment
`,
};

const githubRepoMemory = {
  id: 'mem-3',
  title: 'anthropics/claude-code',
  contentType: 'url',
  category: 'GitHub',
  summary: 'Official CLI for Claude — an AI coding assistant.',
  tags: ['github', 'ai', 'cli'],
  createdAt: '2026-04-01T12:00:00Z',
  hasImage: false,
  hasHtml: false,
  markdown: '# claude-code\n\nOfficial CLI for Claude.',
  extra: {
    githubType: 'repo',
    owner: 'anthropics',
    repo: 'claude-code',
    url: 'https://github.com/anthropics/claude-code',
    stars: '15200',
    forks: '1340',
    language: 'TypeScript',
    license: 'MIT',
    topics: 'ai, cli, claude, coding-assistant',
    defaultBranch: 'main',
    createdAt: '2025-01-15T00:00:00Z',
    updatedAt: '2026-04-06T00:00:00Z',
  },
};

const githubIssueMemory = {
  id: 'mem-4',
  title: 'Add streaming support for large responses',
  contentType: 'url',
  category: 'GitHub',
  summary: 'Feature request for streaming API responses.',
  tags: ['github', 'feature-request'],
  createdAt: '2026-03-28T08:00:00Z',
  hasImage: false,
  hasHtml: false,
  markdown: '# Add streaming support\n\nLarge responses should be streamed incrementally.',
  extra: {
    githubType: 'issue',
    owner: 'anthropics',
    repo: 'claude-code',
    number: '42',
    url: 'https://github.com/anthropics/claude-code/issues/42',
    state: 'open',
    author: 'octocat',
    commentCount: '7',
    labels: 'enhancement, help wanted',
  },
};

function mockFetch(memory: Record<string, any>) {
  return async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/memories/')) {
      return new Response(
        JSON.stringify({ found: true, memory }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response('{}', { status: 404 });
  };
}

const meta = {
  title: 'Components/MemoryDetail',
  component: MemoryDetail,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div className="text-white max-w-3xl p-6">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof MemoryDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const URLMemory: Story = {
  args: { memoryId: 'mem-1' },
  beforeEach: () => {
    window.fetch = mockFetch(urlMemory) as typeof fetch;
  },
};

export const TextMemory: Story = {
  args: { memoryId: 'mem-2' },
  beforeEach: () => {
    window.fetch = mockFetch(textMemory) as typeof fetch;
  },
};

export const GitHubRepo: Story = {
  args: { memoryId: 'mem-3' },
  beforeEach: () => {
    window.fetch = mockFetch(githubRepoMemory) as typeof fetch;
  },
};

export const GitHubIssue: Story = {
  args: { memoryId: 'mem-4' },
  beforeEach: () => {
    window.fetch = mockFetch(githubIssueMemory) as typeof fetch;
  },
};

export const NotFound: Story = {
  args: { memoryId: 'nonexistent' },
  beforeEach: () => {
    window.fetch = (async () =>
      new Response(JSON.stringify({ found: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;
  },
};
