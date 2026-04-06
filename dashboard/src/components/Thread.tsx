import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { Streamdown } from 'streamdown';
import 'streamdown/styles.css';
import { useChat, type ToolCallPart } from '../hooks/useChat';

function getToolLabel(toolName: string, args: Record<string, unknown>): { action: string; past: string; detail?: string } {
  switch (toolName) {
    case 'searchMemories':
      return { action: 'Searching memories', past: 'Searched memories', detail: args.query as string };
    case 'storeMemory':
      return { action: 'Saving memory', past: 'Saved memory', detail: args.title as string };
    case 'listMemories': {
      const filters = [args.category, args.tag, args.contentType].filter(Boolean) as string[];
      return { action: 'Browsing memories', past: 'Browsed memories', detail: filters.length ? filters.join(', ') : undefined };
    }
    case 'graphQuery': {
      const context = (args.tag ?? args.category) as string | undefined;
      return { action: 'Exploring connections', past: 'Explored connections', detail: context };
    }
    case 'getMemory':
      return { action: 'Retrieving memory', past: 'Retrieved memory' };
    case 'deleteMemory':
      return { action: 'Deleting memory', past: 'Deleted memory' };
    default:
      return { action: toolName, past: toolName };
  }
}

function getToolSummary(tools: ToolCallPart[]): string {
  const pastLabels = [...new Set(tools.map((t) => getToolLabel(t.toolName, t.args).past))];
  if (pastLabels.length <= 2) return pastLabels.join(' & ');
  return `${pastLabels.slice(0, -1).join(', ')} & ${pastLabels[pastLabels.length - 1]}`;
}

function Spinner() {
  return (
    <span className="inline-flex gap-1 items-center">
      <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-[pulse_1.4s_ease-in-out_infinite]" />
      <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" />
      <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" />
    </span>
  );
}

function ShimmerText({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="animate-[shimmer_1.5s_ease-in-out_infinite]"
      style={{
        backgroundImage: 'linear-gradient(90deg, #737373 0%, #a3a3a3 40%, #e5e5e5 50%, #a3a3a3 60%, #737373 100%)',
        backgroundSize: '200% 100%',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
      }}
    >
      {children}
    </span>
  );
}

