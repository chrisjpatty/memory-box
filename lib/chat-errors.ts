/**
 * Map an error raised during a chat stream to a short, user-safe message.
 *
 * The default AI SDK behaviour serializes the whole error object into the
 * stream's `errorText`, which leaks the stack trace, system prompt, and tool
 * schemas to the browser. We log the full error server-side and only send
 * back a message the user can act on.
 */
export function chatErrorMessage(error: unknown): string {
  const err = (error ?? {}) as {
    statusCode?: number;
    message?: string;
    data?: { error?: { type?: string } };
  };
  const status = err.statusCode;
  const type = err.data?.error?.type;

  if (status === 401 || type === 'authentication_error') {
    return 'The AI provider rejected the API key. Check the Anthropic API key configured for this deployment.';
  }
  if (status === 403 || type === 'permission_error') {
    return "The configured API key doesn't have permission to use this model.";
  }
  if (status === 429 || type === 'rate_limit_error') {
    return 'The AI provider is rate limiting requests. Wait a moment and try again.';
  }
  if (status === 529 || type === 'overloaded_error') {
    return 'The AI provider is overloaded right now. Try again shortly.';
  }
  if (status !== undefined && status >= 500) {
    return 'The AI provider returned an error. Try again shortly.';
  }
  if (type === 'invalid_request_error') {
    return 'The request to the AI provider was invalid. Check the server logs for details.';
  }
  return 'Something went wrong generating a response. Check the server logs for details.';
}
