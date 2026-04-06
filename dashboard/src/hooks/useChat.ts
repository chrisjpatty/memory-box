import { useState, useRef, useCallback, useEffect } from 'react';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface ActiveTool {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

// Advance one word per frame (~60fps = ~60 words/sec).
// This smooths out Claude's chunky deltas into a steady word-by-word stream.
function nextWordBoundary(text: string, from: number): number {
  // Skip to end of current whitespace
  let i = from;
  while (i < text.length && text[i] !== ' ' && text[i] !== '\n') i++;
  // Include the trailing space/newline
  while (i < text.length && (text[i] === ' ' || text[i] === '\n')) i++;
  return i;
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTools, setActiveTools] = useState<ActiveTool[]>([]);
  const streamingRef = useRef(false);
  const messagesRef = useRef<Message[]>([]);

  const targetTextRef = useRef('');
  const displayedLengthRef = useRef(0);
  const rafRef = useRef<number>(0);

  messagesRef.current = messages;

  // Release one word every other frame (~30 words/sec at 60fps)
  const frameCountRef = useRef(0);

  useEffect(() => {
    function tick() {
      frameCountRef.current++;
      if (frameCountRef.current % 2 !== 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const targetLen = targetTextRef.current.length;
      const displayedLen = displayedLengthRef.current;

      if (displayedLen < targetLen) {
        const nextLen = nextWordBoundary(targetTextRef.current, displayedLen);
        displayedLengthRef.current = nextLen;

        const text = targetTextRef.current.slice(0, nextLen);
        setMessages((prev) =>
          prev.map((msg, i) =>
            i === prev.length - 1 && msg.role === 'assistant'
              ? { ...msg, content: text }
              : msg,
          ),
        );
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
    setActiveTools([]);

    targetTextRef.current = '';
    displayedLengthRef.current = 0;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
    };

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
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
      let hasEndedTextSegment = false;

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
                  if (hasEndedTextSegment) {
                    targetTextRef.current += '\n\n';
                  }
                  hasEndedTextSegment = false;
                  break;

                case 'text-delta':
                  targetTextRef.current += parsed.delta;
                  break;

                case 'text-end':
                  hasEndedTextSegment = true;
                  break;

                case 'tool-input-available':
                  setActiveTools((prev) => [
                    ...prev,
                    {
                      toolCallId: parsed.toolCallId,
                      toolName: parsed.toolName,
                      args: parsed.input ?? {},
                    },
                  ]);
                  break;

                case 'tool-output-available':
                  setActiveTools((prev) =>
                    prev.filter((t) => t.toolCallId !== parsed.toolCallId),
                  );
                  break;
              }
            } catch {
              // Skip malformed events
            }
          }
        }
      }

      // Flush remaining text
      displayedLengthRef.current = targetTextRef.current.length;
      setMessages((prev) =>
        prev.map((msg, i) =>
          i === prev.length - 1 && msg.role === 'assistant'
            ? { ...msg, content: targetTextRef.current }
            : msg,
        ),
      );
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('Chat stream error:', err);
    } finally {
      streamingRef.current = false;
      setIsStreaming(false);
      setActiveTools([]);
    }
  }, []);

  return { messages, isStreaming, activeTools, send };
}
