import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
} from '@assistant-ui/react';
import type {
  TextMessagePartComponent,
  ToolCallMessagePartComponent,
} from '@assistant-ui/react';

const TextPart: TextMessagePartComponent = ({ part }) => {
  return <span>{part.text}</span>;
};

const ToolCallPart: ToolCallMessagePartComponent = ({ part }) => {
  return (
    <div className="my-2 px-3 py-2 bg-neutral-800/50 border border-neutral-700/50 rounded-lg text-xs text-neutral-400">
      <span className="font-medium text-neutral-300">{part.toolName}</span>
      {part.state?.type === 'running' && (
        <span className="ml-2 text-blue-400">running...</span>
      )}
    </div>
  );
};

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end mb-4">
      <div className="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-neutral-800 text-neutral-200 whitespace-pre-wrap">
        <MessagePrimitive.Parts
          components={{
            Text: TextPart,
          }}
        />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-start mb-4">
      <div className="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-neutral-900 border border-neutral-800 text-neutral-300 whitespace-pre-wrap">
        <MessagePrimitive.Parts
          components={{
            Text: TextPart,
            ToolCall: ToolCallPart,
          }}
        />
      </div>
    </MessagePrimitive.Root>
  );
}

export function Thread() {
  return (
    <ThreadPrimitive.Root className="flex flex-col h-full">
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto">
        <ThreadPrimitive.Empty>
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <h1 className="text-2xl font-bold mb-2">Memory Box</h1>
            <p className="text-neutral-500 text-sm max-w-md">
              Search your memories with natural language. Ask a question or describe what you're looking for.
            </p>
          </div>
        </ThreadPrimitive.Empty>

        <div className="max-w-3xl mx-auto py-6 px-4">
          <ThreadPrimitive.Messages
            components={{
              UserMessage,
              AssistantMessage,
            }}
          />
        </div>
      </ThreadPrimitive.Viewport>

      <div className="shrink-0 max-w-3xl mx-auto w-full pb-4 pt-2 px-4">
        <ComposerPrimitive.Root className="relative flex items-end bg-neutral-900 border border-neutral-800 rounded-xl focus-within:border-neutral-600 transition-colors">
          <ComposerPrimitive.Input
            placeholder="Ask about your memories..."
            autoFocus
            className="flex-1 px-4 py-3 bg-transparent text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none resize-none max-h-40"
            rows={1}
          />
          <ComposerPrimitive.Send className="p-2 mr-1 mb-1 text-neutral-400 hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.293-7.155.75.75 0 0 0 0-1.114A28.897 28.897 0 0 0 3.105 2.288Z" />
            </svg>
          </ComposerPrimitive.Send>
        </ComposerPrimitive.Root>
      </div>
    </ThreadPrimitive.Root>
  );
}
