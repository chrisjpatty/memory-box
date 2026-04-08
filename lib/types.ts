export type ContentType = 'text' | 'url' | 'image' | 'pdf' | 'file' | 'tweet' | 'github';

export interface MemoryMetadata {
  id: string;
  contentType: ContentType;
  title: string;
  source?: string;
  tags: string[];
  category: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
  rawContent: string;
  processedContent: string;
  markdown?: string;
  imageUrl?: string;
  mimeType?: string;
  fileKey?: string;
  contentHash?: string;
  extra: Record<string, string>;
}

export interface ClassificationResult {
  contentType: ContentType;
  title: string;
  tags: string[];
  category: string;
  summary: string;
  metadata: Record<string, string>;
}

/** Return type from classifyContent — either a single classification or a split into multiple items. */
export type ClassifyOutput =
  | { mode: 'single'; classification: ClassificationResult }
  | { mode: 'multiple'; items: { content: string }[] };

export interface IngestRequest {
  content: string;
  contentType?: string;
  title?: string;
  tags?: string[];
  /** Raw file buffer for file uploads (bypasses string-based detection) */
  fileBuffer?: Buffer;
  fileName?: string;
  fileMimeType?: string;
  /** Internal: set when this request came from a multi-item split to prevent recursive splitting */
  _fromSplit?: boolean;
}

export interface IngestResult {
  memoryId: string;
  contentType: string;
  title: string;
  chunks: number;
  /** Set when a duplicate was detected and the existing memory was returned */
  deduplicated?: boolean;
  existingMemoryId?: string;
}

export interface MemorySearchResult {
  memoryId: string;
  title: string;
  contentType: string;
  text: string;
  score: number;
  tags: string[];
  createdAt: string;
  source?: string;
}
