export function Sidebar({ children }: { children: React.ReactNode }) {
  return (
    <aside className="fixed top-14 left-0 w-56 h-[calc(100vh-3.5rem)] flex flex-col overflow-hidden z-[16]">
      {children}
    </aside>
  );
}
