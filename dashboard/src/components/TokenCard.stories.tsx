import type { Meta, StoryObj } from '@storybook/react-vite';
import { TokenCard } from './TokenCard';

function mockFetch(opts: {
  tokens: { id: number; name: string; hint: string; created_at: string }[];
}) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';

    if (url.endsWith('/api/token') && method === 'GET') {
      return new Response(
        JSON.stringify({ tokens: opts.tokens }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url.includes('/api/token/create') && method === 'POST') {
      return new Response(
        JSON.stringify({ token: 'mb_abc123def456ghi789jkl012mno345pqr678stu901vw' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (method === 'DELETE') {
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response('{}', { status: 404 });
  };
}

const meta = {
  title: 'Components/TokenCard',
  component: TokenCard,
} satisfies Meta<typeof TokenCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoTokens: Story = {
  beforeEach: () => {
    window.fetch = mockFetch({ tokens: [] }) as typeof fetch;
  },
};

export const WithTokens: Story = {
  beforeEach: () => {
    window.fetch = mockFetch({
      tokens: [
        { id: 1, name: 'CLI', hint: 'mb_abc1...u901', created_at: '2026-03-15T10:00:00Z' },
        { id: 2, name: 'CI/CD Pipeline', hint: 'mb_xyz9...w234', created_at: '2026-04-01T14:30:00Z' },
      ],
    }) as typeof fetch;
  },
};
