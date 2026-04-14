import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';

interface MobileDrawerProps {
  children: React.ReactNode;
  trigger: React.ReactNode;
  title?: string;
}

export function MobileDrawer({ children, trigger, title = 'Navigation' }: MobileDrawerProps) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  // Close on navigation
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        {trigger}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-40 data-[state=open]:animate-[overlay-in_200ms_ease] data-[state=closed]:animate-[overlay-out_150ms_ease]" />
        <Dialog.Content className="fixed top-0 left-0 bottom-0 w-64 bg-neutral-950 border-r border-neutral-800 z-50 flex flex-col overflow-hidden data-[state=open]:animate-[drawer-in_200ms_ease] data-[state=closed]:animate-[drawer-out_150ms_ease]">
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
