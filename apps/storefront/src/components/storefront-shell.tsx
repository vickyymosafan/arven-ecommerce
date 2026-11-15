'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import {
  ArvenWordmark,
  Button,
  Drawer,
  IconMenu,
  SkipLink,
  ThemeToggle,
  cn,
} from '@arven/ui';

interface NavLinkItem {
  href: string;
  label: string;
}

const primaryNavLinks: readonly NavLinkItem[] = [
  { href: '/', label: 'Home' },
  { href: '/account', label: 'Account' },
  { href: '/account/addresses', label: 'Addresses' },
  { href: '/account/sessions', label: 'Sessions' },
  { href: '/auth/login', label: 'Sign In' },
  { href: '/auth/register', label: 'Register' },
];

export interface StorefrontShellProps {
  children: ReactNode;
  narrow?: boolean;
}

export function StorefrontShell({ children, narrow = false }: StorefrontShellProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === '/' || href === '/account') {
      return pathname === href;
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <SkipLink href="#main-content" />

      <header className="sticky top-0 z-[var(--z-header)] border-b border-hairline bg-canvas/95 backdrop-blur-sm">
        <div className="mx-auto flex min-h-16 w-full max-w-[var(--container-max)] items-center justify-between gap-2 px-3 sm:gap-4 sm:px-6 lg:px-12">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <Link
              href="/"
              className="inline-flex min-h-11 items-center gap-3 rounded-[var(--radius-sm)] pr-1 sm:pr-2"
            >
              <ArvenWordmark />
              <span className="hidden border-l border-hairline pl-3 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-muted sm:inline">
                Clientele
              </span>
            </Link>
          </div>

          <nav aria-label="Primary storefront navigation" className="hidden items-center gap-1 lg:flex">
            {primaryNavLinks.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex min-h-11 items-center whitespace-nowrap rounded-[var(--radius-sm)] px-3 py-2 text-xs font-medium uppercase tracking-[0.06em] transition-colors',
                    active
                      ? 'bg-panel text-ink border border-control-border'
                      : 'text-ink-secondary hover:bg-subtle hover:text-ink',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <ThemeToggle defaultTheme="light" storageKey="arven-storefront-theme" />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-label="Menu"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden"
            >
              <IconMenu size={18} />
              <span className="hidden min-[360px]:inline">Menu</span>
            </Button>
          </div>
        </div>
      </header>

      <Drawer
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        title="ARVEN Navigation"
        side="right"
      >
        <nav aria-label="Mobile storefront navigation" className="flex flex-col gap-2">
          {primaryNavLinks.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  'inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border px-4 py-2.5 text-sm font-medium',
                  active
                    ? 'border-strong-border bg-panel text-ink'
                    : 'border-hairline bg-subtle text-ink-secondary hover:border-control-border hover:text-ink',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </Drawer>

      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          'mx-auto w-full flex-1 px-4 py-8 sm:px-6 lg:px-12 lg:py-12',
          narrow ? 'max-w-xl' : 'max-w-[var(--container-max)]',
        )}
      >
        {children}
      </main>

      <footer className="border-t border-hairline bg-subtle">
        <div className="mx-auto flex w-full max-w-[var(--container-max)] flex-col gap-4 px-4 py-8 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-12">
          <div className="space-y-1">
            <p className="font-medium uppercase tracking-[0.08em] text-ink">
              ARVEN. Beyond Trends. Beyond Time.
            </p>
            <p>
              Phase 02 Foundation: Customer registration, verification, addresses, and session controls.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/auth/login" className="inline-flex min-h-11 items-center text-link hover:underline">
              Sign In
            </Link>
            <Link href="/auth/register" className="inline-flex min-h-11 items-center text-link hover:underline">
              Create Account
            </Link>
            <Link href="/account" className="inline-flex min-h-11 items-center text-link hover:underline">
              My Account
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
