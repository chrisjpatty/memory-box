import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { MemoryCard } from './index';
import type { MemoryCardData } from './types';

const meta = {
  title: 'Components/MemoryCard',
  component: MemoryCard,
  args: {
    onDelete: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 400 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MemoryCard>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Text cards
// ---------------------------------------------------------------------------

export const Text: Story = {
  args: {
    memory: {
      id: 'mem-text-1',
      contentType: 'text',
      title: 'Meeting notes: Q2 planning',
      summary:
        'Key decisions from the quarterly planning session including roadmap priorities, resource allocation for the next quarter, and a shift toward event-driven architecture.',
      category: 'Work',
      tags: ['meetings', 'planning', 'q2', 'architecture'],
      createdAt: '2026-03-20T14:00:00Z',
    },
  },
};

export const TextShort: Story = {
  name: 'Text (short)',
  args: {
    memory: {
      id: 'mem-text-2',
      contentType: 'text',
      title: 'Quick thought',
      summary: 'We should look into connection pooling for the read replicas.',
      category: 'Ideas',
      tags: ['postgres'],
      createdAt: '2026-04-05T09:30:00Z',
    },
  },
};

// ---------------------------------------------------------------------------
// URL cards
// ---------------------------------------------------------------------------

export const URL: Story = {
  args: {
    memory: {
      id: 'mem-url-1',
      contentType: 'url',
      title: 'How React Server Components Work Under the Hood',
      summary:
        'A deep dive into React Server Components architecture, the wire format, and how streaming renders content progressively.',
      source: 'https://overreacted.io/react-server-components-deep-dive',
      category: 'Engineering',
      tags: ['react', 'architecture', 'frontend'],
      createdAt: '2026-03-15T10:30:00Z',
    },
  },
};

export const URLLong: Story = {
  name: 'URL (long title)',
  args: {
    memory: {
      id: 'mem-url-2',
      contentType: 'url',
      title:
        'Understanding the V8 Garbage Collector: Orinoco, Concurrent Marking, and Why Your Node.js App Keeps Pausing',
      summary:
        'Comprehensive guide to V8 memory management for backend engineers.',
      source: 'https://v8.dev/blog/trash-talk',
      category: 'Reference',
      tags: ['v8', 'node', 'performance', 'gc', 'memory'],
      createdAt: '2026-04-02T16:00:00Z',
    },
  },
};

// ---------------------------------------------------------------------------
// Image cards
// ---------------------------------------------------------------------------

export const Image: Story = {
  args: {
    memory: {
      id: 'mem-img-1',
      contentType: 'image',
      title: 'System architecture diagram',
      summary: 'Service boundaries and data flow for the ingestion pipeline.',
      category: 'Engineering',
      tags: ['architecture', 'diagram'],
      createdAt: '2026-04-01T09:15:00Z',
      hasImage: true,
      imageUrl: 'https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=640&q=80',
    },
  },
};

export const ImageNoPreview: Story = {
  name: 'Image (no preview)',
  args: {
    memory: {
      id: 'mem-img-2',
      contentType: 'image',
      title: 'Whiteboard photo from standup',
      summary: 'Sprint goals and blockers discussed during morning standup.',
      category: 'Work',
      tags: ['standup'],
      createdAt: '2026-04-03T08:00:00Z',
      hasImage: false,
    },
  },
};

// ---------------------------------------------------------------------------
// GitHub Repo cards
// ---------------------------------------------------------------------------

export const GitHubRepo: Story = {
  name: 'GitHub Repo',
  args: {
    memory: {
      id: 'mem-gh-repo-1',
      contentType: 'url',
      title: 'anthropics/claude-code',
      summary: 'Official CLI for Claude — an agentic coding assistant that lives in your terminal.',
      category: 'GitHub',
      tags: [],
      createdAt: '2026-04-01T12:00:00Z',
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
        readmeImage: 'https://images.unsplash.com/photo-1629654297299-c8506221ca97?w=640&q=80',
      },
    },
  },
};

export const GitHubRepoNoImage: Story = {
  name: 'GitHub Repo (no image)',
  args: {
    memory: {
      id: 'mem-gh-repo-1b',
      contentType: 'url',
      title: 'expressjs/express',
      summary: 'Fast, unopinionated, minimalist web framework for Node.js.',
      category: 'GitHub',
      tags: [],
      createdAt: '2026-03-20T10:00:00Z',
      extra: {
        githubType: 'repo',
        owner: 'expressjs',
        repo: 'express',
        url: 'https://github.com/expressjs/express',
        stars: '65400',
        forks: '16200',
        language: 'JavaScript',
        license: 'MIT',
        topics: 'nodejs, javascript, web, framework, api',
        defaultBranch: 'main',
        createdAt: '2010-05-27T00:00:00Z',
        updatedAt: '2026-04-05T00:00:00Z',
      },
    },
  },
};

export const GitHubRepoMinimal: Story = {
  name: 'GitHub Repo (minimal)',
  args: {
    memory: {
      id: 'mem-gh-repo-2',
      contentType: 'url',
      title: 'user/dotfiles',
      summary: 'Personal dotfiles and shell configuration.',
      category: 'GitHub',
      tags: [],
      createdAt: '2026-02-10T08:00:00Z',
      extra: {
        githubType: 'repo',
        owner: 'user',
        repo: 'dotfiles',
        url: 'https://github.com/user/dotfiles',
        stars: '3',
        forks: '0',
        language: 'Shell',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// GitHub Issue cards
// ---------------------------------------------------------------------------

export const GitHubIssue: Story = {
  name: 'GitHub Issue (open)',
  args: {
    memory: {
      id: 'mem-gh-issue-1',
      contentType: 'url',
      title: 'Add streaming support for large responses',
      summary: 'Feature request for streaming API responses.',
      category: 'GitHub',
      tags: [],
      createdAt: '2026-03-28T08:00:00Z',
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
    },
  },
};

export const GitHubIssueClosed: Story = {
  name: 'GitHub Issue (closed)',
  args: {
    memory: {
      id: 'mem-gh-issue-2',
      contentType: 'url',
      title: 'Memory leak in long-running agent sessions',
      summary: '',
      category: 'GitHub',
      tags: [],
      createdAt: '2026-03-10T11:00:00Z',
      extra: {
        githubType: 'issue',
        owner: 'anthropics',
        repo: 'claude-code',
        number: '89',
        url: 'https://github.com/anthropics/claude-code/issues/89',
        state: 'closed',
        author: 'devuser',
        commentCount: '12',
        labels: 'bug, priority/high',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// GitHub Pull Request cards
// ---------------------------------------------------------------------------

export const GitHubPR: Story = {
  name: 'GitHub PR (open)',
  args: {
    memory: {
      id: 'mem-gh-pr-1',
      contentType: 'url',
      title: 'feat: implement semantic chunking for markdown documents',
      summary: '',
      category: 'GitHub',
      tags: [],
      createdAt: '2026-04-05T14:30:00Z',
      extra: {
        githubType: 'pull-request',
        owner: 'anthropics',
        repo: 'claude-code',
        number: '156',
        url: 'https://github.com/anthropics/claude-code/pull/156',
        state: 'open',
        author: 'contributor',
        commentCount: '3',
        additions: '847',
        deletions: '123',
        changedFiles: '14',
        baseBranch: 'main',
        headBranch: 'feat/semantic-chunking',
        labels: 'feature, needs-review',
      },
    },
  },
};

export const GitHubPRMerged: Story = {
  name: 'GitHub PR (merged)',
  args: {
    memory: {
      id: 'mem-gh-pr-2',
      contentType: 'url',
      title: 'fix: resolve connection pool exhaustion under load',
      summary: '',
      category: 'GitHub',
      tags: [],
      createdAt: '2026-03-22T09:00:00Z',
      extra: {
        githubType: 'pull-request',
        owner: 'anthropics',
        repo: 'claude-code',
        number: '134',
        url: 'https://github.com/anthropics/claude-code/pull/134',
        state: 'merged',
        author: 'devuser',
        commentCount: '8',
        additions: '52',
        deletions: '31',
        changedFiles: '3',
        labels: 'bugfix',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Tweet cards
// ---------------------------------------------------------------------------

export const Tweet: Story = {
  name: 'Tweet',
  args: {
    memory: {
      id: 'mem-tweet-1',
      contentType: 'url',
      title: 'We just mass-upgraded everyone to Claude Opus 4.6...',
      summary: 'We just mass-upgraded everyone to Claude Opus 4.6 with a 1M context window.\n\nNo waitlist. No tier gate. Just go use it.\n\nThis is what happens when you actually believe in making AI accessible.',
      category: 'tweet',
      tags: ['ai', 'claude', 'anthropic'],
      createdAt: '2026-04-06T18:30:00Z',
      source: 'https://x.com/daboross/status/1234567890',
      extra: {
        tweetId: '1234567890',
        authorName: 'Dario Amodei',
        handle: 'daboross',
        avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=96&q=80',
        verified: 'true',
        likes: '48200',
        retweets: '12400',
        replies: '3100',
        views: '8700000',
      },
    },
  },
};

export const TweetWithMedia: Story = {
  name: 'Tweet (with media)',
  args: {
    memory: {
      id: 'mem-tweet-2',
      contentType: 'url',
      title: 'Shipped the new dashboard today...',
      summary: 'Shipped the new dashboard today. Dark mode only, as god intended.\n\nBuilt with React 19, Tailwind v4, and way too much coffee.',
      category: 'tweet',
      tags: ['webdev', 'react', 'shipping'],
      createdAt: '2026-04-05T14:00:00Z',
      source: 'https://x.com/devperson/status/9876543210',
      extra: {
        tweetId: '9876543210',
        authorName: 'Sarah Chen',
        handle: 'devperson',
        verified: 'false',
        likes: '842',
        retweets: '156',
        replies: '67',
        views: '52000',
        mediaUrl: 'https://images.unsplash.com/photo-1629654297299-c8506221ca97?w=640&q=80',
      },
    },
  },
};

export const TweetTwoImages: Story = {
  name: 'Tweet (2 images)',
  args: {
    memory: {
      id: 'mem-tweet-2img',
      contentType: 'url',
      title: 'Before and after of the redesign',
      summary: 'Before and after of the redesign. Sometimes all you need is better spacing and a real type scale.',
      category: 'tweet',
      tags: ['design'],
      createdAt: '2026-04-04T12:00:00Z',
      source: 'https://x.com/designer/status/3333333333',
      extra: {
        tweetId: '3333333333',
        authorName: 'Design Engineer',
        handle: 'designer',
        verified: 'false',
        likes: '1240',
        retweets: '310',
        replies: '45',
        views: '89000',
        mediaUrls:
          'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=400&q=80, https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=400&q=80',
      },
    },
  },
};

export const TweetThreeImages: Story = {
  name: 'Tweet (3 images)',
  args: {
    memory: {
      id: 'mem-tweet-3img',
      contentType: 'url',
      title: 'Some shots from the offsite',
      summary: 'Some shots from the offsite. The team deserved this one.',
      category: 'tweet',
      tags: [],
      createdAt: '2026-04-03T18:30:00Z',
      source: 'https://x.com/teamlead/status/4444444444',
      extra: {
        tweetId: '4444444444',
        authorName: 'Team Lead',
        handle: 'teamlead',
        avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=96&q=80',
        verified: 'false',
        likes: '567',
        retweets: '23',
        replies: '31',
        mediaUrls:
          'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&q=80, https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=400&q=80, https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&q=80',
      },
    },
  },
};

export const TweetFourImages: Story = {
  name: 'Tweet (4 images)',
  args: {
    memory: {
      id: 'mem-tweet-4img',
      contentType: 'url',
      title: 'New workspace setup complete',
      summary: 'New workspace setup complete. Went a little overboard but no regrets.',
      category: 'tweet',
      tags: ['setup', 'workspace'],
      createdAt: '2026-04-02T10:00:00Z',
      source: 'https://x.com/devsetup/status/5555555555',
      extra: {
        tweetId: '5555555555',
        authorName: 'Dev Setup',
        handle: 'devsetup',
        verified: 'true',
        likes: '3400',
        retweets: '890',
        replies: '210',
        views: '450000',
        mediaUrls:
          'https://images.unsplash.com/photo-1593062096033-9a26b09da705?w=400&q=80, https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?w=400&q=80, https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=400&q=80, https://images.unsplash.com/photo-1547082299-de196ea013d6?w=400&q=80',
      },
    },
  },
};

export const TweetMinimal: Story = {
  name: 'Tweet (minimal)',
  args: {
    memory: {
      id: 'mem-tweet-3',
      contentType: 'url',
      title: 'hot take: the best code is the code you delete',
      summary: 'hot take: the best code is the code you delete',
      category: 'tweet',
      tags: [],
      createdAt: '2026-04-07T09:15:00Z',
      source: 'https://x.com/randodev/status/1111111111',
      extra: {
        tweetId: '1111111111',
        authorName: 'Random Dev',
        handle: 'randodev',
        verified: 'false',
        likes: '23',
        retweets: '2',
        replies: '5',
      },
    },
  },
};

export const TweetLongThread: Story = {
  name: 'Tweet (long text)',
  args: {
    memory: {
      id: 'mem-tweet-4',
      contentType: 'url',
      title: 'Thread on database indexing...',
      summary: 'A thread on database indexing that I wish I read five years ago:\n\n1. Your ORM is lying to you about query performance\n2. EXPLAIN ANALYZE is your best friend\n3. Composite indexes are not just "multiple columns together"\n4. Partial indexes will change your life\n5. GIN indexes for JSONB queries — stop doing table scans\n\nLet me break each one down...',
      category: 'tweet',
      tags: ['databases', 'postgres', 'performance', 'engineering', 'backend'],
      createdAt: '2026-03-30T21:00:00Z',
      source: 'https://x.com/dbexpert/status/2222222222',
      extra: {
        tweetId: '2222222222',
        authorName: 'Database Whisperer',
        handle: 'dbexpert',
        avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=96&q=80',
        verified: 'true',
        likes: '15600',
        retweets: '4200',
        replies: '890',
        views: '2100000',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Excessive tags
// ---------------------------------------------------------------------------

const manyTags = [
  'react', 'typescript', 'frontend', 'architecture', 'performance',
  'server-components', 'streaming', 'ssr', 'bundling', 'webpack',
  'vite', 'tailwind', 'css-modules', 'state-management', 'zustand',
];

export const TextManyTags: Story = {
  name: 'Text (many tags)',
  args: {
    memory: {
      id: 'mem-tags-1',
      contentType: 'text',
      title: 'Frontend architecture decision record',
      summary: 'Comprehensive notes on every technology choice we evaluated for the new dashboard rewrite.',
      category: 'Engineering',
      tags: manyTags,
      createdAt: '2026-04-01T12:00:00Z',
    },
  },
};

export const URLManyTags: Story = {
  name: 'URL (many tags)',
  args: {
    memory: {
      id: 'mem-tags-2',
      contentType: 'url',
      title: 'The Complete Guide to Modern CSS Architecture',
      summary: 'Covers every major CSS methodology and tooling option available today.',
      source: 'https://css-tricks.com/modern-css-architecture-guide',
      category: 'Reference',
      tags: manyTags,
      createdAt: '2026-03-25T10:00:00Z',
    },
  },
};

export const ImageManyTags: Story = {
  name: 'Image (many tags)',
  args: {
    memory: {
      id: 'mem-tags-3',
      contentType: 'image',
      title: 'Full stack technology radar screenshot',
      summary: 'Q2 tech radar covering all adopt/trial/assess/hold categories.',
      category: 'Engineering',
      tags: manyTags,
      createdAt: '2026-04-02T15:00:00Z',
      hasImage: true,
      imageUrl: 'https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=640&q=80',
    },
  },
};

export const GitHubRepoManyTopics: Story = {
  name: 'GitHub Repo (many topics)',
  args: {
    memory: {
      id: 'mem-tags-4',
      contentType: 'url',
      title: 'vercel/next.js',
      summary: 'The React framework for the web — used by some of the largest websites in the world.',
      category: 'GitHub',
      tags: [],
      createdAt: '2026-04-03T08:00:00Z',
      extra: {
        githubType: 'repo',
        owner: 'vercel',
        repo: 'next.js',
        url: 'https://github.com/vercel/next.js',
        stars: '128000',
        forks: '27400',
        language: 'JavaScript',
        license: 'MIT',
        topics: 'react, nextjs, ssr, ssg, isr, server-components, vercel, framework, javascript, typescript, web, frontend, fullstack, edge',
        defaultBranch: 'canary',
        createdAt: '2016-10-05T00:00:00Z',
        updatedAt: '2026-04-07T00:00:00Z',
      },
    },
  },
};
