import { MemoryList } from '../components/MemoryList';

export function Memories() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Memories</h1>
        <p className="text-neutral-500 text-sm">Browse and manage your stored content</p>
      </div>
      <MemoryList />
    </div>
  );
}
