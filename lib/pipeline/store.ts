/**
 * Database storage: single Postgres transaction for memory + chunks.
 * The ONLY pipeline step that touches the database.
 */
import { nanoid } from 'nanoid';
import pgvector from 'pgvector';
import { getClient, query } from '../db';
import { putFile, fileKey, deleteFile } from '../storage';
import type { ClassificationResult } from '../types';

export interface StoreInput {
  content: string;
  classification: ClassificationResult;
  chunks: string[];
  embeddings: number[][];
  userTitle?: string;
  userTags?: string[];
  /** Source URL for URL content */
  sourceUrl?: string;
  /** Markdown content (for URL-sourced memories) */
  markdown?: string;
  /** Cleaned HTML for iframe rendering */
  html?: string;
  /** File to store in MinIO */
  file?: { buffer: Buffer; filename: string; contentType: string };
  /** Content hash for dedup */
  contentHash?: string;
}

export interface StoreResult {
  memoryId: string;
  contentType: string;
  title: string;
  chunks: number;
}

/**
 * Check if content already exists (by content hash or source URL).
 * Returns existing memory ID if duplicate, null otherwise.
 */
export async function checkDuplicate(contentHash?: string, sourceUrl?: string): Promise<string | null> {
  if (contentHash) {
    const result = await query('SELECT id FROM memories WHERE content_hash = $1', [contentHash]);
    if (result.rows.length > 0) return result.rows[0].id;
  }
  if (sourceUrl) {
    const result = await query('SELECT id FROM memories WHERE source_url = $1', [sourceUrl]);
    if (result.rows.length > 0) return result.rows[0].id;
  }
  return null;
}

/**
 * Store a memory and its chunks in a single Postgres transaction.
 * Also stores files in MinIO if provided.
 */
export async function store(input: StoreInput): Promise<StoreResult> {
  const id = nanoid(21);
  const now = new Date().toISOString();
  const {
    content, classification, chunks, embeddings,
    userTitle, userTags, sourceUrl, markdown, html, file, contentHash,
  } = input;

  const title = userTitle || classification.title;
  const tags = [...new Set([...(userTags || []), ...classification.tags])];
  const category = classification.category;
  const summary = classification.summary;

  // Store file in MinIO if provided
  let storedFileKey: string | undefined;
  let mimeType: string | undefined;
  if (file) {
    storedFileKey = fileKey(id, file.filename);
    mimeType = file.contentType;
    await putFile(storedFileKey, file.buffer, file.contentType);
  }

  // Store HTML snapshot in MinIO if provided
  let hasHtml = false;
  if (html) {
    const htmlKey = fileKey(id, 'original.html');
    await putFile(htmlKey, Buffer.from(html, 'utf-8'), 'text/html');
    hasHtml = true;
  }

  // Single transaction for memory + chunks
  const client = await getClient();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO memories (
        id, content_type, title, tags, category, summary,
        raw_content, processed_content, search_content, markdown,
        source_url, content_hash, file_key, mime_type, has_html,
        metadata, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13, $14, $15,
        $16, $17, $17
      )`,
      [
        id,
        classification.contentType,
        title,
        tags,
        category,
        summary,
        content.slice(0, 5000),
        (markdown || content).slice(0, 5000),
        (markdown || content).slice(0, 10000),
        markdown || null,
        sourceUrl || null,
        contentHash || null,
        storedFileKey || null,
        mimeType || null,
        hasHtml,
        JSON.stringify(classification.metadata || {}),
        now,
      ],
    );

    // Insert chunks with embeddings
    for (let i = 0; i < chunks.length; i++) {
      await client.query(
        `INSERT INTO memory_chunks (memory_id, chunk_index, text, embedding)
         VALUES ($1, $2, $3, $4)`,
        [id, i, chunks[i], pgvector.toSql(embeddings[i])],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return {
    memoryId: id,
    contentType: classification.contentType,
    title,
    chunks: chunks.length,
  };
}

/**
 * Delete a memory and all associated data.
 * Chunks are CASCADE deleted by Postgres. Files deleted from MinIO.
 */
export async function deleteMemory(memoryId: string): Promise<void> {
  // Get file key before deletion
  const result = await query('SELECT file_key, has_html FROM memories WHERE id = $1', [memoryId]);
  if (result.rows.length > 0) {
    const { file_key, has_html } = result.rows[0];
    if (file_key) await deleteFile(file_key);
    if (has_html) await deleteFile(fileKey(memoryId, 'original.html'));
  }

  // CASCADE deletes memory_chunks automatically
  await query('DELETE FROM memories WHERE id = $1', [memoryId]);
}
