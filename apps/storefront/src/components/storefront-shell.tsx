'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import type { CartDto } from '@arven/contracts';
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
import { CART_UPDATED_EVENT, storefrontApi } from '@/lib/api-client';

interface NavLinkItem {
  href: string;
  label: string;
}

const primaryNavLinks: readonly NavLinkItem[] = [
  { href: '/', label: 'Home' },
  { href: '/shop', label: 'Shop' },
  { href: '/collections', label: 'Collections' },
  { href: '/showroom', label: 'Showroom' },
  { href: '/lookbook', label: 'Lookbook' },
  { href: '/journal', label: 'Journal' },
  { href: '/search', label: 'Search' },
  { href: '/cart', label: 'Bag' },
  { href: '/account', label: 'Account' },
  { href: '/auth/login', label: 'Sign In' },
];

const drawerSecondaryLinks: readonly NavLinkItem[] = [
  { href: '/showroom', label: 'Virtual Showroom' },
  { href: '/outfit-studio', label: 'Outfit Studio' },
  { href: '/account/outfits', label: 'Saved Outfits' },
  { href: '/account/orders', label: 'Order History' },
  { href: '/account/returns', label: 'Returns' },
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

function BagCountPill({ count }: { count: number | null }) {
  return (
    <span
      aria-hidden={count === null}
      className={cn(
        'inline-flex h-5 min-w-6 items-center justify-center rounded-[var(--radius-xs)] border px-1.5 font-mono text-[11px] leading-none tabular-nums transition-opacity duration-[var(--duration-fast)]',
        count === null
          ? 'border-transparent opacity-0'
          : count > 0
            ? 'border-strong-border bg-subtle text-ink'
            : 'border-hairline bg-subtle text-ink-muted',
      )}
    >
      {count ?? 0}
    </span>
  );
}

function DesktopNavLinks({
  pathname,
  bagCount,
}: {
  pathname: string | null;
  bagCount: number | null;
}) {
  return (
    <nav aria-label="Primary storefront navigation" className="hidden items-center gap-1 xl:gap-2 lg:flex">
      {primaryNavLinks.map((item) => {
        const active = isNavHrefActive(pathname, item.href);
        const isBag = item.href === '/cart';
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-sm)] px-2 py-2 text-xs font-medium uppercase tracking-[0.06em] transition-colors xl:px-3',
              active
                ? 'border border-control-border bg-panel text-ink'
                : 'text-ink-secondary hover:bg-subtle hover:text-ink',
            )}
          >
            <span>{item.label}</span>
            {isBag ? <BagCountPill count={bagCount} /> : null}
            {isBag && bagCount !== null ? (
              <span className="sr-only"> {bagCount === 1 ? 'item' : 'items'}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function LiveDesktopNav({ bagCount }: { bagCount: number | null }) {
  const pathname = usePathname();
  return <DesktopNavLinks pathname={pathname} bagCount={bagCount} />;
}

function MobileDrawerNavContent({
  onClose,
  pathname,
  bagCount,
}: {
  onClose: () => void;
  pathname: string | null;
  bagCount: number | null;
}) {
  return (
    <div className="space-y-5">
      <nav aria-label="Mobile storefront navigation" className="flex flex-col gap-2">
        {primaryNavLinks.map((item) => {
          const active = isNavHrefActive(pathname, item.href);
          const isBag = item.href === '/cart';
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              onClick={onClose}
              className={cn(
                'inline-flex min-h-11 items-center justify-between gap-2 rounded-[var(--radius-sm)] border px-4 py-2.5 text-sm font-medium',
                active
                  ? 'border-strong-border bg-panel text-ink'
                  : 'border-hairline bg-subtle text-ink-secondary hover:border-control-border hover:text-ink',
              )}
            >
              <span>{item.label}</span>
              {isBag ? (
                <span className="inline-flex items-center">
                  <BagCountPill count={bagCount} />
                  {bagCount !== null ? (
                    <span className="sr-only"> {bagCount === 1 ? 'item' : 'items'}</span>
                  ) : null}
                </span>
              ) : null}
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

function LiveMobileDrawerNavContent({
  onClose,
  bagCount,
}: {
  onClose: () => void;
  bagCount: number | null;
}) {
  const pathname = usePathname();
  return <MobileDrawerNavContent onClose={onClose} pathname={pathname} bagCount={bagCount} />;
}

export function StorefrontShell({ children, narrow = false }: StorefrontShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [bagCount, setBagCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    const refreshBagCount = () => {
      void storefrontApi
        .getCart()
        .catch(() => null)
        .then((cart) => {
          if (!active) return;
          setBagCount(cart ? cart.totalQuantity : 0);
        });
    };

    refreshBagCount();

    const handleCartUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<CartDto | undefined>;
      if (customEvent.detail && typeof customEvent.detail.totalQuantity === 'number') {
        setBagCount(customEvent.detail.totalQuantity);
        return;
      }
      refreshBagCount();
    };

    window.addEventListener(CART_UPDATED_EVENT, handleCartUpdated);
    return () => {
      active = false;
      window.removeEventListener(CART_UPDATED_EVENT, handleCartUpdated);
    };
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <SkipLink href="#main-content" />

      {/* Luxury Atelier Announcement Bar */}
      <div className="border-b border-hairline/80 bg-panel/90 px-4 py-2 text-center text-[11px] font-medium uppercase tracking-[0.12em] text-ink-secondary">
        <div className="mx-auto flex max-w-[var(--container-max)] items-center justify-between gap-4 px-2 sm:px-6 lg:px-12">
          <span className="hidden md:inline text-ink-muted">Atelier Jakarta · Est. 2026</span>
          <span className="mx-auto md:mx-0">
            Complimentary White-Glove Delivery Across Indonesia · Worldwide Insured Shipping
          </span>
          <span className="hidden md:inline font-mono text-[10px] uppercase text-ink-muted">
            Mon - Sat 09:00 - 21:00 WIB
          </span>
        </div>
      </div>

      <header className="sticky top-0 z-[var(--z-header)] border-b border-hairline/80 bg-canvas/85 backdrop-blur-md transition-colors">
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

          <Suspense fallback={<DesktopNavLinks pathname={null} bagCount={bagCount} />}>
            <LiveDesktopNav bagCount={bagCount} />
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
              bagCount={bagCount}
            />
          }
        >
          <LiveMobileDrawerNavContent
            onClose={() => setMobileMenuOpen(false)}
            bagCount={bagCount}
          />
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

      <footer className="border-t border-hairline bg-subtle/80">
        <div className="mx-auto flex w-full max-w-[var(--container-max)] flex-col gap-10 px-4 py-12 text-xs text-ink-muted sm:px-6 lg:px-12">
          <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-5">
              <div className="space-y-2">
                <p className="font-display text-xl font-normal tracking-[0.04em] text-ink">
                  ARVEN
                </p>
                <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
                  Beyond Trends. Beyond Time.
                </p>
              </div>
              <p className="max-w-md leading-relaxed text-ink-secondary">
                Contemporary unisex apparel, footwear, and architectural accessories crafted in Jakarta.
                Formulated through restrained monochromatic geometry and artisanal fiber weights.
              </p>
              <div className="flex items-center gap-2 pt-2 text-[11px] font-medium uppercase tracking-[0.1em] text-ink-muted">
                <span className="inline-block h-2 w-2 rounded-full bg-gold" aria-hidden="true" />
                <span>Atelier Jakarta · Hub JKT-MAIN-01</span>
              </div>
            </div>

            <div className="space-y-3 lg:col-span-2">
              <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink">
                Wardrobe
              </p>
              <ul className="flex flex-col gap-1.5">
                <li>
                  <Link href="/shop" className="inline-flex min-h-11 items-center text-ink-secondary hover:text-ink hover:underline">
                    Shop All
                  </Link>
                </li>
                <li>
                  <Link href="/collections" className="inline-flex min-h-11 items-center text-ink-secondary hover:text-ink hover:underline">
                    Collections
                  </Link>
                </li>
                <li>
                  <Link href="/search" className="inline-flex min-h-11 items-center text-ink-secondary hover:text-ink hover:underline">
                    Search Archive
                  </Link>
                </li>
                <li>
                  <Link href="/cart" className="inline-flex min-h-11 items-center text-ink-secondary hover:text-ink hover:underline">
                    Bag
                  </Link>
                </li>
              </ul>
            </div>

            <div className="space-y-3 lg:col-span-2">
              <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink">
                Experiences
              </p>
              <ul className="flex flex-col gap-1.5">
                <li>
                  <Link href="/showroom" className="inline-flex min-h-11 items-center text-ink-secondary hover:text-ink hover:underline">
                    3D Showroom
                  </Link>
                </li>
                <li>
                  <Link href="/outfit-studio" className="inline-flex min-h-11 items-center text-ink-secondary hover:text-ink hover:underline">
                    Outfit Studio
                  </Link>
                </li>
                <li>
                  <Link href="/lookbook" className="inline-flex min-h-11 items-center text-ink-secondary hover:text-ink hover:underline">
                    Lookbook
                  </Link>
                </li>
                <li>
                  <Link href="/journal" className="inline-flex min-h-11 items-center text-ink-secondary hover:text-ink hover:underline">
                    Journal
                  </Link>
                </li>
                <li>
                  <Link href="/about" className="inline-flex min-h-11 items-center text-ink-secondary hover:text-ink hover:underline">
                    About
                  </Link>
                </li>
              </ul>
            </div>

            <div className="space-y-3 lg:col-span-3">
              <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink">
                Clientele Care
              </p>
              <ul className="flex flex-col gap-1.5">
                <li>
                  <Link href="/account" className="inline-flex min-h-11 items-center text-ink-secondary hover:text-ink hover:underline">
                    My Account
                  </Link>
                </li>
                <li>
                  <Link href="/account/orders" className="inline-flex min-h-11 items-center text-ink-secondary hover:text-ink hover:underline">
                    Orders
                  </Link>
                </li>
                <li>
                  <Link href="/account/outfits" className="inline-flex min-h-11 items-center text-ink-secondary hover:text-ink hover:underline">
                    Saved Outfits
                  </Link>
                </li>
                <li>
                  <Link href="/account/returns" className="inline-flex min-h-11 items-center text-ink-secondary hover:text-ink hover:underline">
                    Returns
                  </Link>
                </li>
                <li>
                  <Link href="/account/addresses" className="inline-flex min-h-11 items-center text-ink-secondary hover:text-ink hover:underline">
                    Addresses
                  </Link>
                </li>
                <li>
                  <Link href="/account/sessions" className="inline-flex min-h-11 items-center text-ink-secondary hover:text-ink hover:underline">
                    Sessions
                  </Link>
                </li>
                <li className="flex items-center gap-3 pt-1">
                  <Link href="/auth/login" className="inline-flex min-h-11 items-center text-link hover:underline">
                    Sign In
                  </Link>
                  <span className="text-hairline">|</span>
                  <Link href="/auth/register" className="inline-flex min-h-11 items-center text-link hover:underline">
                    Register
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <Divider />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-ink-muted">
            <p>© 2026 ARVEN Atelier. All rights reserved. Jakarta, Indonesia.</p>
            <p className="font-mono text-[11px] tabular-nums">
              Currency: IDR (Rp) · All taxes included
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
