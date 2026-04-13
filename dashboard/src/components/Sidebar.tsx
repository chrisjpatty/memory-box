export function Sidebar({ children }: { children: React.ReactNode }) {
  return (
    <aside className="fixed top-12 left-0 w-56 h-[calc(100vh-3rem)] flex flex-col overflow-hidden z-10">
      {children}
    </aside>
  );
}
