import { MDocument } from '@mastra/rag';
import { nanoid } from 'nanoid';
import { getQdrant, getRedis, getNeo4j, QDRANT_INDEX_NAME, EMBEDDING_DIMENSION } from '../clients';
import { generateEmbeddings, splitOversizedChunks } from '../embeddings';
import type { ClassificationResult, IngestResult, MemoryMetadata } from '../types';

let indexReady = false;

async function ensureIndex() {
  if (indexReady) return;
  const qdrant = getQdrant();
  try {
    await qdrant.createIndex({
      indexName: QDRANT_INDEX_NAME,
      dimension: EMBEDDING_DIMENSION,
    });
  } catch (e: any) {
    if (!e.message?.includes('already exists')) throw e;
  }
  indexReady = true;
}

/**
 * Detect the content format and return the best chunking config.
 * Uses heuristics to pick between markdown, html, and recursive strategies.
 */
function detectChunkingStrategy(content: string, contentType?: string): {
  strategy: 'markdown' | 'html' | 'recursive';
  maxSize: number;
  overlap: number;
} {
  // With nomic-embed-text (8K token context), we can use much larger chunks
  // for better semantic coherence. ~4 chars/token means 8K tokens ≈ 32K chars.
  // We use 2048-4096 char chunks to balance context richness with granularity.

  // Markdown: has multiple heading lines
  const headingCount = (content.match(/^#{1,6}\s+/gm) || []).length;
  if (headingCount >= 2) {
    return { strategy: 'markdown', maxSize: 4096, overlap: 200 };
  }

  // HTML: has significant HTML tags
  const htmlTagCount = (content.match(/<\/?(?:div|p|section|article|h[1-6]|ul|ol|table|pre)\b/gi) || []).length;
  if (htmlTagCount >= 3) {
    return { strategy: 'html', maxSize: 4096, overlap: 200 };
  }

  // Code: high density of code patterns
  const codeSignals = (content.match(/(?:function\s|const\s|let\s|var\s|class\s|def\s|fn\s|pub\s|import\s|from\s|require\(|=>\s*\{|\)\s*\{)/gm) || []).length;
  if (codeSignals >= 3) {
    return { strategy: 'recursive', maxSize: 4096, overlap: 200 };
  }

  // Default: standard recursive chunking for plain text
  return { strategy: 'recursive', maxSize: 2048, overlap: 100 };
}

export async function ingestText(
  content: string,
  classification: ClassificationResult,
  userTitle?: string,
  userTags?: string[],
): Promise<IngestResult> {
  await ensureIndex();

  const id = nanoid(21);
  const now = new Date().toISOString();

  const metadata: MemoryMetadata = {
    id,
    contentType: classification.contentType,
    title: userTitle || classification.title,
    tags: [...new Set([...(userTags || []), ...classification.tags])],
    category: classification.category,
    summary: classification.summary,
    createdAt: now,
    updatedAt: now,
    rawContent: content.slice(0, 5000),
    processedContent: content.slice(0, 2000),
    extra: classification.metadata,
  };

  // Content-aware chunking: pick the best strategy for this content
  const chunkConfig = detectChunkingStrategy(content, classification.contentType);
  let chunks;

  if (chunkConfig.strategy === 'markdown') {
    const doc = MDocument.fromMarkdown(content);
    chunks = await doc.chunk({
      strategy: 'markdown' as const,
      maxSize: chunkConfig.maxSize,
      overlap: chunkConfig.overlap,
    });
  } else if (chunkConfig.strategy === 'html') {
    const doc = MDocument.fromHTML(content);
    chunks = await doc.chunk({
      strategy: 'html' as const,
      maxSize: chunkConfig.maxSize,
      overlap: chunkConfig.overlap,
      sections: [],
    });
  } else {
    const doc = MDocument.fromText(content);
    chunks = await doc.chunk({
      strategy: 'recursive' as const,
      maxSize: chunkConfig.maxSize,
      overlap: chunkConfig.overlap,
    });
  }
  const chunkTexts = chunks.map((c) => c.text).filter(Boolean) as string[];
  // Re-split any chunks that exceed the embedding model's context window
  const safeChunks = splitOversizedChunks(chunkTexts.length > 0 ? chunkTexts : [content]);
  const textsToEmbed = safeChunks.length > 0 ? safeChunks : [content];

  // Generate embeddings
  const embeddings = await generateEmbeddings(textsToEmbed);

  // Store in Qdrant
  const qdrant = getQdrant();
  await qdrant.upsert({
    indexName: QDRANT_INDEX_NAME,
    vectors: embeddings,
    metadata: textsToEmbed.map((text, i) => ({
      text,
      memoryId: id,
      chunkIndex: i,
      title: metadata.title,
      contentType: metadata.contentType,
      tags: metadata.tags,
      category: metadata.category,
      summary: metadata.summary,
      createdAt: metadata.createdAt,
      source: metadata.source,
    })),
  });

  // Cache in Redis
  const redis = getRedis();
  await redis.set(`memory:${id}`, JSON.stringify(metadata), 'EX', 86400 * 365);

  // Store in Neo4j (include searchContent for fulltext hybrid search)
  const driver = getNeo4j();
  const session = driver.session();
  try {
    await session.run(
      `MERGE (m:Memory {id: $id})
       SET m.title = $title,
           m.contentType = $contentType,
           m.category = $category,
           m.createdAt = $createdAt,
           m.summary = $summary,
           m.searchContent = $searchContent
       WITH m
       UNWIND $tags AS tag
       MERGE (t:Tag {name: tag})
       MERGE (m)-[:TAGGED]->(t)
       WITH m
       MERGE (c:Category {name: $category})
       MERGE (m)-[:CATEGORIZED]->(c)`,
      {
        id,
        title: metadata.title,
        contentType: metadata.contentType,
        category: metadata.category,
        createdAt: metadata.createdAt,
        summary: metadata.summary,
        searchContent: content.slice(0, 10000),
        tags: metadata.tags,
      },
    );
  } finally {
    await session.close();
  }

  return {
    memoryId: id,
    contentType: metadata.contentType,
    title: metadata.title,
    chunks: textsToEmbed.length,
  };
}