function ToolStrip({ tools }: { tools: ToolCallPart[] }) {
  const [expanded, setExpanded] = useState(false);
  const [displayedTool, setDisplayedTool] = useState<ToolCallPart | null>(null);
  const [animating, setAnimating] = useState<'enter' | 'exit' | null>(null);
  const pendingRef = useRef<ToolCallPart | null>(null);

  const allDone = tools.length > 0 && tools.every((t) => t.done);
  const activeTool = !allDone ? [...tools].reverse().find((t) => !t.done) ?? null : null;

  // Rotate active tool with enter/exit animation
  useEffect(() => {
    if (allDone) return;
    if (activeTool === displayedTool) return;
    if (activeTool && !displayedTool) {
      // First tool — just enter
      setDisplayedTool(activeTool);
      setAnimating('enter');
      const t = setTimeout(() => setAnimating(null), 200);
      return () => clearTimeout(t);
    }
    if (activeTool && displayedTool) {
      // Swap — exit old, then enter new
      pendingRef.current = activeTool;
      setAnimating('exit');
      const t = setTimeout(() => {
        setDisplayedTool(pendingRef.current);
        pendingRef.current = null;
        setAnimating('enter');
        setTimeout(() => setAnimating(null), 200);
      }, 150);
      return () => clearTimeout(t);
    }
  }, [activeTool?.toolCallId, allDone]);

  if (tools.length === 0) return null;

  // All done — show summary with optional dropdown
  if (allDone) {
    const summary = getToolSummary(tools);
    if (tools.length === 1) {
      const { past, detail } = getToolLabel(tools[0].toolName, tools[0].args);
      return (
        <div className="text-xs text-neutral-500 italic">
          {past}{detail ? ` "${detail}"` : ''}
        </div>
      );
    }
    return (
      <div className="text-xs text-neutral-500 italic">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 hover:text-neutral-400 transition-colors cursor-pointer"
        >
          <span>{summary}</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
          >
            <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        </button>
        {expanded && (
          <div className="mt-1 flex flex-col gap-0.5 pl-2 border-l border-neutral-800">
            {tools.map((t) => {
              const { past, detail } = getToolLabel(t.toolName, t.args);
              return (
                <span key={t.toolCallId}>
                  {past}{detail ? ` "${detail}"` : ''}
                </span>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Streaming — show rotating active tool
  if (!displayedTool) return null;
  const { action, detail } = getToolLabel(displayedTool.toolName, displayedTool.args);
  const animClass =
    animating === 'enter' ? 'animate-[tool-enter_0.2s_ease-out]' :
    animating === 'exit' ? 'animate-[tool-exit_0.15s_ease-in_forwards]' : '';

  return (
    <div className="text-xs italic overflow-hidden h-4">
      <div className={animClass} key={displayedTool.toolCallId}>
        <ShimmerText>
          {action}{detail ? ` "${detail}"` : ''}
        </ShimmerText>
      </div>
    </div>
  );
}

export function Thread() {
  const { messages, isStreaming, send } = useChat();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput('');
    send(text);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <h1 className="text-2xl font-bold mb-2">Memory Box</h1>
            <p className="text-neutral-500 text-sm max-w-md">
              Search your memories with natural language. Ask a question or describe what you're looking for.
            </p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto py-6 px-4">
            {messages.map((message) => {
              if (message.role === 'user') {
                return (
                  <div key={message.id} className="flex justify-end mb-4">
                    <div className="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-neutral-800 text-neutral-200 whitespace-pre-wrap">
                      {message.content}
                    </div>
                  </div>
                );
              }

              const isLast = message === messages[messages.length - 1];
              const isMessageStreaming = isStreaming && isLast;
              const hasParts = message.parts.length > 0;

              // Show loading spinner if streaming but no parts yet
              if (!hasParts && isMessageStreaming) {
                return (
                  <div key={message.id} className="flex flex-col items-start gap-2 mb-4">
                    <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-neutral-900 border border-neutral-800">
                      <Spinner />
                    </div>
                  </div>
                );
              }

              // Find the last text part index to know which one is actively streaming
              let lastTextIndex = -1;
              for (let i = message.parts.length - 1; i >= 0; i--) {
                if (message.parts[i].type === 'text') {
                  lastTextIndex = i;
                  break;
                }
              }

              // Group consecutive tool-call parts so each group renders as a single ToolStrip
              // in the correct position between text parts.
              const toolGroups: { startIndex: number; tools: ToolCallPart[] }[] = [];
              for (let i = 0; i < message.parts.length; i++) {
                const part = message.parts[i];
                if (part.type === 'tool-call') {
                  const prev = toolGroups[toolGroups.length - 1];
                  if (prev && prev.startIndex + prev.tools.length === i) {
                    prev.tools.push(part);
                  } else {
                    toolGroups.push({ startIndex: i, tools: [part] });
                  }
                }
              }
              // Map from part index to the tool group that starts there
              const toolGroupAt = new Map(toolGroups.map((g) => [g.startIndex, g]));

              return (
                <div key={message.id} className="flex flex-col items-start gap-2 mb-4">
                  {message.parts.map((part, i) => {
                    if (part.type === 'text') {
                      const text = part.content.trim();
                      if (!text) return null;

                      const isLastText = i === lastTextIndex;
                      const isPartAnimating = isMessageStreaming && isLastText;

                      return (
                        <div key={`text-${i}`} className="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-neutral-900 border border-neutral-800 text-neutral-300">
                          <Streamdown
                            animated={{ animation: 'fadeIn', duration: 150, easing: 'ease', sep: 'word' }}
                            isAnimating={isPartAnimating}
                            linkSafety={{ enabled: false }}
                          >
                            {text}
                          </Streamdown>
                        </div>
                      );
                    }

                    // Render a ToolStrip at the start of each consecutive tool group
                    const group = toolGroupAt.get(i);
                    if (group) {
                      return <div key={`tools-${i}`} className="my-2"><ToolStrip tools={group.tools} /></div>;
                    }

                    return null;
                  })}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="shrink-0 max-w-[788px] mx-auto w-full pb-4 px-4 -mt-3 sticky bottom-0 z-10 bg-neutral-950 before:content-[''] before:absolute before:inset-x-0 before:bottom-[calc(100%-0.75rem)] before:h-10 before:bg-gradient-to-t before:from-neutral-950/80 before:to-transparent before:pointer-events-none">
        <div className="relative flex items-end bg-neutral-900 border border-neutral-800 rounded-xl focus-within:border-neutral-600 transition-colors">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your memories..."
            autoFocus
            className="flex-1 px-4 py-3 bg-transparent text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none resize-none max-h-40"
            rows={1}
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isStreaming}
            className="p-2 mr-1 mb-1 text-neutral-400 hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.293-7.155.75.75 0 0 0 0-1.114A28.897 28.897 0 0 0 3.105 2.288Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
