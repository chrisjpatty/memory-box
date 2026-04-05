import { PDFParse } from 'pdf-parse';
import type { ClassificationResult, IngestResult } from '../types';
import { classifyContent } from '../classifier';
import { putFile, fileKey } from '../storage';
import { ingestText } from './text';

/**
 * Ingest a PDF buffer: extract text, classify, chunk, embed, and store.
 * The original PDF is also stored in MinIO for later retrieval.
 */
export async function ingestPdf(
  buffer: Buffer,
  classification: ClassificationResult,
  userTitle?: string,
  userTags?: string[],
): Promise<IngestResult> {
  const parser = new PDFParse({ data: buffer });

  // getText() internally loads the document, then extracts text from all pages
  const textResult = await parser.getText();
  const extractedText = textResult.text?.trim();

  if (!extractedText) {
    await parser.destroy();
    throw new Error('PDF contained no extractable text');
  }

  // Get metadata (page count, title)
  let pageCount = textResult.total || 0;
  let pdfTitle = '';
  try {
    const info = await parser.getInfo();
    pageCount = info.total || pageCount;
    pdfTitle = info.info?.Title || '';
  } catch { /* info extraction is best-effort */ }

  await parser.destroy();

  // Re-classify with actual text content for better metadata
  const enrichedClassification = await classifyContent(
    extractedText.slice(0, 10000),
    userTitle,
    userTags,
  );
  enrichedClassification.contentType = 'pdf';
  enrichedClassification.title = userTitle || enrichedClassification.title || pdfTitle || classification.title;
  enrichedClassification.tags = [
    ...new Set([...enrichedClassification.tags, ...classification.tags, 'pdf']),
  ];
  enrichedClassification.metadata = {
    ...classification.metadata,
    ...enrichedClassification.metadata,
    pageCount: String(pageCount),
    pdfInfo: pdfTitle,
  };

  // Ingest extracted text through the text pipeline (gets content-aware chunking)
  const result = await ingestText(extractedText, enrichedClassification, userTitle, userTags);

  // Store original PDF in MinIO
  const key = fileKey(result.memoryId, 'original.pdf');
  await putFile(key, buffer, 'application/pdf');

  // Enrich Redis metadata with file reference and full text
  const { getRedis } = await import('../clients');
  const redis = getRedis();
  const existing = await redis.get(`memory:${result.memoryId}`);
  if (existing) {
    const meta = JSON.parse(existing);
    meta.fileKey = key;
    meta.mimeType = 'application/pdf';
    meta.markdown = extractedText.slice(0, 100_000);
    meta.processedContent = extractedText.slice(0, 5000);
    meta.extra = { ...meta.extra, pageCount: String(pageCount) };
    await redis.set(`memory:${result.memoryId}`, JSON.stringify(meta), 'EX', 86400 * 365);
  }

  return result;
}
