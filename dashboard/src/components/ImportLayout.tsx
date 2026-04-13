import { Outlet } from 'react-router-dom';

export function ImportLayout() {
  return (
    <div className="h-[calc(100vh-3.5rem)] mt-14 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8">
        <Outlet />
      </div>
    </div>
  );
}
