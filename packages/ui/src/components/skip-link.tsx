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
        'fixed top-3 left-3 z-[var(--z-toast)] inline-flex min-h-11 items-center px-4 py-2',
        'rounded-[var(--radius-xs)] bg-[var(--arven-accent-primary)] text-[var(--arven-text-inverse)]',
        'text-sm font-semibold tracking-[0.04em] shadow-[var(--shadow-raised)]',
        '-translate-y-[250%] focus:translate-y-0 focus-visible:translate-y-0',
        'transition-transform duration-[var(--duration-fast)] ease-[var(--ease-ui)]',
        className,
      )}
    >
      {children}
    </a>
  );
}
