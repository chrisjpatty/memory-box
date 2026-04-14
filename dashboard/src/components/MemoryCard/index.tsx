import type { MemoryCardData, MemoryCardProps } from './types';
import { TextCard } from './TextCard';
import { URLCard } from './URLCard';
import { ImageCard } from './ImageCard';
import { GitHubCard } from './GitHubCard';
import { TweetCard } from './TweetCard';
import { PDFCard } from './PDFCard';
import { FileCard } from './FileCard';

export type { MemoryCardData, MemoryCardProps };

export function MemoryCard({ memory, onDelete, variant }: MemoryCardProps) {
  const props = { memory, onDelete, variant };
  switch (memory.contentType) {
    case 'tweet':
      return <TweetCard {...props} />;
    case 'github':
      return <GitHubCard {...props} />;
    case 'url':
      if (memory.extra?.githubType) return <GitHubCard {...props} />;
      if (memory.extra?.tweetId) return <TweetCard {...props} />;
      return <URLCard {...props} />;
    case 'image':
      return <ImageCard {...props} />;
    case 'pdf':
      return <PDFCard {...props} />;
    case 'file':
      return <FileCard {...props} />;
    case 'text':
    default:
      return <TextCard {...props} />;
  }
}
