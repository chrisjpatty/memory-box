import { useRef, useEffect, useState, useCallback, type ComponentType, type MouseEvent } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChatCircleIcon as ChatCircle } from '@phosphor-icons/react/dist/icons/ChatCircle';
import { CubeIcon as Cube } from '@phosphor-icons/react/dist/icons/Cube';
import { GearSixIcon as GearSix } from '@phosphor-icons/react/dist/icons/GearSix';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/icons/Plus';
import type { IconProps } from '@phosphor-icons/react';

const modes: { to: string; label: string; icon: ComponentType<IconProps>; activeColor: string }[] = [
  { to: '/chat', label: 'Chat', icon: ChatCircle, activeColor: 'text-blue-200' },
  { to: '/memories', label: 'Memories', icon: Cube, activeColor: 'text-green-200' },
  { to: '/settings', label: 'Settings', icon: GearSix, activeColor: 'text-neutral-200' },
];

// Import sits conceptually to the right of all mode tabs (index 3)
const IMPORT_INDEX = modes.length;

function getNavIndex(pathname: string) {
  if (pathname.startsWith('/import')) return IMPORT_INDEX;
  return modes.findIndex((m) => pathname.startsWith(m.to));
}

export function AppShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isMemories = pathname.startsWith('/memories');
  const isChat = pathname.startsWith('/chat');
  const showOverlay = isMemories || isChat;

  const navRef = useRef<HTMLElement>(null);
  const linkRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);
  const [navOffset, setNavOffset] = useState(0);

  const activeIndex = getNavIndex(pathname);

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

  const handleNavTransition = (e: MouseEvent, to: string, targetIndex: number) => {
    if (targetIndex === activeIndex) return;

    if (!document.startViewTransition) return;

    e.preventDefault();
    const dir = targetIndex > activeIndex ? 'right' : 'left';
    document.documentElement.dataset.slideDir = dir;

    const el = contentRef.current;
    if (el) el.style.viewTransitionName = 'mode-content';

    const transition = document.startViewTransition(() => {
      navigate(to);
    });

    transition.finished.then(() => {
      if (el) el.style.viewTransitionName = '';
    });
  };

  return (
    <div className="h-screen overflow-hidden">
      {/* Blur + gradient overlay behind header */}
      {showOverlay && (
        <div className={`fixed top-0 left-0 right-0 z-[15] pointer-events-none ${isMemories ? 'h-32' : 'h-24'}`}>
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

      <header className="fixed top-0 left-0 right-0 h-14 flex items-center px-6 z-20">
        <nav
          ref={navRef}
          className="absolute left-1/2 flex items-center gap-6"
          style={{
            transform: `translateX(calc(-50% + ${navOffset}px))`,
            transition: 'transform 330ms cubic-bezier(0.15, 0, 0.35, 1)',
          }}
        >
          {modes.map((mode, i) => {
            const Icon = mode.icon;
            return (
              <NavLink
                key={mode.to}
                to={mode.to}
                ref={(el) => { linkRefs.current[i] = el; }}
                onClick={(e) => handleNavTransition(e, mode.to, i)}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-1 text-sm font-semibold tracking-tight origin-center ${
                    isActive
                      ? mode.activeColor
                      : 'text-neutral-400 hover:opacity-75'
                  }`
                }
                style={({ isActive }) => ({
                  transform: isActive ? 'scale(1.25)' : 'scale(1) translateY(2px)',
                  opacity: isActive ? 1 : 0.5,
                  transition: 'transform 330ms ease-out, opacity 330ms ease-out',
                })}
              >
                <Icon size={14} weight="bold" />
                {mode.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="ml-auto">
          <NavLink
            to="/import"
            onClick={(e) => handleNavTransition(e, '/import', IMPORT_INDEX)}
            className={({ isActive }) =>
              `flex items-center gap-1.5 text-sm font-semibold tracking-tight origin-center ${
                isActive
                  ? 'text-white'
                  : 'text-neutral-400 hover:opacity-75'
              }`
            }
            style={({ isActive }) => ({
              transform: isActive ? 'scale(1.1)' : 'scale(1)',
              opacity: isActive ? 1 : 0.5,
              transition: 'transform 330ms ease-out, opacity 330ms ease-out',
            })}
          >
            <Plus size={14} weight="bold" />
            Import
          </NavLink>
        </div>
      </header>

      {/* Mode content (each mode layout renders its own sidebar + content) */}
      <div className="flex-1" ref={contentRef}>
        <Outlet />
      </div>
    </div>
  );
}
