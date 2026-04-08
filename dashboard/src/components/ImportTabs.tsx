import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/import', label: 'Manual Ingest', end: true },
  { to: '/import/github', label: 'GitHub Stars' },
  { to: '/import/twitter', label: 'Twitter Bookmarks' },
];

const tabClass = (isActive: boolean) =>
  `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
    isActive
      ? 'bg-neutral-800 text-white'
      : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/50'
  }`;

export function ImportTabs() {
  return (
    <div className="flex gap-1 mb-6">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) => tabClass(isActive)}
        >
          {tab.label}
        </NavLink>
      ))}
    </div>
  );
}
