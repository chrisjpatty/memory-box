import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { api } from '../api';

const navItems = [
  { to: '/', label: 'Chat', end: true },
  { to: '/memories', label: 'Memories' },
  { to: '/search', label: 'Search' },
  { to: '/ingest', label: 'Ingest' },
  { to: '/import', label: 'Import' },
  { to: '/settings', label: 'Settings' },
];

export function Layout() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await api.logout();
    navigate('/login');
  };

  return (
    <div className="h-screen flex overflow-hidden">
      <aside className="fixed top-0 left-0 w-56 h-screen bg-neutral-900 border-r border-neutral-800 p-4 flex flex-col overflow-y-auto z-10">
        <h1 className="text-lg font-bold mb-8 px-2">Memory Box</h1>
        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-neutral-800 text-white'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={handleLogout}
          className="px-3 py-2 rounded-lg text-sm text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/50 transition-colors text-left"
        >
          Logout
        </button>
      </aside>
      <main className="ml-56 flex-1 min-h-0 pt-8 px-8 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
