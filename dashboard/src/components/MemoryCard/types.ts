export type ContentType = 'text' | 'url' | 'image' | 'pdf' | 'file' | 'tweet' | 'github';

export interface MemoryCardData {
  id: string;
  title: string;
  contentType: ContentType;
  category: string;
  summary: string;
  tags: string[];
  createdAt: string;
  source?: string;
  hasImage?: boolean;
  imageUrl?: string;
  extra?: Record<string, string>;
}

export interface MemoryCardProps {
  memory: MemoryCardData;
  onDelete?: (id: string) => void;
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function formatCount(n: string | number): string {
  const num = typeof n === 'string' ? parseInt(n, 10) : n;
  if (num >= 1000) return `${(num / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(num);
}
