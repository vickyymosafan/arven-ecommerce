'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, useState, type ReactNode } from 'react';
import {
  ArvenWordmark,
  Button,
  Divider,
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
  { href: '/shop', label: 'Shop' },
  { href: '/collections', label: 'Collections' },
  { href: '/search', label: 'Search' },
  { href: '/account', label: 'Account' },
  { href: '/auth/login', label: 'Sign In' },
];

const drawerSecondaryLinks: readonly NavLinkItem[] = [
  { href: '/account/addresses', label: 'Saved Addresses' },
  { href: '/account/sessions', label: 'Active Sessions' },
  { href: '/auth/register', label: 'Create Account' },
];

export interface StorefrontShellProps {
  children: ReactNode;
  narrow?: boolean;
}

function isNavHrefActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === '/' || href === '/account') {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function DesktopNavLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Primary storefront navigation" className="hidden items-center gap-2 lg:flex">
      {primaryNavLinks.map((item) => {
        const active = isNavHrefActive(pathname, item.href);
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
  );
}

function LiveDesktopNav() {
  const pathname = usePathname();
  return <DesktopNavLinks pathname={pathname} />;
}

function MobileDrawerNavContent({
  onClose,
  pathname,
}: {
  onClose: () => void;
  pathname: string | null;
}) {
  return (
    <div className="space-y-5">
      <nav aria-label="Mobile storefront navigation" className="flex flex-col gap-2">
        {primaryNavLinks.map((item) => {
          const active = isNavHrefActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              onClick={onClose}
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

      <Divider />

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-muted">
          Clientele Account
        </p>
        <div className="flex flex-col gap-2">
          {drawerSecondaryLinks.map((item) => {
            const active = isNavHrefActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                onClick={onClose}
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
        </div>
      </div>
    </div>
  );
}

function LiveMobileDrawerNavContent({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  return <MobileDrawerNavContent onClose={onClose} pathname={pathname} />;
}

export function StorefrontShell({ children, narrow = false }: StorefrontShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
              <span className="hidden border-l border-hairline pl-3 text-xs font-medium uppercase tracking-[0.06em] text-ink-muted sm:inline">
                Atelier
              </span>
            </Link>
          </div>

          <Suspense fallback={<DesktopNavLinks pathname={null} />}>
            <LiveDesktopNav />
          </Suspense>

          <div className="flex shrink-0 items-center gap-2">
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
        <Suspense
          fallback={
            <MobileDrawerNavContent
              onClose={() => setMobileMenuOpen(false)}
              pathname={null}
            />
          }
        >
          <LiveMobileDrawerNavContent onClose={() => setMobileMenuOpen(false)} />
        </Suspense>
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
        <div className="mx-auto flex w-full max-w-[var(--container-max)] flex-col gap-6 px-4 py-8 text-xs text-ink-muted sm:px-6 lg:px-12">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              <p className="font-medium uppercase tracking-[0.06em] text-ink">
                ARVEN. Beyond Trends. Beyond Time.
              </p>
              <p>
                Contemporary unisex apparel, footwear, and architectural accessories crafted in Jakarta.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/shop" className="inline-flex min-h-11 items-center px-1 text-link hover:underline">
                Shop All
              </Link>
              <Link href="/collections" className="inline-flex min-h-11 items-center px-1 text-link hover:underline">
                Collections
              </Link>
              <Link href="/search" className="inline-flex min-h-11 items-center px-1 text-link hover:underline">
                Search
              </Link>
              <Link href="/account" className="inline-flex min-h-11 items-center px-1 text-link hover:underline">
                My Account
              </Link>
              <Link href="/account/addresses" className="inline-flex min-h-11 items-center px-1 text-link hover:underline">
                Addresses
              </Link>
              <Link href="/account/sessions" className="inline-flex min-h-11 items-center px-1 text-link hover:underline">
                Sessions
              </Link>
              <Link href="/auth/login" className="inline-flex min-h-11 items-center px-1 text-link hover:underline">
                Sign In
              </Link>
              <Link href="/auth/register" className="inline-flex min-h-11 items-center px-1 text-link hover:underline">
                Register
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
