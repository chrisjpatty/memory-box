import { Outlet } from 'react-router-dom';

export function CollectionsLayout() {
  return (
    <div className="h-[calc(100vh-3.5rem)] mt-14 overflow-hidden">
      <main className="h-full px-8 overflow-y-auto overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
