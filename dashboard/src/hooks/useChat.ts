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

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const streamingRef = useRef(false);
  const messagesRef = useRef<Message[]>([]);

  const completedPartsRef = useRef<MessagePart[]>([]);
  const activeTextTargetRef = useRef('');
  const smoothPosRef = useRef(0); // fractional position for smooth interpolation
  const displayedLengthRef = useRef(0); // actual snapped-to-word position
  const hasActiveTextRef = useRef(false);
  const streamDoneRef = useRef(false); // true once text-end received
  const rafRef = useRef<number>(0);

  messagesRef.current = messages;

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

    const apiMessages = [...messagesRef.current, userMessage].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Chat request failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const event of events) {
          for (const line of event.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);

              switch (parsed.type) {
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
            } catch {
              // Skip malformed events
            }
          }
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
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('Chat stream error:', err);
    } finally {
      streamingRef.current = false;
      setIsStreaming(false);
    }
  }, []);

  return { messages, isStreaming, send };
}
