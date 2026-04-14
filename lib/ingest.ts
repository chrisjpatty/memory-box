/**
 * Ingestion pipeline orchestrator.
 *
 * Pipeline: detect → dedup check → extract → classify → chunk → embed → store
 *
 * The classifier may return "multiple" mode for content that should be split
 * into discrete items (e.g. a list of URLs). Each item is then ingested
 * independently through the full pipeline.
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
 *
 * Returns a single IngestResult for single items, or an array when the classifier
 * splits the content into multiple discrete items.
 */
export async function ingest(request: IngestRequest): Promise<IngestResult | IngestResult[]> {
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

    // Generic file: classify then ingest (files are always single items)
    const textContent = fileBuffer.toString('utf-8');
    const classifyResult = await classifyContent(textContent, title, tags);
    const classification = classifyResult.mode === 'single'
      ? classifyResult.classification
      : { contentType: 'file' as const, title: title || fileName || 'File', tags: tags || [], category: 'document', summary: textContent.slice(0, 200), metadata: {} };
    classification.contentType = 'file';
    return ingestContent({
      content: fileBuffer.toString('utf-8'),
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

  // URLs (single, already detected): classify and extract
  if (detectedType === 'url') {
    const classifyResult = await classifyContent(content, title, tags);
    // A single detected URL won't split, but handle gracefully
    const classification = classifyResult.mode === 'single'
      ? classifyResult.classification
      : { contentType: 'url' as const, title: title || content.trim(), tags: tags || [], category: 'bookmark', summary: '', metadata: {} };
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

  // --- Text content: classify (may split into multiple items) ---
  const classifyResult = await classifyContent(content, title, tags);

  if (classifyResult.mode === 'multiple' && !request._fromSplit) {
    // Classifier identified discrete items — ingest each independently
    const results = await Promise.allSettled(
      classifyResult.items.map(item =>
        ingest({ content: item.content, tags, _fromSplit: true }),
      ),
    );
    return results
      .filter((r): r is PromiseFulfilledResult<IngestResult> => r.status === 'fulfilled')
      .map(r => r.value as IngestResult);
  }

  // Single mode (or _fromSplit): ingest as one item with source text preserved
  const classification = classifyResult.mode === 'single'
    ? classifyResult.classification
    : { contentType: 'text' as const, title: title || content.slice(0, 80), tags: tags || [], category: 'note', summary: content.slice(0, 200), metadata: {} };
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
  let files: { buffer: Buffer; filename: string; contentType: string }[] | undefined;
  let localizedImages: { id: string; buffer: Buffer; contentType: string }[] | undefined;
  let extractedSourceUrl = sourceUrl;
  let classification = initialClassification;

  if (extract) {
    const extracted = await extract();
    text = extracted.text;
    markdown = text;
    html = extracted.html;
    files = extracted.files;
    localizedImages = extracted.localizedImages;
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
      const reclassification = reclassified.mode === 'single'
        ? reclassified.classification
        : { contentType: classification.contentType, title: classification.title, tags: classification.tags, category: classification.category, summary: classification.summary, metadata: classification.metadata };
      reclassification.contentType = classification.contentType;
      reclassification.tags = [...new Set([...reclassification.tags, ...classification.tags])];
      reclassification.metadata = { ...classification.metadata, ...reclassification.metadata };
      if (userTitle) reclassification.title = userTitle;
      classification = reclassification;
    }
  }

  // Step 2: Chunk
  const chunks = await chunkText(text, classification.contentType);

  // Step 3: Embed text
  const embedder = getEmbeddingProvider();
  const embeddings = await embedder.embed(chunks);

  // Step 3b: Embed images
  const imageEmbeddings: { mediaId: string; embedding: number[] }[] = [];
  if (localizedImages?.length) {
    for (const img of localizedImages) {
      try {
        const embedding = await embedder.embedImage(img.buffer.toString('base64'));
        imageEmbeddings.push({ mediaId: img.id, embedding });
      } catch { /* skip failed image embeddings */ }
    }
  }

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
    files,
    imageEmbeddings: imageEmbeddings.length > 0 ? imageEmbeddings : undefined,
    contentHash: hash,
  });

  return result;
}
