import { useState, useRef, useCallback, useEffect } from 'react';

export interface TextPart {
  type: 'text';
  content: string;
}

export interface ToolCallPart {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  done: boolean;
  output?: unknown;
}

export type MessagePart = TextPart | ToolCallPart;

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  parts: MessagePart[];
  /** Set when the response failed; rendered as an error bubble. */
  error?: string;
}

function nextWordBoundary(text: string, from: number): number {
  let i = Math.ceil(from);
  if (i >= text.length) return text.length;
  while (i < text.length && text[i] !== ' ' && text[i] !== '\n') i++;
  while (i < text.length && (text[i] === ' ' || text[i] === '\n')) i++;
  return i;
}

// Smoothing factor: each frame, advance this fraction of the remaining buffer.
// 0.06 at 60fps means ~96% caught up in 50 frames (~830ms).
// This creates a smooth ease-out: fast when buffer is large, slow when small.
const SMOOTH_FACTOR = 0.06;
// Minimum chars to keep in the buffer before we stop advancing.
// Prevents catching up fully and pausing between chunks.
const MIN_BUFFER_HOLD = 4;
// Backoff between attempts to resume a dropped chat stream (consecutive
// attempts that made no progress).
const RESUME_DELAYS_MS = [250, 1000, 2000, 4000, 8000];
// The server sends a heartbeat at least every 5s, so this long with no bytes
// at all means the connection is dead even if nothing closed it (e.g. a proxy
// that swallows the upstream reset). Abort it and resume.
const STALL_TIMEOUT_MS = 15_000;

