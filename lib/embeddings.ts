const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'nomic-embed-text';

function getBaseUrl(): string {
  return process.env.OLLAMA_BASE_URL
    || (process.env.OLLAMA_URL ? `${process.env.OLLAMA_URL}/api` : null)
    || 'http://localhost:11434/api';
}

/**
 * Split oversized chunks into smaller pieces at natural boundaries.
 * Used by the text pipeline to pre-split before embedding.
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

async function embedBatch(texts: string[]): Promise<number[][]> {
  const response = await fetch(`${getBaseUrl()}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
      truncate: true,
    }),
  });
  if (!response.ok) {
    throw new Error(`Ollama embed failed: ${response.status} ${await response.text()}`);
  }
  const data = await response.json() as { embeddings: number[][] };
  return data.embeddings;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const [embedding] = await embedBatch([text]);
  return embedding;
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  // Process in batches of 32 to avoid overwhelming Ollama
  const BATCH_SIZE = 32;
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const embeddings = await embedBatch(batch);
    results.push(...embeddings);
  }
  return results;
}
