import { useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { useConversations, useDeleteConversation } from '../hooks/queries';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/icons/Plus';
import { TrashSimpleIcon as TrashSimple } from '@phosphor-icons/react/dist/icons/TrashSimple';

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ChatSidebar() {
  const navigate = useNavigate();
  const { id: activeConversationId } = useParams<{ id: string }>();
  const { data } = useConversations();
  const deleteConversation = useDeleteConversation();

  const conversations = data?.conversations ?? [];

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    deleteConversation.mutate(id);
    if (activeConversationId === id) navigate('/chat');
  };

  return (
    <>
      <div className="p-4 pb-0">
        <h2 className="text-xs font-medium text-neutral-500 uppercase tracking-wider px-3 mb-3">Chat History</h2>
        <NavLink
          to="/chat"
          end
          className={({ isActive }) =>
            `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors mb-2 ${
              isActive
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
            }`
          }
        >
          <Plus size={16} weight="bold" />
          New chat
        </NavLink>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-2">
        {conversations.length > 0 && (
          <div className="flex flex-col gap-0.5">
            {conversations.map((conv) => (
              <NavLink
                key={conv.id}
                to={`/chat/${conv.id}`}
                className={({ isActive }) =>
                  `group flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-neutral-800 text-white'
                      : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
                  }`
                }
              >
                <span className="flex-1 truncate">{conv.title}</span>
                <span className="shrink-0 text-[10px] text-neutral-600 group-hover:hidden">{formatRelativeDate(conv.updated_at)}</span>
                <button
                  onClick={(e) => handleDelete(e, conv.id)}
                  className="shrink-0 hidden group-hover:block text-neutral-600 hover:text-red-400 transition-colors"
                >
                  <TrashSimple size={14} weight="bold" />
                </button>
              </NavLink>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/** Compact conversation list for mobile drawer accordion. */
export function ChatNavList({ limit = 5 }: { limit?: number }) {
  const navigate = useNavigate();
  const { id: activeConversationId } = useParams<{ id: string }>();
  const { data } = useConversations();
  const deleteConversation = useDeleteConversation();
  const [showAll, setShowAll] = useState(false);

  const conversations = data?.conversations ?? [];
  const visible = (!showAll && limit) ? conversations.slice(0, limit) : conversations;
  const remaining = conversations.length - visible.length;

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    deleteConversation.mutate(id);
    if (activeConversationId === id) navigate('/chat');
  };

  return (
    <div className="flex flex-col gap-0.5 py-1">
      <NavLink
        to="/chat"
        end
        className={({ isActive }) =>
          `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            isActive ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
          }`
        }
      >
        <Plus size={16} weight="bold" />
        New chat
      </NavLink>
      {visible.map((conv) => (
        <NavLink
          key={conv.id}
          to={`/chat/${conv.id}`}
          className={({ isActive }) =>
            `group flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
              isActive ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
            }`
          }
        >
          <span className="flex-1 truncate">{conv.title}</span>
          <button
            onClick={(e) => handleDelete(e, conv.id)}
            className="shrink-0 hidden group-hover:block text-neutral-600 hover:text-red-400 transition-colors"
          >
            <TrashSimple size={14} weight="bold" />
          </button>
        </NavLink>
      ))}
      {remaining > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="px-3 py-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition-colors text-left"
        >
          Show {remaining} more...
        </button>
      )}
    </div>
  );
}
