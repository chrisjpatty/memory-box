import { useStats } from '../hooks/queries';

export function StatsCard() {
  const { data } = useStats();
  const stats = data ?? { memories: 0, tags: 0, categories: 0 };

  const items = [
    { label: 'Memories', value: stats.memories },
    { label: 'Tags', value: stats.tags },
    { label: 'Categories', value: stats.categories },
  ];

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-4">Overview</h2>
      <div className="grid grid-cols-3 gap-4">
        {items.map((item) => (
          <div key={item.label} className="text-center">
            <div className="text-3xl font-bold">{item.value}</div>
            <div className="text-xs text-neutral-500 mt-1">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
