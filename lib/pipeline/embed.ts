/**
 * Pluggable embedding provider interface.
 * Default implementation: Ollama with nomic-embed-text.
 */

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  embedOne(text: string): Promise<number[]>;
  readonly dimension: number;
}

// --- Ollama Provider ---

const BATCH_SIZE = 32;

class OllamaProvider implements EmbeddingProvider {
  readonly dimension: number;
  private model: string;
  private baseUrl: string;

  constructor() {
    this.model = process.env.EMBEDDING_MODEL || 'nomic-embed-text';
    this.dimension = parseInt(process.env.EMBEDDING_DIMENSION || '768');
    this.baseUrl = process.env.OLLAMA_BASE_URL
      || (process.env.OLLAMA_URL ? `${process.env.OLLAMA_URL}/api` : null)
      || 'http://localhost:11434/api';
  }

  async embedOne(text: string): Promise<number[]> {
    const [embedding] = await this.embedBatch([text]);
    return embedding;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const embeddings = await this.embedBatch(batch);
      results.push(...embeddings);
    }
    return results;
  }

  private async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseUrl}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: texts, truncate: true }),
    });
    if (!response.ok) {
      throw new Error(`Ollama embed failed: ${response.status} ${await response.text()}`);
    }
    const data = await response.json() as { embeddings: number[][] };
    return data.embeddings;
  }
}

// --- Provider singleton ---

let provider: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (!provider) {
    provider = new OllamaProvider();
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
