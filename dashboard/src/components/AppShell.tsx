import { useRef, useEffect, useState, useCallback, type ComponentType, type MouseEvent } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChatCircleIcon as ChatCircle } from '@phosphor-icons/react/dist/icons/ChatCircle';
import { CubeIcon as Cube } from '@phosphor-icons/react/dist/icons/Cube';
import { FolderIcon as FolderIcon } from '@phosphor-icons/react/dist/icons/Folder';
import { GearSixIcon as GearSix } from '@phosphor-icons/react/dist/icons/GearSix';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/icons/Plus';
import { ListIcon as List } from '@phosphor-icons/react/dist/icons/List';
import { CaretDownIcon as CaretDown } from '@phosphor-icons/react/dist/icons/CaretDown';
import type { IconProps } from '@phosphor-icons/react';
import { MobileDrawer } from './MobileDrawer';
import { ChatNavList } from './ChatSidebar';
import { SettingsNav } from '../pages/settings/SettingsLayout';

const modes: { to: string; label: string; icon: ComponentType<IconProps>; activeColor: string }[] = [
  { to: '/chat', label: 'Chat', icon: ChatCircle, activeColor: 'text-blue-200' },
  { to: '/memories', label: 'Memories', icon: Cube, activeColor: 'text-green-200' },
  { to: '/collections', label: 'Collections', icon: FolderIcon, activeColor: 'text-amber-200' },
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
  const isCollections = pathname.startsWith('/collections');
  const isChat = pathname.startsWith('/chat');
  const isSettings = pathname.startsWith('/settings');
  const showOverlay = isMemories || isCollections || isChat;

  // Mobile header label
  const activeModeIdx = getNavIndex(pathname);
  const activeModeMobile = activeModeIdx >= 0 && activeModeIdx < modes.length ? modes[activeModeIdx] : null;
  const mobileLabel = activeModeMobile?.label ?? (pathname.startsWith('/import') ? 'Import' : '');
  const mobileActiveColor = activeModeMobile?.activeColor ?? (pathname.startsWith('/import') ? 'text-white' : 'text-neutral-200');
  const MobileActiveIcon = activeModeMobile?.icon ?? (pathname.startsWith('/import') ? Plus : null);

  const navRef = useRef<HTMLElement>(null);
  const linkRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);
  const [navOffset, setNavOffset] = useState(0);
  const hasAnimated = useRef(false);

  const activeIndex = getNavIndex(pathname);

  // Mobile accordion state — defaults to current section, syncs on route change
  const [expandedSection, setExpandedSection] = useState<string | null>(
    isChat ? 'chat' : isSettings ? 'settings' : null,
  );
  useEffect(() => {
    setExpandedSection(isChat ? 'chat' : isSettings ? 'settings' : null);
  }, [isChat, isSettings]);
  const toggleSection = (section: string) => {
    setExpandedSection((prev) => (prev === section ? null : section));
  };

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
    // Enable transitions after initial position is set
    requestAnimationFrame(() => { hasAnimated.current = true; });
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
        <div className={`fixed top-0 left-0 right-0 z-[15] pointer-events-none ${isMemories || isCollections ? 'h-32' : 'h-24'}`}>
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
        {/* Mobile hamburger + drawer */}
        <div className="md:hidden">
          <MobileDrawer
            trigger={
              <button className="flex items-center gap-3">
                <List size={24} weight="bold" className="text-neutral-400" />
                <span className={`flex items-center gap-2 text-lg font-semibold tracking-tight ${mobileActiveColor}`}>
                  {MobileActiveIcon && <MobileActiveIcon size={18} weight="bold" />}
                  {mobileLabel}
                </span>
              </button>
            }
          >
            <div className="p-4 flex flex-col gap-0.5 overflow-y-auto">
              {/* Memories — direct link */}
              <NavLink
                to="/memories"
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-base font-semibold tracking-tight transition-colors ${
                    isActive ? 'text-green-200' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
                  }`
                }
              >
                <Cube size={16} weight="bold" />
                Memories
              </NavLink>

              {/* Collections — direct link */}
              <NavLink
                to="/collections"
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-base font-semibold tracking-tight transition-colors ${
                    isActive ? 'text-amber-200' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
                  }`
                }
              >
                <FolderIcon size={16} weight="bold" />
                Collections
              </NavLink>

              {/* Chat — accordion */}
              <button
                onClick={() => toggleSection('chat')}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-base font-semibold tracking-tight transition-colors w-full ${
                  isChat ? 'text-blue-200' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
                }`}
              >
                <ChatCircle size={16} weight="bold" />
                <span className="flex-1 text-left">Chat</span>
                <CaretDown size={12} weight="bold" className={`transition-transform ${expandedSection === 'chat' ? 'rotate-180' : ''}`} />
              </button>
              {expandedSection === 'chat' && (
                <div className="ml-5 pl-3 border-l border-neutral-800">
                  <ChatNavList />
                </div>
              )}

              {/* Settings — accordion */}
              <button
                onClick={() => toggleSection('settings')}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-base font-semibold tracking-tight transition-colors w-full ${
                  isSettings ? 'text-neutral-200' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
                }`}
              >
                <GearSix size={16} weight="bold" />
                <span className="flex-1 text-left">Settings</span>
                <CaretDown size={12} weight="bold" className={`transition-transform ${expandedSection === 'settings' ? 'rotate-180' : ''}`} />
              </button>
              {expandedSection === 'settings' && (
                <div className="ml-5 pl-3 border-l border-neutral-800">
                  <SettingsNav />
                </div>
              )}

              {/* Import — direct link */}
              <NavLink
                to="/import"
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-base font-semibold tracking-tight transition-colors ${
                    isActive ? 'text-white' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
                  }`
                }
              >
                <Plus size={16} weight="bold" />
                Import
              </NavLink>
            </div>
          </MobileDrawer>
        </div>

        {/* Desktop nav */}
        <nav
          ref={navRef}
          className="hidden md:flex absolute left-1/2 items-center gap-10"
          style={{
            transform: `translateX(calc(-50% + ${navOffset}px))`,
            transition: hasAnimated.current ? 'transform 330ms cubic-bezier(0.15, 0, 0.35, 1)' : 'none',
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
                  transform: isActive ? 'scale(1.5) translateY(3px)' : 'scale(0.95) translateY(2px)',
                  opacity: isActive ? 1 : 0.4,
                  transition: hasAnimated.current ? 'transform 330ms ease-out, opacity 330ms ease-out' : 'none',
                })}
              >
                <Icon size={14} weight="bold" />
                {mode.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="hidden md:block ml-auto">
          <NavLink
            to="/import"
            onClick={(e) => handleNavTransition(e, '/import', IMPORT_INDEX)}
            className={({ isActive }) =>
              `flex items-center gap-1.5 text-sm font-semibold tracking-tight origin-right ${
                isActive
                  ? 'text-white'
                  : 'text-neutral-400 hover:opacity-75'
              }`
            }
            style={({ isActive }) => ({
              transform: isActive ? 'scale(1.5) translateY(3px)' : 'scale(1.1)',
              opacity: isActive ? 1 : 0.5,
              transition: hasAnimated.current ? 'transform 330ms ease-out, opacity 330ms ease-out' : 'none',
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
