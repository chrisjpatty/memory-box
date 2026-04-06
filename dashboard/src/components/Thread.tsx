import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { Streamdown } from 'streamdown';
import 'streamdown/styles.css';
import { useChat, type ActiveTool } from '../hooks/useChat';

function getToolLabel(toolName: string, args: Record<string, unknown>): { action: string; detail?: string } {
  switch (toolName) {
    case 'search-memories':
      return { action: 'Searching memories', detail: args.query as string };
    case 'store-memory':
      return { action: 'Saving memory', detail: args.title as string };
    case 'list-memories': {
      const filters = [args.category, args.tag, args.contentType].filter(Boolean) as string[];
      return { action: 'Browsing memories', detail: filters.length ? filters.join(', ') : undefined };
    }
    case 'graph-query': {
      const context = (args.tag ?? args.category) as string | undefined;
      return { action: 'Exploring connections', detail: context };
    }
    case 'get-memory':
      return { action: 'Retrieving memory' };
    case 'delete-memory':
      return { action: 'Deleting memory' };
    default:
      return { action: toolName };
  }
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

function ToolIndicator({ tool }: { tool: ActiveTool }) {
  const { action, detail } = getToolLabel(tool.toolName, tool.args);
  return (
    <div className="max-w-[85%] flex items-center gap-2 px-3 py-2 bg-neutral-800/50 border border-neutral-700/50 rounded-lg text-xs text-neutral-400">
      <span className="font-medium text-neutral-300">{action}</span>
      {detail && <span className="text-neutral-500 italic truncate max-w-[200px]">"{detail}"</span>}
      <Spinner />
    </div>
  );
}

export function Thread() {
  const { messages, isStreaming, activeTools, send } = useChat();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTools]);

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
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
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
              const isAnimating = isStreaming && isLast;
              const hasText = message.content.trim().length > 0;

              return (
                <div key={message.id} className="flex flex-col items-start gap-2 mb-4">
                  {!hasText && isAnimating ? (
                    <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-neutral-900 border border-neutral-800">
                      <Spinner />
                    </div>
                  ) : hasText ? (
                    <div className="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-neutral-900 border border-neutral-800 text-neutral-300">
                      <Streamdown
                        animated={{ animation: 'fadeIn', duration: 150, easing: 'ease', sep: 'word' }}
                        isAnimating={isAnimating}
                        linkSafety={{ enabled: false }}
                      >
                        {message.content.trim()}
                      </Streamdown>
                    </div>
                  ) : null}

                  {isAnimating && activeTools.map((tool) => (
                    <ToolIndicator key={tool.toolCallId} tool={tool} />
                  ))}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="shrink-0 max-w-3xl mx-auto w-full pb-4 pt-2 px-4">
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
