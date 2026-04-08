/**
 * Ingestion pipeline orchestrator.
 *
 * Pipeline: detect → dedup check → extract → classify → chunk → embed → store
 *
 * Re-exports detection/hashing functions for backwards compatibility with tests.
 */
import { detectContentType, detectFromBuffer, contentHash, bufferHash, classifyImage, classifyPdf } from './pipeline/detect';
import { extractUrl, extractImage, extractPdf } from './pipeline/extract';
import { classifyContent } from './pipeline/classify';
import { chunkText } from './pipeline/chunk';
import { getEmbeddingProvider } from './pipeline/embed';
import { checkDuplicate, store } from './pipeline/store';
import { isTweetUrl } from './pipeline/url-handlers/twitter';
import { ingestTweet } from './import/ingest-tweet';
import type { IngestRequest, IngestResult } from './types';

// Re-export for backwards compatibility with existing tests and consumers
export { detectContentType, detectFromBuffer, contentHash, bufferHash, classifyImage, classifyPdf } from './pipeline/detect';
export { resolveRelativeUrls } from './pipeline/url-utils';
export { fallbackClassify } from './pipeline/classify';
export { detectChunkingStrategy } from './pipeline/chunk';
export { splitOversizedChunks } from './pipeline/embed';

/**
 * Main ingestion entry point.
 *
 * Supports: text, URLs, images (base64), PDFs (base64 or buffer), file uploads (buffer).
 * Deduplicates by content hash and URL before ingesting.
 */
export async function ingest(request: IngestRequest): Promise<IngestResult> {
  const { content, title, tags, fileBuffer, fileName, fileMimeType } = request;

  // --- File buffer path (multipart uploads) ---
  if (fileBuffer) {
    const fileType = detectFromBuffer(fileBuffer, fileMimeType);
    const hash = bufferHash(fileBuffer);

    const dupId = await checkDuplicate(hash);
    if (dupId) {
      return { memoryId: dupId, contentType: fileType, title: title || fileName || 'Duplicate', chunks: 0, deduplicated: true, existingMemoryId: dupId };
    }

    if (fileType === 'pdf') {
      return ingestContent({
        content: '',
        hash,
        extract: () => extractPdf(fileBuffer, title),
        initialClassification: classifyPdf(title, tags, fileName),
        userTitle: title,
        userTags: tags,
      });
    }

    if (fileType === 'image') {
      const mimeType = fileMimeType || 'image/png';
      const dataUri = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
      return ingestContent({
        content: dataUri,
        hash,
        extract: () => extractImage(dataUri, title),
        initialClassification: classifyImage(dataUri, title, tags),
        userTitle: title,
        userTags: tags,
      });
    }

    // Generic file: extract text content
    const textContent = fileBuffer.toString('utf-8');
    const classification = await classifyContent(textContent, title, tags);
    classification.contentType = 'file';
    return ingestContent({
      content: textContent,
      hash,
      initialClassification: classification,
      userTitle: title,
      userTags: tags,
    });
  }

  // --- String content path ---
  const detectedType = detectContentType(content);
  const hash = contentHash(content);
  const urlForDedup = detectedType === 'url' ? content.trim() : undefined;

  const dupId = await checkDuplicate(hash, urlForDedup);
  if (dupId) {
    return { memoryId: dupId, contentType: detectedType || 'text', title: title || 'Duplicate', chunks: 0, deduplicated: true, existingMemoryId: dupId };
  }

  // PDFs as base64 data URIs
  if (detectedType === 'pdf') {
    const match = content.match(/^data:[^;]+;base64,(.+)$/);
    const buffer = Buffer.from(match ? match[1] : content, 'base64');
    return ingestContent({
      content,
      hash,
      extract: () => extractPdf(buffer, title),
      initialClassification: classifyPdf(title, tags),
      userTitle: title,
      userTags: tags,
    });
  }

  // Images: bypass classifier, use Vision
  if (detectedType === 'image') {
    return ingestContent({
      content,
      hash,
      extract: () => extractImage(content, title),
      initialClassification: classifyImage(content, title, tags),
      userTitle: title,
      userTags: tags,
    });
  }

  // Tweet URLs: try direct API ingestion first, fall through to generic URL if no token
  if (detectedType === 'url' && isTweetUrl(content)) {
    try {
      return await ingestTweet(content);
    } catch {
      // No token or API error — fall through to URL pipeline but still mark as tweet.
      // Use a stub classification instead of LLM (which can't see the tweet content from just a URL).
      // The extraction step will override title, tags, summary, metadata from the fetched content.
      const classification = {
        contentType: 'tweet' as const,
        title: title || 'Tweet',
        tags: tags || ['twitter', 'tweet'],
        category: 'tweet',
        summary: '',
        metadata: {},
      };
      return ingestContent({
        content,
        hash,
        extract: () => extractUrl(content),
        initialClassification: classification,
        userTitle: title,
        userTags: tags,
        sourceUrl: content.trim(),
      });
    }
  }

  // URLs: classify first, then extract
  if (detectedType === 'url') {
    const classification = await classifyContent(content, title, tags);
    classification.contentType = 'url';
    return ingestContent({
      content,
      hash,
      extract: () => extractUrl(content),
      initialClassification: classification,
      userTitle: title,
      userTags: tags,
      sourceUrl: content.trim(),
    });
  }

  // Text: classify and ingest directly
  const classification = await classifyContent(content, title, tags);
  return ingestContent({
    content,
    hash,
    initialClassification: classification,
    userTitle: title,
    userTags: tags,
  });
}

