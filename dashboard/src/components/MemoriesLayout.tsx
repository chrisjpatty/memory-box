import { Outlet, useSearchParams } from 'react-router-dom';

export interface MemoriesContext {
  searchQuery: string;
  typeFilters: string[];
  setSearchQuery: (q: string) => void;
  setTypeFilters: (types: string[]) => void;
}

export function MemoriesLayout() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get('q') ?? '';
  const activeTypes = searchParams.get('types')?.split(',').filter(Boolean) ?? [];

  const setSearchQuery = (q: string) => {
    setSearchParams((prev) => {
      if (q) prev.set('q', q);
      else prev.delete('q');
      return prev;
    }, { replace: true });
  };

  const setActiveTypes = (types: string[]) => {
    setSearchParams((prev) => {
      if (types.length > 0) prev.set('types', types.join(','));
      else prev.delete('types');
      return prev;
    }, { replace: true });
  };

  return (
    <div className="h-[calc(100vh-3.5rem)] mt-14 overflow-hidden">
      <main className="h-full px-8 overflow-y-auto overflow-x-hidden">
        <Outlet context={{ searchQuery, typeFilters: activeTypes, setSearchQuery, setTypeFilters: setActiveTypes } satisfies MemoriesContext} />
      </main>
    </div>
  );
}
