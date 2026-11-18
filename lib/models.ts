/**
 * Chat model selection.
 *
 * The chat model is picked at deploy time via the CHAT_MODEL agent input
 * (a dropdown in astropods.yml). Keep CHAT_MODELS in sync with the input's
 * `options` list there.
 */

export const CHAT_MODELS = [
  'claude-opus-5-5',
  'claude-sonnet-5-5',
  'claude-haiku-5-5',
  'claude-fable-5-2',
] as const;

export type ChatModel = (typeof CHAT_MODELS)[number];

export const DEFAULT_CHAT_MODEL: ChatModel = 'claude-opus-5-5';

function isChatModel(value: string): value is ChatModel {
  return (CHAT_MODELS as readonly string[]).includes(value);
}

/** Mastra model string (`anthropic/<id>`) for the configured chat model. */
export function chatModel(): `anthropic/${ChatModel}` {
  const configured = process.env.CHAT_MODEL?.trim();
  if (configured && !isChatModel(configured)) {
    console.warn(
      `[models] Unknown CHAT_MODEL "${configured}", falling back to ${DEFAULT_CHAT_MODEL}. Allowed: ${CHAT_MODELS.join(', ')}`,
    );
  }
  const id = configured && isChatModel(configured) ? configured : DEFAULT_CHAT_MODEL;
  return `anthropic/${id}`;
}
