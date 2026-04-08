import type { MemoryCardData, MemoryCardProps } from './types';
import { TextCard } from './TextCard';
import { URLCard } from './URLCard';
import { ImageCard } from './ImageCard';
import { GitHubCard } from './GitHubCard';
import { TweetCard } from './TweetCard';
import { PDFCard } from './PDFCard';
import { FileCard } from './FileCard';

export type { MemoryCardData, MemoryCardProps };

export function MemoryCard({ memory, onDelete }: MemoryCardProps) {
  // GitHub memories are stored as contentType 'url' with extra.githubType
  if (memory.extra?.githubType) {
    return <GitHubCard memory={memory} onDelete={onDelete} />;
  }

  // Tweet memories are stored as contentType 'url' with extra.tweetId
  if (memory.extra?.tweetId) {
    return <TweetCard memory={memory} onDelete={onDelete} />;
  }

  switch (memory.contentType) {
    case 'url':
      return <URLCard memory={memory} onDelete={onDelete} />;
    case 'image':
      return <ImageCard memory={memory} onDelete={onDelete} />;
    case 'pdf':
      return <PDFCard memory={memory} onDelete={onDelete} />;
    case 'file':
      return <FileCard memory={memory} onDelete={onDelete} />;
    case 'text':
    default:
      return <TextCard memory={memory} onDelete={onDelete} />;
  }
}
