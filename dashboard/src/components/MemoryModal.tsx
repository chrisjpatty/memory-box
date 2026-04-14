import { useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useMemory } from '../hooks/queries';
import { MemoryDetail } from './MemoryDetail';

export function MemoryModal() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const backgroundLocation = location.state?.backgroundLocation;

  const handleClose = useCallback(() => {
    if (backgroundLocation) {
      navigate(-1);
    } else {
      navigate('/memories', { replace: true });
    }
  }, [backgroundLocation, navigate]);

  // Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleClose]);

  // Scroll lock on background
  useEffect(() => {
    const scrollables = document.querySelectorAll('main');
    const originals: string[] = [];
    scrollables.forEach((el, i) => {
      originals[i] = (el as HTMLElement).style.overflow;
      (el as HTMLElement).style.overflow = 'hidden';
    });
    return () => {
      scrollables.forEach((el, i) => {
        (el as HTMLElement).style.overflow = originals[i] || '';
      });
    };
  }, []);

  // Focus trap
  useEffect(() => {
    closeButtonRef.current?.focus();

    const modal = modalRef.current;
    if (!modal) return;

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = modal.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, []);

  // Wait for full content before showing the dialog to avoid height jumps
  const { isLoading } = useMemory(id ?? '');

  if (!id) return null;

  return (
    <div ref={modalRef} role="dialog" aria-modal="true" aria-label="Memory detail">
      {/* Backdrop — shows immediately */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-[modal-backdrop-in_200ms_ease-out]"
        onClick={handleClose}
      />

      {/* Dialog panel — only mounts once content is ready so slide-up has final height */}
      {!isLoading && (
        <div className="fixed inset-0 z-50 overflow-y-auto animate-[modal-slide-up_400ms_cubic-bezier(0.16,1,0.3,1)]">
          <div className="flex min-h-full items-center justify-center pt-14 md:pt-16 pb-4 md:pb-8 px-3 md:px-4">
          <div
            className="relative w-full max-w-3xl pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              ref={closeButtonRef}
              onClick={handleClose}
              className="absolute -top-10 right-0 w-8 h-8 flex items-center justify-center rounded-full
                text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors z-10"
              aria-label="Close"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>

            {/* Content panel */}
            <div className="bg-neutral-950 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl">
              <MemoryDetail memoryId={id} onClose={handleClose} cardData={location.state?.cardData} />
            </div>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