export function useChat(threadId: string, onConversationCreated?: (id: string) => void) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const streamingRef = useRef(false);
  const messagesRef = useRef<Message[]>([]);
  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;
  const loadedThreadRef = useRef<string | null>(null);
  const onConversationCreatedRef = useRef(onConversationCreated);
  onConversationCreatedRef.current = onConversationCreated;

  const completedPartsRef = useRef<MessagePart[]>([]);
  const activeTextTargetRef = useRef('');
  const smoothPosRef = useRef(0); // fractional position for smooth interpolation
  const displayedLengthRef = useRef(0); // actual snapped-to-word position
  const hasActiveTextRef = useRef(false);
  const streamDoneRef = useRef(false); // true once text-end received
  const rafRef = useRef<number>(0);

  messagesRef.current = messages;

  // Load existing messages when visiting a conversation, or clear when starting fresh
  useEffect(() => {
    if (loadedThreadRef.current === threadId) return;
    loadedThreadRef.current = threadId;

    if (!threadId) {
      setMessages([]);
      return;
    }

    setIsLoading(true);
    fetch(`/api/conversations/${threadId}/messages`, { credentials: 'include' })
      .then((res) => res.ok ? res.json() : { messages: [] })
      .then((data) => {
        if (data.messages?.length > 0) {
          setMessages(data.messages);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [threadId]);

  function buildParts(): MessagePart[] {
    const parts = [...completedPartsRef.current];
    if (hasActiveTextRef.current && displayedLengthRef.current > 0) {
      parts.push({
        type: 'text',
        content: activeTextTargetRef.current.slice(0, displayedLengthRef.current),
      });
    }
    return parts;
  }

  function setAssistantError(error: string) {
    setMessages((prev) =>
      prev.map((msg, i) =>
        i === prev.length - 1 && msg.role === 'assistant' ? { ...msg, error } : msg,
      ),
    );
  }

  async function describeHttpError(response: Response): Promise<string> {
    if (response.status === 401) return 'Your session has expired. Log in again to keep chatting.';
    try {
      const body = await response.json();
      if (typeof body?.error === 'string') return body.error;
    } catch { /* non-JSON body */ }
    return `The chat request failed (HTTP ${response.status}).`;
  }

  function flushToState() {
    const parts = buildParts();
    const content = parts
      .filter((p): p is TextPart => p.type === 'text')
      .map((p) => p.content)
      .join('\n\n');

    setMessages((prev) =>
      prev.map((msg, i) =>
        i === prev.length - 1 && msg.role === 'assistant'
          ? { ...msg, content, parts }
          : msg,
      ),
    );
  }

  useEffect(() => {
    function tick() {
      if (hasActiveTextRef.current) {
        const targetLen = activeTextTargetRef.current.length;
        const currentPos = smoothPosRef.current;
        const remaining = targetLen - currentPos;

        // If stream is done, release everything. Otherwise hold a small buffer.
        const holdThreshold = streamDoneRef.current ? 0 : MIN_BUFFER_HOLD;

        if (remaining > holdThreshold) {
          // Lerp toward target: move a fraction of the distance each frame
          const advance = remaining * SMOOTH_FACTOR;
          // Ensure we always move at least a tiny bit to avoid stalling
          const newPos = currentPos + Math.max(advance, 0.5);
          smoothPosRef.current = Math.min(newPos, targetLen);

          // Snap to word boundary for actual display
          const snapped = nextWordBoundary(activeTextTargetRef.current, smoothPosRef.current);
          if (snapped !== displayedLengthRef.current) {
            displayedLengthRef.current = Math.min(snapped, targetLen);
            flushToState();
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const send = useCallback(async (content: string) => {
    if (streamingRef.current) return;
    streamingRef.current = true;
    setIsStreaming(true);

    completedPartsRef.current = [];
    activeTextTargetRef.current = '';
    smoothPosRef.current = 0;
    displayedLengthRef.current = 0;
    hasActiveTextRef.current = false;
    streamDoneRef.current = false;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      parts: [],
    };

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      parts: [],
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    // Where we are in the server-side run (server/api/chat.ts), so a dropped
    // connection can resume instead of losing the rest of the turn.
    let runId: string | null = null;
    let lastEventId = -1;
    let finished = false;
    let streamError: string | null = null;

    function handleEvent(parsed: any) {
      switch (parsed.type) {
        case 'run-created':
          runId = parsed.runId;
          break;

        case 'conversation-created':
          threadIdRef.current = parsed.conversationId;
          loadedThreadRef.current = parsed.conversationId;
          onConversationCreatedRef.current?.(parsed.conversationId);
          break;

        case 'text-start':
          activeTextTargetRef.current = '';
          smoothPosRef.current = 0;
          displayedLengthRef.current = 0;
          hasActiveTextRef.current = true;
          streamDoneRef.current = false;
          break;

        case 'text-delta':
          activeTextTargetRef.current += parsed.delta;
          break;

        case 'text-end':
          // Signal the RAF loop to release remaining text
          streamDoneRef.current = true;
          break;

        case 'tool-input-available':
          // Finalize any active text before showing tool
          if (hasActiveTextRef.current && activeTextTargetRef.current) {
            completedPartsRef.current.push({
              type: 'text',
              content: activeTextTargetRef.current,
            });
            hasActiveTextRef.current = false;
            smoothPosRef.current = 0;
            displayedLengthRef.current = 0;
            activeTextTargetRef.current = '';
          }
          completedPartsRef.current.push({
            type: 'tool-call',
            toolCallId: parsed.toolCallId,
            toolName: parsed.toolName,
            args: parsed.input ?? {},
            done: false,
          });
          flushToState();
          break;

        case 'error':
          streamError = typeof parsed.errorText === 'string' && parsed.errorText
            ? parsed.errorText
            : 'Something went wrong generating a response.';
          break;

        case 'tool-output-available': {
          const tool = completedPartsRef.current.find(
            (p): p is ToolCallPart =>
              p.type === 'tool-call' && p.toolCallId === parsed.toolCallId,
          );
          if (tool) { tool.done = true; tool.output = parsed.output; }
          flushToState();
          break;
        }
      }
    }

    /**
     * Read one connection's events. Returns whether any new events arrived;
     * throws if the connection drops or stalls.
     */
    async function readEvents(body: ReadableStream<Uint8Array>, connection: AbortController): Promise<boolean> {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let progressed = false;
      let stallTimer = setTimeout(() => connection.abort(), STALL_TIMEOUT_MS);

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          clearTimeout(stallTimer);
          stallTimer = setTimeout(() => connection.abort(), STALL_TIMEOUT_MS);

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';

          for (const event of events) {
            let id: number | null = null;
            let data: string | null = null;
            for (const line of event.split('\n')) {
              // Lines starting with ':' are heartbeats; ignore them
              if (line.startsWith('id: ')) id = Number(line.slice(4));
              else if (line.startsWith('data: ')) data = line.slice(6);
            }
            if (data === null) continue;
            if (id !== null) {
              if (id <= lastEventId) continue; // already handled
              lastEventId = id;
            }
            progressed = true;

            if (data === '[DONE]') {
              finished = true;
              continue;
            }
            try {
              handleEvent(JSON.parse(data));
            } catch {
              // Skip malformed events
            }
          }
        }
      } finally {
        clearTimeout(stallTimer);
      }
      return progressed;
    }

    /**
     * The run is gone (expired or the server restarted). The agent may still
     * have saved its reply, so take it from the conversation if it's there.
     */
    async function recoverFromHistory(): Promise<boolean> {
      const threadId = threadIdRef.current;
      if (!threadId) return false;
      try {
        const res = await fetch(`/api/conversations/${threadId}/messages`, { credentials: 'include' });
        if (!res.ok) return false;
        const saved: Message[] = (await res.json()).messages ?? [];
        const reply = saved[saved.length - 1];
        const prompt = saved[saved.length - 2];
        if (reply?.role !== 'assistant' || prompt?.role !== 'user' || prompt.content !== content) return false;
        completedPartsRef.current = reply.parts;
        hasActiveTextRef.current = false;
        flushToState();
        return true;
      } catch {
        return false;
      }
    }

    try {
      let connection = new AbortController();
      let response: Response | null = await fetch('/api/chat', {
        signal: connection.signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          messages: [{ role: 'user', content }],
          ...(threadIdRef.current ? { memory: { thread: threadIdRef.current, resource: 'user' } } : {}),
        }),
      });

      if (!response.ok || !response.body) {
        setAssistantError(await describeHttpError(response));
        return;
      }

      // Read, and on a dropped connection resume the run after the last event
      // we saw. Give up after several attempts in a row that made no progress.
      let failures = 0;
      while (true) {
        let progressed = false;
        if (response?.ok && response.body) {
          try {
            progressed = await readEvents(response.body, connection);
          } catch {
            // Connection dropped or stalled mid-stream; resume below
          }
        }
        if (finished) break;
        if (!runId) throw new Error('Chat stream ended before the run started');

        failures = progressed ? 0 : failures + 1;
        if (failures > RESUME_DELAYS_MS.length) {
          if (!(await recoverFromHistory())) {
            setAssistantError("Couldn't reach the server. Check your connection and try again.");
          }
          return;
        }
        if (failures > 0) await new Promise((r) => setTimeout(r, RESUME_DELAYS_MS[failures - 1]));

        try {
          connection = new AbortController();
          response = await fetch(`/api/chat/runs/${runId}/stream?after=${lastEventId}`, {
            signal: connection.signal,
            credentials: 'include',
          });
        } catch {
          response = null;
          continue;
        }
        if (response.status === 404) {
          if (!(await recoverFromHistory())) {
            setAssistantError('The response was interrupted. Reload the conversation to see if it finished.');
          }
          return;
        }
        if (response.status === 401) {
          setAssistantError(await describeHttpError(response));
          return;
        }
      }

      // Final cleanup: ensure everything is displayed
      if (hasActiveTextRef.current) {
        completedPartsRef.current.push({
          type: 'text',
          content: activeTextTargetRef.current,
        });
        hasActiveTextRef.current = false;
      }
      flushToState();
      if (streamError) setAssistantError(streamError);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('Chat stream error:', err);
      setAssistantError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      streamingRef.current = false;
      setIsStreaming(false);
    }
  }, []);

  return { messages, isLoading, isStreaming, send } as const;
}
