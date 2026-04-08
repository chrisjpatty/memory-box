import { Outlet, NavLink } from 'react-router-dom';

const navItems = [
  { to: '/settings', label: 'General', end: true },
  { to: '/settings/tokens', label: 'API Tokens' },
  { to: '/settings/danger-zone', label: 'Danger Zone', danger: true },
];

export function SettingsLayout() {
  return (
    <div className="flex gap-10 max-w-4xl">
      <nav className="w-40 shrink-0">
        <h1 className="text-lg font-bold mb-4">Settings</h1>
        <div className="flex flex-col gap-0.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={'end' in item ? item.end : false}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm transition-colors ${
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
      </nav>
      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
