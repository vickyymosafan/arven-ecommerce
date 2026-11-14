import type { ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export interface SkipLinkProps {
  href?: string;
  children?: ReactNode;
  className?: string;
}

export function SkipLink({
  href = '#main-content',
  children = 'Skip to main content',
  className,
}: SkipLinkProps) {
  return (
    <a
      href={href}
      className={cn(
        'sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[var(--z-toast)]',
        'focus:inline-flex focus:min-h-11 focus:items-center focus:px-4 focus:py-2',
        'focus:rounded-[var(--radius-sm)] focus:bg-[var(--arven-accent-primary)] focus:text-[var(--arven-text-inverse)]',
        'focus:text-sm focus:font-semibold focus:tracking-[0.04em]',
        'focus:shadow-[var(--shadow-raised)]',
        className,
      )}
    >
      {children}
    </a>
  );
}
