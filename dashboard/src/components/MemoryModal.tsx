import { useCallback, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Drawer } from 'vaul';
import { useMemory } from '../hooks/queries';
import { MemoryDetail } from './MemoryDetail';

export function MemoryModal() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const backgroundLocation = location.state?.backgroundLocation;
  const { isLoading } = useMemory(id ?? '');
  const [drawerOpen, setDrawerOpen] = useState(true);
  const dismissing = useRef(false);

  const handleClose = useCallback(() => {
    if (backgroundLocation) {
      navigate(-1);
    } else {
      navigate('/memories', { replace: true });
    }
  }, [backgroundLocation, navigate]);

  // Animated dismiss — lets Vaul play the close animation before navigating
  const handleDismiss = useCallback(() => {
    if (dismissing.current) return;
    dismissing.current = true;
    setDrawerOpen(false);
    setTimeout(handleClose, 400);
  }, [handleClose]);

  if (!id) return null;

  return (
    <>
      {/* Backdrop while loading (before drawer mounts) */}
      {isLoading && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-[modal-backdrop-in_200ms_ease-out]"
          onClick={handleClose}
        />
      )}

      {/* Vaul drawer — scrollable container, whole card scrolls */}
      {!isLoading && (
        <Drawer.Root
          open={drawerOpen}
          onOpenChange={(open) => { if (!open) handleDismiss(); }}
        >
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
            <Drawer.Content
              className="fixed inset-x-0 bottom-0 z-50 h-screen overflow-hidden outline-none"
              style={{ background: 'transparent' }}
              aria-describedby={undefined}
            >
              <Drawer.Title className="sr-only">Memory detail</Drawer.Title>

              {/* Inner scroll wrapper — clips Vaul's ::after pseudo-element */}
              <div className="h-full overflow-y-auto" onClick={handleDismiss}>
              {/* Centering wrapper — centers short content, grows for tall */}
              <div className="flex min-h-full items-center justify-center pt-[10vh] pb-4 px-3 md:px-4">
                {/* The visible card — natural height, no internal scroll */}
                <div
                  className="relative w-full max-w-3xl mx-auto bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Drag handle + close — absolutely positioned over content */}
                  <div className="absolute top-0 inset-x-0 z-10 pointer-events-none">
                    <div className="flex justify-center pt-3">
                      <div className="w-10 h-1 rounded-full bg-neutral-500/80" />
                    </div>
                    <button
                      onClick={handleDismiss}
                      className="pointer-events-auto absolute right-4 top-2 w-8 h-8 flex items-center justify-center rounded-full bg-neutral-900/80 backdrop-blur-sm text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
                      aria-label="Close"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M4 4l8 8M12 4l-8 8" />
                      </svg>
                    </button>
                  </div>

                  {/* Content at natural height */}
                  <MemoryDetail memoryId={id} onClose={handleDismiss} cardData={location.state?.cardData} />
                </div>
              </div>
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      )}
    </>
  );
}
