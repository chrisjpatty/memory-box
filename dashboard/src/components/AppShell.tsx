import { useRef, useEffect, useState, useCallback } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';

const modes = [
  { to: '/chat', label: 'Chat' },
  { to: '/library', label: 'Library' },
  { to: '/settings', label: 'Settings' },
];

export function AppShell() {
  const { pathname } = useLocation();
  const isLibrary = pathname.startsWith('/library');
  const isChat = pathname.startsWith('/chat');
  const showOverlay = isLibrary || isChat;

  const navRef = useRef<HTMLElement>(null);
  const linkRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [navOffset, setNavOffset] = useState(0);

  const activeIndex = modes.findIndex((m) => pathname.startsWith(m.to));

  const computeOffset = useCallback(() => {
    const nav = navRef.current;
    const activeLink = linkRefs.current[activeIndex];
    if (!nav || !activeLink) return;

    const navRect = nav.getBoundingClientRect();
    const linkRect = activeLink.getBoundingClientRect();
    const linkCenter = linkRect.left + linkRect.width / 2;
    const navCenter = navRect.left + navRect.width / 2;
    setNavOffset(navCenter - linkCenter);
  }, [activeIndex]);

  useEffect(() => {
    computeOffset();
  }, [computeOffset]);

  useEffect(() => {
    window.addEventListener('resize', computeOffset);
    return () => window.removeEventListener('resize', computeOffset);
  }, [computeOffset]);

  return (
    <div className="h-screen overflow-hidden">
      {/* Blur + gradient overlay behind header */}
      {showOverlay && (
        <div className={`fixed top-0 left-0 right-0 z-[15] pointer-events-none ${isLibrary ? 'h-32' : 'h-24'}`}>
          <div
            className="absolute inset-0 backdrop-blur-md"
            style={{ maskImage: 'linear-gradient(to bottom, black 50%, transparent)', WebkitMaskImage: 'linear-gradient(to bottom, black 50%, transparent)' }}
          />
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(to bottom, rgb(10 10 10), transparent)' }}
          />
        </div>
      )}

      <header className="fixed top-0 left-0 right-0 h-12 flex items-center px-4 z-20">
        <nav
          ref={navRef}
          className="absolute left-1/2 flex items-center gap-3"
          style={{
            transform: `translateX(calc(-50% + ${navOffset}px))`,
            transition: 'transform 400ms cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {modes.map((mode, i) => (
            <NavLink
              key={mode.to}
              to={mode.to}
              ref={(el) => { linkRefs.current[i] = el; }}
              className={({ isActive }) =>
                `px-1 text-sm font-semibold tracking-tight origin-center ${
                  isActive
                    ? 'text-white'
                    : 'text-neutral-400 hover:opacity-75'
                }`
              }
              style={({ isActive }) => ({
                transform: isActive ? 'scale(1.25)' : 'scale(1) translateY(2px)',
                opacity: isActive ? 1 : 0.5,
                transition: 'transform 300ms ease-out, opacity 300ms ease-out',
              })}
            >
              {mode.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto">
          <NavLink
            to="/library/import"
            className={({ isActive }) =>
              `px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-white text-black'
                  : 'bg-white/10 text-neutral-200 hover:bg-white/20'
              }`
            }
          >
            Import
          </NavLink>
        </div>
      </header>

      {/* Mode content (each mode layout renders its own sidebar + content) */}
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
}
