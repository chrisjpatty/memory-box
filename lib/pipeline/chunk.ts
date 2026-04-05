/**
 * Content-aware text chunking. Pure functions, no side effects.
 */
import { MDocument } from '@mastra/rag';
import { splitOversizedChunks } from './embed';

/**
 * Detect the content format and return the best chunking config.
 */
export function detectChunkingStrategy(content: string, contentType?: string): {
  strategy: 'markdown' | 'html' | 'recursive';
  maxSize: number;
  overlap: number;
} {
  const headingCount = (content.match(/^#{1,6}\s+/gm) || []).length;
  if (headingCount >= 2) {
    return { strategy: 'markdown', maxSize: 4096, overlap: 200 };
  }

  const htmlTagCount = (content.match(/<\/?(?:div|p|section|article|h[1-6]|ul|ol|table|pre)\b/gi) || []).length;
  if (htmlTagCount >= 3) {
    return { strategy: 'html', maxSize: 4096, overlap: 200 };
  }

  const codeSignals = (content.match(/(?:function\s|const\s|let\s|var\s|class\s|def\s|fn\s|pub\s|import\s|from\s|require\(|=>\s*\{|\)\s*\{)/gm) || []).length;
  if (codeSignals >= 3) {
    return { strategy: 'recursive', maxSize: 4096, overlap: 200 };
  }

  return { strategy: 'recursive', maxSize: 2048, overlap: 100 };
}

/**
 * Chunk text into pieces suitable for embedding.
 * Returns an array of text chunks.
 */
export async function chunkText(content: string, contentType?: string): Promise<string[]> {
  const config = detectChunkingStrategy(content, contentType);
  let chunks;

  if (config.strategy === 'markdown') {
    const doc = MDocument.fromMarkdown(content);
    chunks = await doc.chunk({
      strategy: 'markdown' as const,
      maxSize: config.maxSize,
      overlap: config.overlap,
    });
  } else if (config.strategy === 'html') {
    const doc = MDocument.fromHTML(content);
    chunks = await doc.chunk({
      strategy: 'html' as const,
      maxSize: config.maxSize,
      overlap: config.overlap,
      sections: [],
    });
  } else {
    const doc = MDocument.fromText(content);
    chunks = await doc.chunk({
      strategy: 'recursive' as const,
      maxSize: config.maxSize,
      overlap: config.overlap,
    });
  }

  const chunkTexts = chunks.map((c) => c.text).filter(Boolean) as string[];
  const safeChunks = splitOversizedChunks(chunkTexts.length > 0 ? chunkTexts : [content]);
  return safeChunks.length > 0 ? safeChunks : [content];
}
