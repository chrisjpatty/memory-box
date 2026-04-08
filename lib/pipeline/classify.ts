/**
 * AI classification of content for metadata enrichment.
 * Uses Haiku for fast classification, with a deterministic fallback.
 *
 * Supports two modes:
 * - "single" (default): classifies the content as one item, returns metadata only.
 *   Source text is never regenerated — it flows through the pipeline untouched.
 * - "multiple": identifies discrete items (e.g. a list of URLs) to ingest separately.
 *   Each item's content is extracted verbatim from the input.
 */
import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import type { ClassificationResult, ClassifyOutput, ContentType } from '../types';

const classificationSchema = z.object({
  mode: z.enum(['single', 'multiple']).default('single'),
  // Single mode fields — populated when mode is 'single'
  contentType: z.enum(['text', 'url', 'image', 'pdf', 'file']).default('text'),
  title: z.string().default('').describe('A concise, descriptive title for this content'),
  tags: z.preprocess(
    (val) => {
      if (typeof val === 'string') return val.split(',').map((s: string) => s.trim()).filter(Boolean);
      return val || [];
    },
    z.array(z.string()),
  ).describe('3-7 relevant tags for categorization'),
  category: z.string().default('note').describe('A category like: note, article, bookmark, recipe, reference, reminder, quote, contact, idea, document, report, code'),
  summary: z.string().default('').describe('A 1-2 sentence summary of the content'),
  metadata: z.record(z.string()).default({}).describe('Any additional structured metadata extracted from the content'),
  // Multiple mode field — populated when mode is 'multiple'
  items: z.array(z.object({
    content: z.string().describe('The exact content string for this item, copied verbatim from the input'),
  })).default([]).describe('When mode is "multiple", the discrete items to ingest separately'),
});

let classifierAgent: Agent | null = null;

function getClassifierAgent(): Agent {
  if (!classifierAgent) {
    classifierAgent = new Agent({
      id: 'memory-classifier',
      name: 'Memory Classifier',
      instructions: `You are a content classifier for a personal memory storage system. Your job is to analyze incoming content and classify it.

FIRST, determine the MODE:

**mode: "single"** (DEFAULT — use this in almost all cases):
Use "single" when the content is a coherent piece of content that should be stored as one memory. This includes:
- Any prose, note, thought, or text — even if it references or contains URLs inline
- A single URL
- An article, recipe, code snippet, or any content that forms a whole
- Mixed content where text and links together form one coherent message

When mode is "single", classify the content:
1. **contentType**: Is this plain text, a URL/link, or image data (base64/data URI)?
2. **title**: Create a concise, descriptive title. If the user provided one, prefer theirs.
3. **tags**: Generate 3-7 relevant tags for categorization and searchability.
4. **category**: Assign one category: note, article, bookmark, recipe, reference, reminder, quote, contact, idea, or another fitting single-word category.
5. **summary**: Write a 1-2 sentence summary of what this content is about.
6. **metadata**: Extract any structured data (dates, names, locations, amounts, etc.) as key-value pairs.

**mode: "multiple"** (ONLY for obviously separate items):
Use "multiple" ONLY when the content is clearly a collection of discrete, independently-ingestible items with NO substantial surrounding context. For example:
- A list of URLs separated by newlines or spaces, with no accompanying prose
- Several distinct items clearly intended to be stored separately

When mode is "multiple":
- Return each item in the "items" array
- Each item's "content" field MUST be the exact text from the input — copied verbatim, never paraphrased or modified
- Do NOT fill in the classification fields (title, tags, etc.) — each item will be classified individually downstream
- Leave the items array empty in single mode

IMPORTANT: When in doubt, ALWAYS choose "single". It is safer to store content as a whole than to risk splitting something that should stay together. The "multiple" mode exists only for cases where splitting is obviously the user's intent.

Rules for single mode:
- For URLs: contentType is "url". Extract the domain as a tag. The title should describe what the page is about if you can infer it.
- For base64 data or data URIs starting with "data:image/": contentType is "image".
- For everything else: contentType is "text".
- Always merge user-provided tags with your generated ones (no duplicates).
- Keep tags lowercase and hyphenated (e.g., "machine-learning", "new-york").`,
      model: 'anthropic/claude-haiku-4-5',
    });
  }
  return classifierAgent;
}

export async function classifyContent(
  content: string,
  userTitle?: string,
  userTags?: string[],
): Promise<ClassifyOutput> {
  const prompt = `Classify this content for memory storage. ${userTitle ? `User-provided title: "${userTitle}". ` : ''}${userTags?.length ? `User-provided tags: ${userTags.join(', ')}. ` : ''}

Content:
---
${content.slice(0, 10000)}
---`;

  try {
    const response = await getClassifierAgent().generate(prompt, {
      structuredOutput: { schema: classificationSchema },
    });

    const parsed = response.object;
    if (parsed) {
      if (parsed.mode === 'multiple' && Array.isArray(parsed.items) && parsed.items.length > 0) {
        return { mode: 'multiple', items: parsed.items };
      }
      if (parsed.contentType) {
        return {
          mode: 'single',
          classification: {
            contentType: parsed.contentType as ContentType,
            title: parsed.title || '',
            tags: Array.isArray(parsed.tags) ? parsed.tags : [],
            category: parsed.category || 'note',
            summary: parsed.summary || '',
            metadata: parsed.metadata || {},
          },
        };
      }
    }
  } catch (e) {
    console.error('Classifier agent failed, using fallback:', e);
  }

  return { mode: 'single', classification: fallbackClassify(content, userTitle, userTags) };
}

export function fallbackClassify(
  content: string,
  userTitle?: string,
  userTags?: string[],
): ClassificationResult {
  let contentType: ContentType = 'text';

  try {
    const url = new URL(content.trim());
    if (['http:', 'https:'].includes(url.protocol)) contentType = 'url';
  } catch { /* not a URL */ }

  if (content.startsWith('data:image/')) contentType = 'image';
  if (content.startsWith('data:application/pdf')) contentType = 'pdf';

  return {
    contentType,
    title: userTitle || content.slice(0, 80),
    tags: userTags || [],
    category: contentType === 'url' ? 'bookmark' : contentType === 'pdf' ? 'document' : 'note',
    summary: content.slice(0, 200),
    metadata: {},
  };
}
