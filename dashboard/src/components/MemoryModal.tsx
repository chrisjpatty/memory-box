import { useCallback } from 'react';
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

  const handleClose = useCallback(() => {
    if (backgroundLocation) {
      navigate(-1);
    } else {
      navigate('/memories', { replace: true });
    }
  }, [backgroundLocation, navigate]);

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

      {/* Vaul drawer — the drawer IS the card */}
      {!isLoading && (
        <Drawer.Root
          open
          onOpenChange={(open) => { if (!open) handleClose(); }}
        >
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
            <Drawer.Content
              className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-3xl flex flex-col rounded-t-2xl bg-neutral-950 border border-neutral-800 border-b-0 shadow-2xl max-h-[96vh] outline-none"
              aria-describedby={undefined}
            >
              <Drawer.Title className="sr-only">Memory detail</Drawer.Title>

              {/* Drag handle + close — absolutely positioned, takes no vertical space */}
              <div className="absolute top-0 inset-x-0 z-10 pointer-events-none">
                <div className="flex justify-center pt-3">
                  <div className="w-10 h-1 rounded-full bg-neutral-500/80" />
                </div>
                <button
                  onClick={handleClose}
                  className="pointer-events-auto absolute right-4 top-2 w-8 h-8 flex items-center justify-center rounded-full bg-neutral-900/80 backdrop-blur-sm text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
                  aria-label="Close"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </button>
              </div>

              {/* Scrollable content — starts from the very top of the drawer */}
              <div className="flex-1 overflow-y-auto">
                <MemoryDetail memoryId={id} onClose={handleClose} cardData={location.state?.cardData} />
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      )}
    </>
  );
}
