import { Outlet, NavLink } from 'react-router-dom';
import { Sidebar } from '../../components/Sidebar';

const navItems = [
  { to: '/settings', label: 'General', end: true },
  { to: '/settings/tokens', label: 'API Tokens' },
  { to: '/settings/mcp', label: 'MCP Server' },
  { to: '/settings/danger-zone', label: 'Danger Zone', danger: true },
];

export function SettingsLayout() {
  return (
    <div className="h-[calc(100vh-3.5rem)] mt-14 flex overflow-hidden">
      <Sidebar>
        <div className="p-4 flex flex-col gap-0.5">
          <h2 className="text-xs font-medium text-neutral-500 uppercase tracking-wider px-3 mb-3">Settings</h2>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={'end' in item ? item.end : false}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? item.danger
                      ? 'bg-red-950/50 text-red-400 font-medium'
                      : 'bg-neutral-800 text-white font-medium'
                    : item.danger
                      ? 'text-red-400/60 hover:text-red-400 hover:bg-red-950/30'
                      : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </Sidebar>

      {/* Content */}
      <main className="ml-56 flex-1 min-h-0 pt-8 px-8 overflow-auto">
        <div className="max-w-3xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
