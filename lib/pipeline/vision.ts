/**
 * Vision pipeline step: generates text descriptions of images via Claude Vision.
 *
 * Standalone module that can be plugged into any pipeline that needs to
 * decorate an image with AI-generated metadata. Currently used by image
 * extraction, but designed to be reusable (e.g. for tweet media, PDFs with
 * diagrams, etc.).
 */
import sharp from 'sharp';
import { Agent } from '@mastra/core/agent';

const VISION_MAX_DIMENSION = 1024;

let visionAgent: Agent | null = null;

function getVisionAgent(): Agent {
  if (!visionAgent) {
    visionAgent = new Agent({
      id: 'image-describer',
      name: 'Image Describer',
      instructions: `You reverse-engineer images into descriptive captions — as if recovering the prompt that would have generated the image. Your output reads like image-generation metadata: dense, factual, keyword-rich.

Format: 2-4 sentences, no bullet points. Lead with the primary subject, then layer in key details: setting, style, colors, mood, any visible text, notable objects. Omit filler words and obvious observations. Think alt-text meets image-gen prompt — every word should be searchable or descriptive.

Always use proper names when you recognize them: brand names (Nike, Tesla, VS Code), public figures (politicians, celebrities, athletes), media properties (Star Wars, The Office), products, logos, landmarks, etc. If you recognize a person, name them alongside a physical description.

Examples of good output:
- "Screenshot of a dark-themed code editor showing a TypeScript file with React component code. File tree open on the left with a src/components directory expanded. Terminal panel at bottom showing green test output, 14 tests passing. VS Code with the GitHub Copilot extension visible in the sidebar."
- "Hand-drawn architecture diagram on a whiteboard with boxes labeled Auth Service, API Gateway, PostgreSQL, and Redis. Arrows show the request flow from client through gateway to services. Blue marker for happy path, red marker for error flows. Someone's hand holding a black marker in the bottom right corner."
- "Golden retriever mid-jump catching a red frisbee in a suburban park, shot from a low angle. Motion blur on the grass suggests fast movement. Late afternoon warm light casting long shadows, trees with autumn foliage in the background. Another dog watching from the far left of the frame."`,
      model: 'anthropic/claude-sonnet-4-5',
    });
  }
  return visionAgent;
}

/**
 * Prepare an image buffer for the Vision API: resize to max 1024x1024
 * and convert to JPEG for efficiency.
 */
async function prepareForVision(buffer: Buffer): Promise<{ base64: string; mimeType: string }> {
  const image = sharp(buffer);
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
  return { base64: resized.toString('base64'), mimeType: 'image/jpeg' };
}

/**
 * Generate a text description of an image using Claude Vision.
 *
 * @param buffer - Raw image bytes (any format sharp can read)
 * @param prompt - Optional custom prompt; defaults to a general description request
 * @returns The generated description, or null if vision fails
 */
export async function describeImage(
  buffer: Buffer,
  prompt = 'Describe this image:',
): Promise<string | null> {
  try {
    const vision = await prepareForVision(buffer);
    const response = await getVisionAgent().generate([
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image', image: vision.base64, mimeType: vision.mimeType },
        ],
      },
    ]);
    return response.text || null;
  } catch {
    return null;
  }
}
