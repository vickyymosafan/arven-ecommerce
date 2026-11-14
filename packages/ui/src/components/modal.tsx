'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import { IconClose } from './icons.js';

export type ModalSize = 'sm' | 'md' | 'lg';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: ModalSize;
  closeOnBackdropClick?: boolean;
  closeLabel?: string;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
};

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');
  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => !el.hasAttribute('aria-hidden'),
  );
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  size = 'md',
  closeOnBackdropClick = true,
  closeLabel = 'Close dialog',
  footer,
  children,
  className,
}: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousActiveRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    previousActiveRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const dialogNode = dialogRef.current;
    if (dialogNode) {
      const focusables = getFocusableElements(dialogNode);
      const firstTarget = focusables[0] ?? dialogNode;
      firstTarget.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key === 'Tab' && dialogRef.current) {
        const focusables = getFocusableElements(dialogRef.current);
        if (focusables.length === 0) {
          event.preventDefault();
          dialogRef.current.focus();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (!first || !last) {
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousActiveRef.current?.focus();
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        aria-hidden="true"
        onClick={closeOnBackdropClick ? onClose : undefined}
        className="fixed inset-0 bg-[var(--color-scrim-dark-72)]"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'relative z-10 flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-[var(--radius-md)] sm:rounded-[var(--radius-sm)]',
          'border border-control-border bg-elevated text-ink shadow-[var(--shadow-overlay)]',
          sizeClasses[size],
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4 sm:px-6">
          <div className="min-w-0 space-y-1">
            <h2 id={titleId} className="font-display text-2xl font-normal leading-tight text-ink">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="text-sm leading-relaxed text-ink-muted">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-transparent text-ink-muted hover:border-control-border hover:bg-panel hover:text-ink cursor-pointer"
          >
            <IconClose size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 sm:px-6">{children}</div>

        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-hairline bg-subtle px-5 py-4 sm:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export const Dialog = Modal;

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  side?: 'left' | 'right';
  closeLabel?: string;
  children: ReactNode;
  className?: string;
}

export function Drawer({
  isOpen,
  onClose,
  title,
  side = 'left',
  closeLabel = 'Close menu',
  children,
  className,
}: DrawerProps) {
  const titleId = useId();
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const previousActiveRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    previousActiveRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const node = drawerRef.current;
    if (node) {
      const focusables = getFocusableElements(node);
      (focusables[0] ?? node).focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousActiveRef.current?.focus();
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[var(--z-drawer)] flex">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 bg-[var(--color-scrim-dark-72)]"
      />
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'relative z-10 flex h-full w-full max-w-xs flex-col border-hairline bg-canvas text-ink shadow-[var(--shadow-overlay)]',
          side === 'right' ? 'ml-auto border-l' : 'mr-auto border-r',
          className,
        )}
      >
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <h2 id={titleId} className="font-display text-xl font-normal text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] border border-transparent text-ink-muted hover:border-control-border hover:bg-panel hover:text-ink cursor-pointer"
          >
            <IconClose size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}