// --- Internal pipeline runner ---

interface IngestContentArgs {
  content: string;
  hash: string;
  extract?: () => Promise<import('./pipeline/extract').ExtractionResult>;
  initialClassification: import('./types').ClassificationResult;
  userTitle?: string;
  userTags?: string[];
  sourceUrl?: string;
}

async function ingestContent(args: IngestContentArgs): Promise<IngestResult> {
  const { content, hash, extract, initialClassification, userTitle, userTags, sourceUrl } = args;

  // Step 1: Extract (if extractor provided)
  let text = content;
  let markdown: string | undefined;
  let html: string | undefined;
  let file: { buffer: Buffer; filename: string; contentType: string } | undefined;
  let extractedSourceUrl = sourceUrl;
  let classification = initialClassification;

  if (extract) {
    const extracted = await extract();
    text = extracted.text;
    markdown = text;
    html = extracted.html;
    file = extracted.file;
    extractedSourceUrl = extracted.sourceUrl || extractedSourceUrl;

    // Merge extraction metadata into classification
    if (extracted.title && !userTitle) {
      classification.title = extracted.title;
    }
    if (extracted.tags) {
      classification.tags = [...new Set([...classification.tags, ...extracted.tags])];
    }
    if (extracted.category) {
      classification.category = extracted.category;
    }
    if (extracted.metadata) {
      classification.metadata = { ...classification.metadata, ...extracted.metadata };
    }
    if (extracted.contentType) {
      classification.contentType = extracted.contentType as any;
    }

    // Re-classify if extraction suggests it (e.g., PDF after text extraction)
    if (extracted.reclassify) {
      const reclassified = await classifyContent(text.slice(0, 10000), userTitle, userTags);
      reclassified.contentType = classification.contentType;
      reclassified.tags = [...new Set([...reclassified.tags, ...classification.tags])];
      reclassified.metadata = { ...classification.metadata, ...reclassified.metadata };
      if (userTitle) reclassified.title = userTitle;
      classification = reclassified;
    }
  }

  // Step 2: Chunk
  const chunks = await chunkText(text, classification.contentType);

  // Step 3: Embed
  const embeddings = await getEmbeddingProvider().embed(chunks);

  // Step 4: Store (single transaction)
  const result = await store({
    content,
    classification,
    chunks,
    embeddings,
    userTitle,
    userTags,
    sourceUrl: extractedSourceUrl,
    markdown,
    html,
    file,
    contentHash: hash,
  });

  return result;
}
