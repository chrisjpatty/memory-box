import { Outlet, NavLink, useNavigate, useParams } from 'react-router-dom';
import { useConversations, useDeleteConversation } from '../hooks/queries';
import { Sidebar } from './Sidebar';

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

export function ChatLayout() {
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
    <div className="h-[calc(100vh-3rem)] mt-12 flex overflow-hidden">
      <Sidebar>
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
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
            </svg>
            New chat
          </NavLink>
        </div>

        {/* Conversation list */}
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
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                      <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z" clipRule="evenodd" />
                    </svg>
                  </button>
                </NavLink>
              ))}
            </div>
          )}
        </div>
      </Sidebar>

      {/* Content */}
      <main className="ml-56 flex-1 min-h-0 pt-8 px-8 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
