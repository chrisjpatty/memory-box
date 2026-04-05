import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import type { ClassificationResult, ContentType } from './types';

const classificationSchema = z.object({
  contentType: z.enum(['text', 'url', 'image', 'pdf', 'file']),
  title: z.string().describe('A concise, descriptive title for this content'),
  tags: z.array(z.string()).describe('3-7 relevant tags for categorization'),
  category: z.string().describe('A category like: note, article, bookmark, recipe, reference, reminder, quote, contact, idea, document, report, code'),
  summary: z.string().describe('A 1-2 sentence summary of the content'),
  metadata: z.record(z.string()).describe('Any additional structured metadata extracted from the content'),
});

let classifierAgent: Agent | null = null;

function getClassifierAgent(): Agent {
  if (!classifierAgent) {
    classifierAgent = new Agent({
      id: 'memory-classifier',
      name: 'Memory Classifier',
      instructions: `You are a content classifier for a personal memory storage system. Your job is to analyze incoming content and classify it.

For each piece of content, determine:
1. **contentType**: Is this plain text, a URL/link, or image data (base64/data URI)?
2. **title**: Create a concise, descriptive title. If the user provided one, prefer theirs.
3. **tags**: Generate 3-7 relevant tags for categorization and searchability.
4. **category**: Assign one category: note, article, bookmark, recipe, reference, reminder, quote, contact, idea, or another fitting single-word category.
5. **summary**: Write a 1-2 sentence summary of what this content is about.
6. **metadata**: Extract any structured data (dates, names, locations, amounts, etc.) as key-value pairs.

Rules:
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
): Promise<ClassificationResult> {
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
    if (parsed && parsed.contentType) {
      return parsed as ClassificationResult;
    }
  } catch (e) {
    console.error('Classifier agent failed, using fallback:', e);
  }

  return fallbackClassify(content, userTitle, userTags);
}

/** @internal Exported for testing. */
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
