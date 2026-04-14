import { Outlet, NavLink } from 'react-router-dom';
import { GearSixIcon as GearSix } from '@phosphor-icons/react/dist/icons/GearSix';
import { KeyIcon as Key } from '@phosphor-icons/react/dist/icons/Key';
import { PlugsIcon as Plugs } from '@phosphor-icons/react/dist/icons/Plugs';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/icons/Warning';
import type { ComponentType } from 'react';
import type { IconProps } from '@phosphor-icons/react';

export const settingsNavItems: { to: string; label: string; icon: ComponentType<IconProps>; end?: boolean; danger?: boolean }[] = [
  { to: '/settings', label: 'General', icon: GearSix, end: true },
  { to: '/settings/tokens', label: 'API Tokens', icon: Key },
  { to: '/settings/mcp', label: 'MCP Server', icon: Plugs },
  { to: '/settings/danger-zone', label: 'Danger Zone', icon: Warning, danger: true },
];

export function SettingsNav() {
  return (
    <div className="flex flex-col gap-1">
      {settingsNavItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={'end' in item ? item.end : false}
          className={({ isActive }) =>
            `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
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
          <item.icon size={14} weight="bold" />
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

export function SettingsLayout() {
  return (
    <div className="h-[calc(100vh-3.5rem)] mt-14 overflow-auto">
      <div className="max-w-5xl mx-auto flex gap-10 pt-8 px-8">
        {/* Desktop nav */}
        <nav className="hidden md:block w-44 shrink-0 sticky top-8 self-start">
          <h2 className="text-xs font-medium text-neutral-500 uppercase tracking-wider px-3 mb-3">Settings</h2>
          <SettingsNav />
        </nav>

        <main className="flex-1 min-w-0 pb-16">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
