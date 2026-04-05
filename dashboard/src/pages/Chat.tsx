import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { useChatRuntime, AssistantChatTransport } from '@assistant-ui/react-ai-sdk';
import { Thread } from '../components/Thread';

export function Chat() {
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: '/api/chat',
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread />
    </AssistantRuntimeProvider>
  );
}
