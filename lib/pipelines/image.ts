import sharp from 'sharp';
import { Agent } from '@mastra/core/agent';
import type { ClassificationResult, IngestResult } from '../types';
import { putFile, fileKey } from '../storage';
import { ingestText } from './text';

// Max dimension for the image sent to Claude Vision.
// Claude supports up to 1568px on the long edge; we resize to stay well within that
// while keeping enough detail for a good description.
const VISION_MAX_DIMENSION = 1024;

let visionAgent: Agent | null = null;

function getVisionAgent(): Agent {
  if (!visionAgent) {
    visionAgent = new Agent({
      id: 'image-describer',
      name: 'Image Describer',
      instructions: `You are an image description specialist. Given an image, provide a detailed text description that captures:
1. The main subject and composition
2. Important details, text, or objects visible
3. Colors, mood, and style
4. Any text or numbers visible in the image
5. Context clues about what this image represents

Be thorough but concise. Your description will be used to make this image searchable in a personal memory database, so include details that someone might search for later.`,
      model: 'anthropic/claude-sonnet-4-5',
    });
  }
  return visionAgent;
}

/**
 * Detect actual image MIME type from binary magic bytes.
 */
function detectMimeType(buffer: Buffer): string {
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'image/gif';
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return 'image/webp';
  return 'image/png';
}

/**
 * Resize an image for Claude Vision. Returns a JPEG buffer and its base64.
 * Converts to JPEG to reduce payload size (PNG screenshots can be 10x larger).
 * Only resizes if the image exceeds VISION_MAX_DIMENSION on either edge.
 */
async function prepareForVision(originalBuffer: Buffer): Promise<{ base64: string; mimeType: string }> {
  const image = sharp(originalBuffer);
  const metadata = await image.metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;

  let pipeline = image;

  if (width > VISION_MAX_DIMENSION || height > VISION_MAX_DIMENSION) {
    pipeline = pipeline.resize(VISION_MAX_DIMENSION, VISION_MAX_DIMENSION, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  const resized = await pipeline.jpeg({ quality: 85 }).toBuffer();

  return {
    base64: resized.toString('base64'),
    mimeType: 'image/jpeg',
  };
}

export async function ingestImage(
  content: string,
  classification: ClassificationResult,
  userTitle?: string,
  userTags?: string[],
): Promise<IngestResult> {
  // Extract base64 data from the data URI
  let base64Data: string;
  if (content.startsWith('data:')) {
    const match = content.match(/^data:[^;]+;base64,(.+)$/);
    base64Data = match ? match[1] : content;
  } else {
    base64Data = content;
  }

  const originalBuffer = Buffer.from(base64Data, 'base64');
  const originalMimeType = detectMimeType(originalBuffer);

  // Prepare a smaller version for Claude Vision
  const vision = await prepareForVision(originalBuffer);

  // Use Claude Vision to generate a description
  let description: string;
  try {
    const response = await getVisionAgent().generate([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this image in detail for a personal memory database:' },
          { type: 'image', image: vision.base64, mimeType: vision.mimeType },
        ],
      },
    ]);
    description = response.text || 'Image (no description generated)';
  } catch (e: any) {
    description = userTitle || `Image (${originalMimeType}) - description unavailable: ${e.message}`;
  }

  // Enrich the classification
  const enrichedClassification: ClassificationResult = {
    ...classification,
    title: userTitle || classification.title || 'Image',
    summary: description.slice(0, 500),
    metadata: {
      ...classification.metadata,
      mimeType: originalMimeType,
      imageDescription: description,
    },
  };

  // Ingest the description through the text pipeline (for embedding/search)
  const result = await ingestText(description, enrichedClassification, userTitle, userTags);

  // Store the original full-res image in MinIO
  const ext = originalMimeType.split('/')[1] || 'bin';
  const key = fileKey(result.memoryId, `original.${ext}`);
  await putFile(key, originalBuffer, originalMimeType);

  // Store the file key in Redis metadata (not the image data)
  const { getRedis } = await import('../clients');
  const redis = getRedis();
  const existing = await redis.get(`memory:${result.memoryId}`);
  if (existing) {
    const meta = JSON.parse(existing);
    meta.fileKey = key;
    meta.mimeType = originalMimeType;
    meta.hasImage = true;
    meta.processedContent = description.slice(0, 2000);
    await redis.set(`memory:${result.memoryId}`, JSON.stringify(meta), 'EX', 86400 * 365);
  }

  return result;
}
