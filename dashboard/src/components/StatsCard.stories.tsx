import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatsCard } from './StatsCard';

function mockFetch(stats: { memories: number; tags: number; categories: number }) {
  return async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/stats')) {
      return new Response(JSON.stringify(stats), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('{}', { status: 404 });
  };
}

const meta = {
  title: 'Components/StatsCard',
  component: StatsCard,
} satisfies Meta<typeof StatsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  beforeEach: () => {
    window.fetch = mockFetch({ memories: 142, tags: 37, categories: 8 }) as typeof fetch;
  },
};

export const Empty: Story = {
  beforeEach: () => {
    window.fetch = mockFetch({ memories: 0, tags: 0, categories: 0 }) as typeof fetch;
  },
};

export const LargeNumbers: Story = {
  beforeEach: () => {
    window.fetch = mockFetch({ memories: 12847, tags: 523, categories: 94 }) as typeof fetch;
  },
};
