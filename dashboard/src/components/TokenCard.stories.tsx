import type { Meta, StoryObj } from '@storybook/react-vite';
import { TokenCard } from './TokenCard';

function mockFetch(opts: {
  hasToken: boolean;
  hint?: string | null;
  generatedToken?: string;
}) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/token/hint')) {
      return new Response(
        JSON.stringify({ hint: opts.hint ?? null, hasToken: opts.hasToken }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url.includes('/api/token/generate') || url.includes('/api/token/rotate')) {
      return new Response(
        JSON.stringify({ token: opts.generatedToken ?? 'mb_abc123def456ghi789' }),
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

export const NoToken: Story = {
  beforeEach: () => {
    window.fetch = mockFetch({ hasToken: false }) as typeof fetch;
  },
};

export const WithToken: Story = {
  beforeEach: () => {
    window.fetch = mockFetch({
      hasToken: true,
      hint: 'mb_abc...789',
    }) as typeof fetch;
  },
};
