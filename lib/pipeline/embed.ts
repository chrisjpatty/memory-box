/**
 * Embedding provider: nomic-embed-v1.5 via mindthemath/nomic-embed-v1.5 container.
 * Supports both text and image embeddings in the same 768-dim vector space.
 */

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  embedOne(text: string): Promise<number[]>;
  embedImage(base64: string): Promise<number[]>;
  readonly dimension: number;
}

class NomicProvider implements EmbeddingProvider {
  readonly dimension = 768;
  private baseUrl: string;

  constructor() {
    const host = process.env.KNOWLEDGE_EMBEDDINGS_HOST || 'localhost';
    const port = process.env.KNOWLEDGE_EMBEDDINGS_PORT || '8080';
    this.baseUrl = `http://${host}:${port}`;
  }

  async embedOne(text: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: text }),
    });
    if (!res.ok) {
      throw new Error(`Embedding failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json() as { embedding: number[] };
    return data.embedding;
  }

  async embed(texts: string[]): Promise<number[][]> {
    // Process sequentially — the slim/quantized model doesn't support batching
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.embedOne(text));
    }
    return results;
  }

  async embedImage(base64: string): Promise<number[]> {
    const dataUri = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
    const res = await fetch(`${this.baseUrl}/img/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: dataUri }),
    });
    if (!res.ok) {
      throw new Error(`Image embedding failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json() as { embedding: number[] };
    return data.embedding;
  }
}

// --- Provider singleton ---

let provider: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (!provider) {
    provider = new NomicProvider();
  }
  return provider;
}

/** Override the embedding provider (useful for testing). */
export function setEmbeddingProvider(p: EmbeddingProvider): void {
  provider = p;
}

// --- Chunk splitting utility ---

/**
 * Split oversized chunks into smaller pieces at natural boundaries.
 */
export function splitOversizedChunks(texts: string[], maxChars = 4000): string[] {
  const result: string[] = [];
  for (const text of texts) {
    if (text.length <= maxChars) {
      result.push(text);
      continue;
    }
    let remaining = text;
    while (remaining.length > maxChars) {
      let splitAt = -1;
      for (let i = maxChars - 1; i >= maxChars * 0.5; i--) {
        if ((remaining[i] === '.' || remaining[i] === '!' || remaining[i] === '?') &&
            (remaining[i + 1] === ' ' || remaining[i + 1] === '\n')) {
          splitAt = i + 1;
          break;
        }
      }
      if (splitAt === -1) {
        for (let i = maxChars - 1; i >= maxChars * 0.5; i--) {
          if (remaining[i] === ' ' || remaining[i] === '\n') {
            splitAt = i;
            break;
          }
        }
      }
      if (splitAt === -1) splitAt = maxChars;
      result.push(remaining.slice(0, splitAt).trim());
      remaining = remaining.slice(splitAt).trim();
    }
    if (remaining) result.push(remaining);
  }
  return result;
}
