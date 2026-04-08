import { useParams, useNavigate } from 'react-router-dom';
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Thread } from '../components/Thread';
import { useChat } from '../hooks/useChat';
import { queryKeys } from '../hooks/queries';

export function Chat() {
  const { '*': rest } = useParams();
  const id = rest || undefined;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const onConversationCreated = useCallback((conversationId: string) => {
    navigate(`/chat/${conversationId}`, { replace: true });
    qc.invalidateQueries({ queryKey: queryKeys.conversations });
  }, [navigate, qc]);

  const { messages, isLoading, isStreaming, send } = useChat(
    id ?? '',
    id ? undefined : onConversationCreated,
  );

  return (
    <Thread
      messages={messages}
      isLoading={isLoading}
      isStreaming={isStreaming}
      onSend={send}
    />
  );
}
