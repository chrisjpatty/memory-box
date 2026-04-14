import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { ChatSidebar } from './ChatSidebar';

export function ChatLayout() {
  return (
    <div className="h-[calc(100vh-3.5rem)] mt-14 flex overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar>
          <ChatSidebar />
        </Sidebar>
      </div>

      {/* Content */}
      <main className="flex-1 min-h-0 pt-8 px-4 md:px-8 md:ml-56 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
