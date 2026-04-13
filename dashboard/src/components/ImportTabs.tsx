import { NavLink } from 'react-router-dom';
import { useActiveJobs } from '../hooks/queries';

const sourceTabs = [
  { to: '/memories/import', label: 'Manual Ingest', end: true },
  { to: '/memories/import/github', label: 'GitHub Stars' },
  { to: '/memories/import/twitter', label: 'Twitter Bookmarks' },
];

const sourceTabClass = (isActive: boolean) =>
  `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
    isActive
      ? 'bg-neutral-800 text-white'
      : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/50'
  }`;

const activityTabClass = (isActive: boolean) =>
  `px-4 py-2 text-sm font-medium rounded-lg transition-colors border ${
    isActive
      ? 'border-neutral-600 bg-neutral-800/50 text-neutral-200'
      : 'border-neutral-700 text-neutral-500 hover:text-neutral-300 hover:border-neutral-600'
  }`;

export function ImportTabs() {
  const activeJobsQuery = useActiveJobs();
  const activeCount = activeJobsQuery.data?.jobs?.length ?? 0;

  return (
    <div className="flex items-center gap-1 mb-6">
      {sourceTabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) => sourceTabClass(isActive)}
        >
          {tab.label}
        </NavLink>
      ))}

      {/* Divider + Activity tab pushed right */}
      <div className="ml-auto flex items-center gap-3">
        <div className="w-px h-5 bg-neutral-700" />
        <NavLink
          to="/memories/import/activity"
          className={({ isActive }) => activityTabClass(isActive)}
        >
          <span className="flex items-center gap-2">
            Activity
            {activeCount > 0 && (
              <span className="flex items-center gap-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                </span>
                <span className="text-xs text-blue-400">{activeCount}</span>
              </span>
            )}
          </span>
        </NavLink>
      </div>
    </div>
  );
}
