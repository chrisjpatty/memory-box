import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { MemoryList } from './MemoryList';

const sampleMemories = [
  {
    id: '1',
    title: 'How React Server Components Work',
    contentType: 'url',
    category: 'Engineering',
    summary: 'A deep dive into React Server Components architecture and rendering model.',
    createdAt: '2026-03-15T10:30:00Z',
  },
  {
    id: '2',
    title: 'Meeting notes: Q2 planning',
    contentType: 'text',
    category: 'Work',
    summary: 'Key decisions from the quarterly planning session including roadmap priorities.',
    createdAt: '2026-03-20T14:00:00Z',
  },
  {
    id: '3',
    title: 'Architecture diagram',
    contentType: 'image',
    category: 'Engineering',
    summary: 'System architecture overview showing service boundaries and data flow.',
    createdAt: '2026-04-01T09:15:00Z',
  },
  {
    id: '4',
    title: 'PostgreSQL performance tuning guide',
    contentType: 'url',
    category: 'Reference',
    summary: 'Practical tips for optimizing PostgreSQL query performance and indexing strategies.',
    createdAt: '2026-04-05T16:45:00Z',
  },
];

function mockFetch(memories = sampleMemories) {
  return async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/memories')) {
      const typeMatch = url.match(/type=(\w+)/);
      const filtered = typeMatch
        ? memories.filter((m) => m.contentType === typeMatch[1])
        : memories;
      return new Response(
        JSON.stringify({ memories: filtered, total: filtered.length }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response('{}', { status: 404 });
  };
}

const meta = {
  title: 'Components/MemoryList',
  component: MemoryList,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof MemoryList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  beforeEach: () => {
    window.fetch = mockFetch() as typeof fetch;
  },
};

export const Empty: Story = {
  beforeEach: () => {
    window.fetch = mockFetch([]) as typeof fetch;
  },
};

export const TextOnly: Story = {
  beforeEach: () => {
    window.fetch = mockFetch(
      sampleMemories.filter((m) => m.contentType === 'text'),
    ) as typeof fetch;
  },
};
